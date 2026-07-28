import { getAthleteByEmail, getAthleteByToken, verifyPassword } from "@/lib/db";
import { athleteLogIn, athleteLogOut } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  // Email + password (real accounts)
  if (email && password) {
    const athlete = getAthleteByEmail(email);
    if (!athlete || !verifyPassword(password, athlete.password_hash)) {
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
    const athlete = getAthleteByToken(token);
    if (!athlete) {
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
