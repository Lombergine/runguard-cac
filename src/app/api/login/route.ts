import { logIn } from "@/lib/session";
import { getTeamByCoachEmail, verifyPassword } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  // Demo shortcut: password-only login drops you into the demo team.
  if (!email && password === (process.env.COACH_PASSWORD || "milemarker")) {
    await logIn(1);
    return Response.json({ ok: true, demo: true });
  }

  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }
  const team = await getTeamByCoachEmail(email);
  if (!team || !verifyPassword(password, team.coach_password_hash)) {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  await logIn(team.id);
  return Response.json({ ok: true, team: team.name });
}
