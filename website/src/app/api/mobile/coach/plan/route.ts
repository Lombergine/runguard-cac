import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { getTeam, teamPlanDays, upsertTeamPlanDay, deleteTeamPlanDay } from "@/lib/db";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar day the coach could plausibly be planning.
 *
 * Copied from `/api/team-plan`, including the reason: "2026-02-31" matches the
 * regex and the Date constructor silently rolls it over to March 3, so a coach
 * would write a session and then find it on a day they did not choose.
 */
function validDate(d: unknown): d is string {
  if (typeof d !== "string" || !DATE_RE.test(d)) return false;
  const parsed = new Date(d + "T12:00:00");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

/** Trim, cap, and treat an empty string as absence rather than as "". */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

/**
 * The coach's training calendar, for the native app.
 *
 * The JSON twin of `/dashboard/plan`, and the mobile counterpart to
 * `/api/team-plan` — which stays exactly as it is. That route reads the coach
 * COOKIE and is what the web calendar posts to; this one reads the coach TOKEN.
 * Neither delegates to the other, and that is deliberate: `/api/team-plan`'s
 * whole security argument is that it "never calls resolveAthlete and takes no
 * athleteId, so there is no parameter an athlete could send that would make it
 * act for a team". Adding a second auth path to it would weaken the claim its
 * own docblock makes. Two small routes, one sentence each, no shared surface.
 *
 * A written day REPLACES the generated template for every athlete on the team
 * (see the coach-wins note in engine.ts weeklyPlan), and clearing it hands the
 * day back to the generator. There is no third state: absence is the default,
 * and DELETE restores absence.
 */
export async function GET(request: Request) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to)) {
    return Response.json({ ok: false, error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to) {
    return Response.json({ ok: false, error: "from must not be after to" }, { status: 400 });
  }

  const days = await teamPlanDays(teamId, from, to);
  return Response.json({
    ok: true,
    from,
    to,
    // An object keyed by date rather than an array: the client draws a grid of
    // dates and needs to ask "is this day written?" per cell, not scan a list.
    days: Object.fromEntries(days),
  });
}

/** Write one day. */
export async function POST(request: Request) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const body = await request.json().catch(() => ({}));
  if (!validDate(body.date)) {
    return Response.json({ ok: false, error: "A valid date is required." }, { status: 400 });
  }
  const type = text(body.type, 80);
  if (!type) {
    return Response.json({ ok: false, error: "Give the session a name." }, { status: 400 });
  }

  // Distance arrives in METRES, matching the column and the rest of the wire.
  // Rejected rather than coerced when it is not a finite number: a silent 0
  // would print "0 mi" on fourteen athletes' phones as though it were planned.
  let distance_m: number | null = null;
  if (body.distanceM !== undefined && body.distanceM !== null) {
    const n = Number(body.distanceM);
    if (!Number.isFinite(n) || n < 0 || n > 200_000) {
      return Response.json({ ok: false, error: "That distance is not valid." }, { status: 400 });
    }
    distance_m = Math.round(n);
  }

  const team = await getTeam(teamId);

  await upsertTeamPlanDay({
    team_id: teamId,
    date: body.date,
    type,
    distance_m,
    target_pace: text(body.targetPace, 40),
    details: text(body.details, 2000),
    why: text(body.why, 2000),
    // Attributed to the account, never to a client-supplied name — otherwise a
    // coach could write a session onto the calendar under someone else's name.
    updated_by: team?.coach_name ?? null,
  });

  return Response.json({ ok: true });
}

/** Clear one day, handing it back to the generator. */
export async function DELETE(request: Request) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!validDate(date)) {
    return Response.json({ ok: false, error: "A valid date is required." }, { status: 400 });
  }
  // Team-scoped inside the statement, not by checking first — see db.ts.
  await deleteTeamPlanDay(teamId, date);
  return Response.json({ ok: true });
}
