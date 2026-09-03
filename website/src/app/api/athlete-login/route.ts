import { getAthleteByEmail, verifyPassword } from "@/lib/db";
import { athleteLogIn, athleteLogOut, signAthleteToken } from "@/lib/session";
import { checkAuthRate, recordAuthFailure, tooManyAttempts } from "@/lib/rateLimit";

/**
 * Athlete sign-in. Email and password, and nothing else.
 *
 * There used to be a second branch here that accepted a raw
 * `athletes.device_token` as a login credential. It is gone. That column was a
 * permanent, unrevocable secret for one minor's health data, and every place it
 * could be typed in was a place it could be phished, pasted or logged. What this
 * returns instead is `signAthleteToken(id)` — an HMAC over the athlete's id under
 * `SESSION_SECRET`, stored nowhere, so rotating that secret ends every session.
 *
 * The response body carries the token because the phone has no cookie jar and
 * must put it in the Keychain; the browser gets the same value in an httpOnly
 * cookie via `athleteLogIn`. One credential, two transports.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }

  // Checked before the lookup, so a throttled attempt never reaches scrypt and
  // its 429 says nothing about whether the address exists.
  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) return tooManyAttempts(gate.retryAfter);

  const athlete = await getAthleteByEmail(email);
  // Not `!athlete || verifyPassword(...)`: || would skip scrypt when no such
  // account exists, and the fast 401 tells an attacker the email is unused.
  const ok = verifyPassword(password, athlete?.password_hash);
  if (!athlete || !ok) {
    await recordAuthFailure(request, email);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await athleteLogIn(athlete.id);
  return Response.json({ ok: true, name: athlete.name, token: signAthleteToken(athlete.id, athlete.token_version) });
}

export async function DELETE() {
  await athleteLogOut();
  return Response.json({ ok: true });
}
