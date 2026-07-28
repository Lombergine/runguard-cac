import { logIn } from "@/lib/session";
import { createTeam, getTeamByCoachEmail, hashPassword } from "@/lib/db";

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const coachName = typeof body.coachName === "string" ? body.coachName.trim() : "";
  const teamName = typeof body.teamName === "string" ? body.teamName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!coachName || !teamName || !email || !password) {
    return Response.json({ error: "Fill in every field." }, { status: 400 });
  }
  if (!emailOk(email)) {
    return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  }
  if (getTeamByCoachEmail(email)) {
    return Response.json({ error: "An account with that email already exists — log in instead." }, { status: 409 });
  }

  const team = createTeam({
    name: teamName,
    coach_name: coachName,
    coach_email: email,
    coach_password_hash: hashPassword(password),
  });
  await logIn(team.id);
  return Response.json({ ok: true, team: team.name, joinCode: team.join_code });
}
