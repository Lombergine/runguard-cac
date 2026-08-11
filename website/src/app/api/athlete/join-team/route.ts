import { resolveAthlete } from "@/lib/apiAuth";
import { checkAuthRate, recordAuthFailure } from "@/lib/rateLimit";
import { getTeamByCode, setAthleteTeam } from "@/lib/db";

/** A solo athlete joins a team later by entering the coach's code. */
export async function POST(request: Request) {
  const athlete = await resolveAthlete(request);
  if (!athlete) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  // A join code is a credential: `LELAND-XC26` is short, guessable, and a
  // correct guess puts a stranger on the roster where they can read the team.
  // So this gets the same treatment as a password field.
  //
  // The bucket is keyed on the ATHLETE, never on the submitted code — keying on
  // the guess would open a fresh counter per guess and count nothing. The
  // limiter pairs that with the caller's IP, so an attacker who rotates accounts
  // to refresh the per-account budget still runs into the shared per-IP one.
  // Gated after auth so an anonymous caller cannot spend a real athlete's quota.
  const bucket = `join-team:${athlete.id}`;
  const gate = await checkAuthRate(request, bucket);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfter / 60);
    return Response.json(
      { error: `Too many team-code attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim() : "";
  if (!joinCode) {
    return Response.json({ error: "Enter your team code." }, { status: 400 });
  }
  const team = await getTeamByCode(joinCode);
  if (!team) {
    // Only wrong guesses are charged, so an athlete who joins, leaves and
    // rejoins their own team never burns the budget.
    await recordAuthFailure(request, bucket);
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
