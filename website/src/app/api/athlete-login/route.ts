import { getAthleteByEmail, getAthleteByToken, verifyPassword } from "@/lib/db";
import { athleteLogIn, athleteLogOut } from "@/lib/session";
import { checkAuthRate, recordAuthFailure, tooManyAttempts } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  // Email + password (real accounts)
  if (email && password) {
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
    // athletes still authenticate downstream via their device token cookie
    const t = athlete.device_token;
    if (!t) {
      return Response.json({ error: "This account can't be opened yet — contact your coach." }, { status: 400 });
    }
    await athleteLogIn(t);
    return Response.json({ ok: true, name: athlete.name, token: t });
  }

  // Legacy / demo app-token path
  if (token) {
    // The bucket is keyed on the literal "device-token", never on the token that
    // was submitted: keying on the guess would open a fresh counter per guess and
    // count nothing, which is exactly the oracle this path was.
    const gate = await checkAuthRate(request, "device-token");
    if (!gate.allowed) return tooManyAttempts(gate.retryAfter);

    const athlete = await getAthleteByToken(token);
    if (!athlete) {
      await recordAuthFailure(request, "device-token");
      return Response.json(
        { error: "That token doesn't match any athlete. Try your email + password, or the demo token." },
        { status: 401 }
      );
    }
    await athleteLogIn(token);
    return Response.json({ ok: true, name: athlete.name });
  }

  return Response.json({ error: "Enter your email and password." }, { status: 400 });
}

export async function DELETE() {
  await athleteLogOut();
  return Response.json({ ok: true });
}
