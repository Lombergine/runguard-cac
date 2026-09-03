import { signTeam } from "@/lib/session";
import { getTeamByCoachEmail, verifyPassword } from "@/lib/db";
import { checkAuthRate, recordAuthFailure, tooManyAttempts } from "@/lib/rateLimit";

/**
 * Coach sign-in for the phone.
 *
 * The web equivalent is `/api/login`, and the ONLY difference is where the
 * credential goes: that route writes the signed session into an httpOnly
 * cookie, this one hands the identical string back so the app can store it in
 * the keychain and send it as `Authorization: Bearer`. Same `signTeam`, same
 * HMAC, same verifier (`verifyCoachToken`). There is no second coach scheme.
 *
 * There is deliberately NO password-only shortcut here. `/api/login` keeps one
 * for the seeded demo team, fenced behind local SQLite and a deliberately-set
 * COACH_PASSWORD; a shortcut that signs you in as team 1 has no business being
 * reachable from a shipped binary, and adding it would make the app the one
 * place that credential could be used from a network.
 *
 * Rate limited exactly as `/api/login` is — the same DB-backed (IP, account)
 * buckets — because this is the same password being guessed against the same
 * accounts, and a limiter the phone can walk around is not a limiter.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }

  // Before the lookup, so a throttled attempt never reaches scrypt and its 429
  // says nothing about whether the address belongs to a registered coach.
  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) return tooManyAttempts(gate.retryAfter);

  const team = await getTeamByCoachEmail(email);
  // Evaluated before the guard on purpose: short-circuiting on a missing team
  // would skip scrypt and time-leak which coach emails are registered.
  const ok = verifyPassword(password, team?.coach_password_hash);
  if (!team || !ok) {
    await recordAuthFailure(request, email);
    // One wording for both failures. "No account with that email" would turn
    // this endpoint into a roster of which coaches exist.
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  // The token is returned and never logged — not here, not by the app. It is
  // the whole credential, so treat any place it could be written down as a
  // place it has leaked.
  return Response.json({ token: signTeam(team.id, team.token_version), team: team.name });
}
