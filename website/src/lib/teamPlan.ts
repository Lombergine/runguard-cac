/**
 * Validation for one written day of the coach's training calendar.
 *
 * Lifted out of `/api/team-plan` so the phone's writer
 * (`/api/mobile/coach/plan`) enforces the SAME rules rather than a second set
 * that drifts. Two writers with two validators is how one client ends up able to
 * store a distance in metres, or a rest day as `0`, that the other refuses — and
 * the athlete sees whichever the database happened to get.
 *
 * The team id is deliberately NOT an input here. Both callers scope by their own
 * verified session (`currentTeamId()` on the web, `resolveCoachTeam()` on the
 * phone), and taking a team id as a parameter would invite one of them to take
 * it from the request body.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day the coach could plausibly be planning. */
export function validDate(d: unknown): d is string {
  if (typeof d !== "string" || !DATE_RE.test(d)) return false;
  // Reject dates the Date constructor would silently roll over — "2026-02-31"
  // matches the regex and becomes March 3, so a coach would write a session and
  // find it on a day they did not choose.
  const parsed = new Date(d + "T12:00:00");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

/** The columns of one planned day, ready for `upsertTeamPlanDay`. */
export type PlanDayFields = {
  date: string;
  type: string;
  distance_m: number | null;
  target_pace: string | null;
  details: string | null;
  why: string | null;
};

export type PlanDayParse =
  | { ok: true; value: PlanDayFields }
  | { ok: false; error: string };

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.trim().slice(0, max) || null : null;

/**
 * Parse a request body into one planned day, or say why it is not one.
 *
 * Returns the message verbatim to the caller's 400. Every rejection is a
 * sentence a coach can act on, because these forms surface `{ error }` directly.
 */
export function parsePlanDay(body: Record<string, unknown>): PlanDayParse {
  if (!validDate(body.date)) {
    return { ok: false, error: "Need a real calendar date as YYYY-MM-DD." };
  }

  const type = typeof body.type === "string" ? body.type.trim().slice(0, 80) : "";
  if (!type) {
    return { ok: false, error: "Give the session a name, “Easy run”, “6×800m”, “Rest”." };
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
      return { ok: false, error: "Distance must be a number of miles between 0 and 60." };
    }
    // 0 is not a distance anyone planned; it is a rest day, and a rest day is
    // expressed by leaving this blank. Storing 0 would render as "0.0 mi".
    distanceM = mi > 0 ? mi * 1609.344 : null;
  }

  // Present-but-wrong is an error rather than a silent drop, the same rule the
  // race routes follow: a coach who pastes an object into "details" should find
  // out, not discover on Thursday that the team has no instructions.
  for (const [key, val] of [
    ["targetPace", body.targetPace],
    ["details", body.details],
    ["why", body.why],
  ] as const) {
    if (val !== undefined && val !== null && typeof val !== "string") {
      return { ok: false, error: `${key} must be text.` };
    }
  }

  return {
    ok: true,
    value: {
      date: body.date,
      type,
      distance_m: distanceM,
      target_pace: text(body.targetPace, 40),
      details: text(body.details, 1000),
      why: text(body.why, 500),
    },
  };
}
