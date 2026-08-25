import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { run } from "@/lib/db/driver";

/**
 * Every optional field here used to be written as `<is it valid> ? it : null`,
 * which silently threw away anything the caller got wrong and still answered
 * `{ok: true}`. A typo'd answer became a lost answer that reported success:
 *
 *  - `feel: "amazing"` (or `"Great"`, or `5`) stored NULL. The three words are
 *    a closed set the client cannot discover, so the only signal that the answer
 *    was rejected was the answer quietly not being there afterwards.
 *  - `place: "3"` stored NULL — the website's own form runs the entry through
 *    `parseInt`, so one refactor away from sending the string is a lost place.
 *  - `date: "not-a-date"` did not store NULL; it filed the result under TODAY.
 *    A mistyped date silently became a different, plausible-looking fact.
 *
 * Absent still means "not reported" — these fields are genuinely optional and
 * omitting one is not an error. But a field that was SENT and cannot be stored
 * as sent is a 400, so the caller finds out.
 */
const FEELS = ["great", "ok", "rough"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const event = typeof body.event === "string" ? body.event.trim().slice(0, 20) : "";
  const timeS = typeof body.timeS === "number" && body.timeS > 30 && body.timeS < 7200 ? body.timeS : null;
  if (!event || timeS === null) {
    return Response.json({ error: "Need event and timeS (seconds)" }, { status: 400 });
  }

  let date = localDay();
  if (body.date !== undefined && body.date !== null) {
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return Response.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
    }
    date = body.date;
  }

  // A finishing position is a whole number from 1 up. 0, -3 and 2.5 were all
  // stored verbatim, and the results table renders `place ? "#"+place : ""`, so
  // a stored 0 came out as an empty cell — indistinguishable from never having
  // been reported.
  let place: number | null = null;
  if (body.place !== undefined && body.place !== null) {
    if (typeof body.place !== "number" || !Number.isInteger(body.place) || body.place < 1) {
      return Response.json(
        { error: "Finishing place must be a whole number, 1 or higher." },
        { status: 400 }
      );
    }
    place = body.place;
  }

  let feel: string | null = null;
  if (body.feel !== undefined && body.feel !== null) {
    if (typeof body.feel !== "string" || !FEELS.includes(body.feel)) {
      return Response.json(
        { error: `How it felt must be one of: ${FEELS.join(", ")}.` },
        { status: 400 }
      );
    }
    feel = body.feel;
  }

  let conditions: string | null = null;
  if (body.conditions !== undefined && body.conditions !== null) {
    if (typeof body.conditions !== "string") {
      return Response.json({ error: "Conditions must be text." }, { status: 400 });
    }
    // An empty string is not a condition anyone reported; store it as absent so
    // it cannot render as a blank that looks like an answer.
    conditions = body.conditions.trim().slice(0, 120) || null;
  }

  await run(
    `INSERT INTO race_results (athlete_id, event, date, time_s, place, feel, conditions)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [athlete.id, event, date, timeS, place, feel, conditions]
  );
  return Response.json({ ok: true });
}
