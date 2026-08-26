import { currentTeamId } from "@/lib/session";
import { getTeam, upsertTeamPlanDay, deleteTeamPlanDay } from "@/lib/db";

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day the coach could plausibly be planning. */
function validDate(d: unknown): d is string {
  if (typeof d !== "string" || !DATE_RE.test(d)) return false;
  // Reject dates the Date constructor would silently roll over — "2026-02-31"
  // matches the regex and becomes March 3, so a coach would write a session and
  // find it on a day they did not choose.
  const parsed = new Date(d + "T12:00:00");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

export async function POST(request: Request) {
  const teamId = await currentTeamId();
  if (teamId == null) {
    return Response.json({ error: "Sign in as a coach to edit the team calendar." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (!validDate(body.date)) {
    return Response.json({ error: "Need a real calendar date as YYYY-MM-DD." }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type.trim().slice(0, 80) : "";
  if (!type) {
    return Response.json(
      { error: "Give the session a name — “Easy run”, “6×800m”, “Rest”." },
      { status: 400 }
    );
  }

  /*
   * Distance in miles on the wire, metres in the column.
   *
   * The coach types miles because that is what an American high-school coach
   * says out loud, and every other distance in the database is metres. Doing the
   * conversion here rather than in the browser means a second client — the
   * phone, a script — cannot get the unit wrong in a way that stores a number
   * 1609× too small and renders as "0.0 mi".
   */
  let distanceM: number | null = null;
  if (body.distanceMi !== undefined && body.distanceMi !== null && body.distanceMi !== "") {
    const mi = typeof body.distanceMi === "number" ? body.distanceMi : Number(body.distanceMi);
    if (!Number.isFinite(mi) || mi < 0 || mi > 60) {
      return Response.json(
        { error: "Distance must be a number of miles between 0 and 60." },
        { status: 400 }
      );
    }
    // 0 is not a distance anyone planned; it is a rest day, and a rest day is
    // expressed by leaving this blank. Storing 0 would render as "0.0 mi".
    distanceM = mi > 0 ? mi * 1609.344 : null;
  }

  const text = (v: unknown, max: number): string | null =>
    typeof v === "string" ? v.trim().slice(0, max) || null : null;

  // Present-but-wrong is an error rather than a silent drop, the same rule the
  // race routes follow: a coach who pastes an object into "details" should find
  // out, not discover on Thursday that the team has no instructions.
  for (const [key, val] of [
    ["targetPace", body.targetPace],
    ["details", body.details],
    ["why", body.why],
  ] as const) {
    if (val !== undefined && val !== null && typeof val !== "string") {
      return Response.json({ error: `${key} must be text.` }, { status: 400 });
    }
  }

  const team = await getTeam(teamId);

  await upsertTeamPlanDay({
    team_id: teamId,
    date: body.date,
    type,
    distance_m: distanceM,
    target_pace: text(body.targetPace, 40),
    details: text(body.details, 1000),
    why: text(body.why, 500),
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
