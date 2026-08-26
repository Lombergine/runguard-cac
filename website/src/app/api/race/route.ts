import { localDay } from "@/lib/day";
import { resolveAthleteWithPath } from "@/lib/apiAuth";
import { createRace } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await resolveAthleteWithPath(request, body.athleteId ?? null);
  if (!auth) return Response.json({ error: "Not authorized" }, { status: 401 });
  const athlete = auth.athlete;

  // `.trim()` before the emptiness test, or `{name: "   "}` is a race whose name
  // is three spaces: it passes `!name`, stores, and renders as a blank row that
  // looks like missing data rather than like the bad input it was.
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  const event = typeof body.event === "string" ? body.event.trim().slice(0, 20) : "";
  const distanceM =
    typeof body.distanceM === "number" && Number.isFinite(body.distanceM) && body.distanceM > 0
      ? body.distanceM
      : null;

  // Optional, but a `location` that was sent and is not text was silently
  // dropped to null behind an `{ok: true}`.
  if (body.location !== undefined && body.location !== null && typeof body.location !== "string") {
    return Response.json({ error: "Location must be text." }, { status: 400 });
  }
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 120) || null : null;

  /*
   * The four detail fields, all optional and all validated the same way the
   * fields above are: absent is fine, present-and-wrong is a 400.
   *
   * The alternative — coercing whatever arrived and answering {ok:true} — is
   * the exact failure /api/race-result was rewritten to remove. A start time of
   * "quarter past nine" silently stored as null is a race a coach believes has
   * a gun time on file and which shows nothing on the day.
   */
  const COURSE_TYPES = ["Track", "Cross country", "Road", "Trail"];
  const PRIORITIES = ["A", "B", "C"];

  let startTime: string | null = null;
  if (body.startTime !== undefined && body.startTime !== null && body.startTime !== "") {
    // 24-hour HH:MM. Hours 0–23, minutes 00–59 — the same closed-set reasoning
    // as the M:SS guard on race times.
    if (typeof body.startTime !== "string" || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(body.startTime.trim())) {
      return Response.json({ error: "Start time must look like 09:30 or 16:05." }, { status: 400 });
    }
    startTime = body.startTime.trim();
  }

  let courseType: string | null = null;
  if (body.courseType !== undefined && body.courseType !== null && body.courseType !== "") {
    if (typeof body.courseType !== "string" || !COURSE_TYPES.includes(body.courseType)) {
      return Response.json(
        { error: `Course must be one of: ${COURSE_TYPES.join(", ")}.` },
        { status: 400 }
      );
    }
    courseType = body.courseType;
  }

  let priority: string | null = null;
  if (body.priority !== undefined && body.priority !== null && body.priority !== "") {
    if (typeof body.priority !== "string" || !PRIORITIES.includes(body.priority)) {
      return Response.json({ error: "Priority must be A, B or C." }, { status: 400 });
    }
    priority = body.priority;
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      return Response.json({ error: "Notes must be text." }, { status: 400 });
    }
    notes = body.notes.trim().slice(0, 1000) || null;
  }

  const missing: string[] = [];
  if (!name) missing.push("race name");
  if (!date) missing.push("a valid date");
  if (!event) missing.push("event");
  if (distanceM === null) missing.push("distance");
  if (missing.length) {
    return Response.json({ error: `Please fill in: ${missing.join(", ")}.` }, { status: 400 });
  }
  if (date < localDay()) {
    return Response.json({ error: "That race date is in the past — pick an upcoming date." }, { status: 400 });
  }

  const race = await createRace({
    name,
    date,
    event,
    distance_m: distanceM,
    location,
    start_time: startTime,
    course_type: courseType,
    priority,
    notes,
    /*
     * OWNERSHIP FOLLOWS WHO ASKED, NOT WHOSE PAGE IT WAS.
     *
     * A coach adding a race arrives here with an athleteId — that is how the
     * coach session scopes to their team — and the row was written as though
     * that one athlete had added it for themselves. Two things followed:
     * `upcomingRaces` only matches a personal race for its creator, so a meet
     * the coach entered appeared on exactly one athlete's calendar and nobody
     * else's; and the athlete it landed on could delete the team's race, while
     * the coach who created it could not edit their own typo.
     *
     * A coach-created race is a TEAM race: no personal creator, scoped by
     * team_id, which is the shape `upcomingRaces` already looks for and the
     * shape the seeder already writes.
     */
    created_by_athlete_id: auth.via === "coach" ? null : athlete.id,
    team_id: athlete.team_id,
  });
  return Response.json({ ok: true, race });
}
