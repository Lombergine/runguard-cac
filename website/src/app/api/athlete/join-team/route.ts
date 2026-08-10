import { resolveAthlete } from "@/lib/apiAuth";
import { getTeamByCode, setAthleteTeam } from "@/lib/db";

/** A solo athlete joins a team later by entering the coach's code. */
export async function POST(request: Request) {
  const athlete = await resolveAthlete(request);
  if (!athlete) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim() : "";
  if (!joinCode) {
    return Response.json({ error: "Enter your team code." }, { status: 400 });
  }
  const team = await getTeamByCode(joinCode);
  if (!team) {
    return Response.json({ error: "That team code doesn't match any team." }, { status: 404 });
  }
  await setAthleteTeam(athlete.id, team.id);
  return Response.json({ ok: true, team: team.name });
}

/** Leave the current team and go solo again. */
export async function DELETE(request: Request) {
  const athlete = await resolveAthlete(request);
  if (!athlete) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }
  await setAthleteTeam(athlete.id, null);
  return Response.json({ ok: true });
}
