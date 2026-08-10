import { athleteLogIn } from "@/lib/session";
import {
  createAthleteAccount,
  getAthleteByEmail,
  getTeamByCode,
  hashPassword,
} from "@/lib/db";

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim() : "";
  const grade = Number.isInteger(body.grade) ? body.grade : null;
  const eventGroup = typeof body.eventGroup === "string" ? body.eventGroup : "distance";

  if (!name || !email || !password) {
    return Response.json({ error: "Fill in your name, email, and password." }, { status: 400 });
  }
  if (!emailOk(email)) {
    return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  }

  // Team is OPTIONAL — an athlete can join solo and use the whole app alone.
  let teamId: number | null = null;
  let teamName: string | null = null;
  if (joinCode) {
    const team = await getTeamByCode(joinCode);
    if (!team) {
      return Response.json(
        { error: "That team code doesn't match any team. Leave it blank to join on your own." },
        { status: 404 }
      );
    }
    teamId = team.id;
    teamName = team.name;
  }

  if (await getAthleteByEmail(email)) {
    return Response.json({ error: "An account with that email already exists — log in instead." }, { status: 409 });
  }

  const athlete = await createAthleteAccount({
    name,
    email,
    password_hash: hashPassword(password),
    team_id: teamId,
    grade,
    event_group: eventGroup,
  });
  if (athlete.device_token) await athleteLogIn(athlete.device_token);
  return Response.json({
    ok: true,
    name: athlete.name,
    team: teamName,
    token: athlete.device_token, // lets the iOS app sign up directly
  });
}
