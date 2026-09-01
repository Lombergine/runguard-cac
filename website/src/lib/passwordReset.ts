/**
 * Password reset: issuing the link, and redeeming it.
 *
 * THE THREAT MODEL, because every decision below follows from it. A reset link
 * is a credential that bypasses the password. Whoever holds one owns the
 * account, so the design has to answer four questions:
 *
 *   Can it be guessed?      32 bytes of CSPRNG. No.
 *   Can it be stolen at rest? Only the SHA-256 is stored. A leaked table, a
 *                           mis-scoped query or a support screenshot yields
 *                           nothing usable.
 *   Can it be reused?       Redeemed with DELETE ... RETURNING, so exactly one
 *                           caller can win even if two arrive at once.
 *   How long is it worth?   One hour.
 *
 * And one more that is not about the token: does a reset actually recover the
 * account? Only if it evicts whoever is already in it — see the token_version
 * bump in `redeemReset`, without which the intruder's session keeps working.
 */
import crypto from "crypto";
import { one, run } from "./db/driver";
import { hashPassword } from "./db";

export const RESET_TTL_MINUTES = 60;

export type Subject = "athlete" | "coach";

/**
 * SHA-256, not scrypt, and that is not an inconsistency with how passwords are
 * stored. scrypt is slow on purpose because a password is low-entropy and
 * guessable. This is 256 bits of CSPRNG output — there is nothing to guess, so a
 * slow hash would buy no security and make every reset slower.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a reset for an account that has already been found. Returns the secret,
 * which is emailed and never stored.
 */
export async function issueReset(subject: Subject, subjectId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const nowS = Math.floor(Date.now() / 1000);

  // Abandoned and expired rows would otherwise accumulate forever; sweeping on
  // each new request keeps the table the size of what is actually outstanding
  // without needing a scheduled job.
  await run("DELETE FROM password_resets WHERE expires_at <= ?", [nowS]);

  // At most one live reset per account. Without this, every request adds a
  // working key, so a stack of old links stays valid for an hour after the
  // athlete has already used the newest one — and any of them still opens the
  // account. Requesting a reset should invalidate the previous request.
  await run("DELETE FROM password_resets WHERE subject = ? AND subject_id = ?", [
    subject,
    subjectId,
  ]);

  await run(
    "INSERT INTO password_resets (token_hash, subject, subject_id, expires_at) VALUES (?, ?, ?, ?)",
    [hashToken(token), subject, subjectId, nowS + RESET_TTL_MINUTES * 60]
  );
  return token;
}

/**
 * Spend a reset and set the new password. Returns which account it changed, or
 * null if the token was wrong, expired or already used — the caller renders one
 * message for all three, because distinguishing them tells an attacker whether a
 * token was ever real.
 *
 * Two writes, in this order and both required:
 *   1. the new password hash;
 *   2. `token_version + 1`, which is what makes this a recovery rather than a
 *      password change. Session tokens are stateless HMACs that carry their
 *      version, so bumping it stops every token issued before this moment from
 *      verifying — including the one held by whoever the athlete is locking out.
 */
export async function redeemReset(
  token: string,
  newPassword: string
): Promise<{ subject: Subject; subjectId: number } | null> {
  const nowS = Math.floor(Date.now() / 1000);

  // Read and consume in one statement. Two concurrent redemptions of the same
  // link both reach this line; only one DELETE can match a given row, so only
  // one gets a row back and the loser is indistinguishable from a stale link.
  const row = await one<{ subject: string; subject_id: number }>(
    "DELETE FROM password_resets WHERE token_hash = ? AND expires_at > ? RETURNING subject, subject_id",
    [hashToken(token), nowS]
  );
  if (!row) return null;

  const subject = row.subject === "athlete" ? "athlete" : row.subject === "coach" ? "coach" : null;
  if (!subject) return null;
  const subjectId = Number(row.subject_id);
  if (!Number.isInteger(subjectId)) return null;

  const hash = hashPassword(newPassword);
  if (subject === "athlete") {
    await run(
      "UPDATE athletes SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
      [hash, subjectId]
    );
  } else {
    await run(
      "UPDATE teams SET coach_password_hash = ?, token_version = token_version + 1 WHERE id = ?",
      [hash, subjectId]
    );
  }
  return { subject, subjectId };
}
