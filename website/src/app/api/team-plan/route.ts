import { currentTeamId } from "@/lib/session";
import { getTeam, upsertTeamPlanDay, deleteTeamPlanDay } from "@/lib/db";
import { parsePlanDay, validDate } from "@/lib/teamPlan";

/**
 * The coach's training calendar: write one day, or clear it.
 *
 * COACH-ONLY, BY CONSTRUCTION. This route never calls `resolveAthlete` and takes
 * no athleteId, so there is no parameter an athlete could send that would make
 * it act for a team. The only input to scope is `currentTeamId()`, which reads
 * the signed coach cookie — an athlete session simply produces null here and
 * gets a 401. That is stronger than checking `via !== "coach"` after resolving,
 * because there is no resolved athlete to get wrong.
 *
 * A written day replaces the generated template for EVERY athlete on the team
 * (see the coach-wins note in engine.ts weeklyPlan). Clearing it hands the day
 * back to the generator. There is no third state: absence is the default and
 * absence is what DELETE restores.
 */

// The body rules live in `lib/teamPlan.ts`, shared with the phone's writer at
// `/api/mobile/coach/plan`. One validator, so the two clients cannot store days
// the other would have refused.

export async function POST(request: Request) {
  const teamId = await currentTeamId();
  if (teamId == null) {
    return Response.json({ error: "Sign in as a coach to edit the team calendar." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parsePlanDay(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const team = await getTeam(teamId);

  await upsertTeamPlanDay({
    team_id: teamId,
    ...parsed.value,
    updated_by: team?.coach_name ?? null,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const teamId = await currentTeamId();
  if (teamId == null) {
    return Response.json({ error: "Sign in as a coach to edit the team calendar." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (!validDate(body.date)) {
    return Response.json({ error: "Need a real calendar date as YYYY-MM-DD." }, { status: 400 });
  }

  // Idempotent on purpose: clearing a day that was already clear is the state
  // the caller asked for, so it is a 200, not a 404.
  await deleteTeamPlanDay(teamId, body.date);
  return Response.json({ ok: true });
}
