import { mintCoachToken } from "@/lib/session";
import { getTeamByCoachEmail, verifyPassword } from "@/lib/db";
import { checkAuthRate, recordAuthFailure, tooManyAttempts } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Coach sign-in for the native app. Email + password → a coach token.
 *
 * The native twin of `/api/login`, and deliberately NOT that route with a flag:
 * `/api/login` finishes by calling `logIn()`, which sets an httpOnly cookie a
 * native client cannot read. Returning the value in the body is the whole
 * difference, and it is a difference worth its own file — a `?native=1` branch
 * on the web login would be one boolean away from handing the session string to
 * a browser fetch, which is precisely what httpOnly exists to prevent.
 *
 * WHAT THIS DOES NOT DO. There is no demo-password branch here. `/api/login`
 * has one (password-only, local SQLite, `COACH_PASSWORD` set deliberately) and
 * it stays there: it exists so a person can click into the sample team from a
 * browser, and a shipped binary is exactly where a convenience credential
 * should not be. A coach using the app signs in with their own account.
 *
 * The ordering below is copied from `/api/login` and matters:
 *   - the rate gate runs BEFORE the lookup, so a 429 says nothing about whether
 *     an address is a registered coach;
 *   - `verifyPassword` runs even when no team matched, because short-circuiting
 *     would skip scrypt and time-leak which emails exist.
 *
 * The token it returns is a full credential for the whole team's health data.
 * See `mintCoachToken` — Keychain only, never logged, never rendered.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return Response.json({ ok: false, error: "Enter your email and password." }, { status: 400 });
  }

  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) return tooManyAttempts(gate.retryAfter);

  const team = await getTeamByCoachEmail(email);
  const ok = verifyPassword(password, team?.coach_password_hash);
  if (!team || !ok) {
    await recordAuthFailure(request, email);
    return Response.json(
      { ok: false, error: "Email or password is incorrect." },
      { status: 401 }
    );
  }

  return Response.json({
    ok: true,
    token: mintCoachToken(team.id),
    team: team.name,
    coach: team.coach_name ?? null,
  });
}
