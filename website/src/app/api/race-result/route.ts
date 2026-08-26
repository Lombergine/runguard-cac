import { localDay } from "@/lib/day";
import { resolveAthleteWithPath, isSelf, selfOnlyResponse } from "@/lib/apiAuth";
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
  const auth = await resolveAthleteWithPath(request, body.athleteId ?? null);
  if (!auth) return Response.json({ error: "Not authorized" }, { status: 401 });
  // Self-only: see the note on isSelf() in lib/apiAuth.ts.
  if (!isSelf(auth.via)) return selfOnlyResponse("log their own race result");
  const athlete = auth.athlete;

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

  /*
   * Splits.
   *
   * `race_results.splits` has existed since first release and the race-history
   * table renders it, but nothing except the seeder ever wrote it — so splits
   * were a column that only demo athletes had. Accepted here as an array of
   * numbers (seconds), stored as the JSON text the read path already parses.
   *
   * Validated rather than coerced, for the reason the header comment gives: a
   * mistyped split that silently vanishes is worse than a rejected one, because
   * race_results has no UPDATE path to fix it afterwards.
   */
  let splits: string | null = null;
  if (body.splits !== undefined && body.splits !== null) {
    if (!Array.isArray(body.splits)) {
      return Response.json({ error: "Splits must be a list of lap times." }, { status: 400 });
    }
    if (body.splits.length > 60) {
      return Response.json({ error: "That is more than 60 splits — check the entry." }, { status: 400 });
    }
    const bad = body.splits.some(
      (x: unknown) => typeof x !== "number" || !Number.isFinite(x) || x <= 0 || x > 3600
    );
    if (bad) {
      return Response.json(
        { error: "Each split must be a time between 0 and 60 minutes." },
        { status: 400 }
      );
    }
    // A sum wildly off the finishing time means the splits are for a different
    // race, or are cumulative when they should be per-lap. 10% either way is
    // generous enough for hand timing and tight enough to catch a real mistake.
    const total = (body.splits as number[]).reduce((a, b) => a + b, 0);
    if (body.splits.length > 0 && Math.abs(total - timeS) > timeS * 0.1) {
      return Response.json(
        {
          error: `Those splits add up to ${Math.round(total)}s but the finishing time is ${Math.round(
            timeS
          )}s. Enter each lap on its own, not a running total.`,
        },
        { status: 400 }
      );
    }
    splits = body.splits.length ? JSON.stringify(body.splits) : null;
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      return Response.json({ error: "Notes must be text." }, { status: 400 });
    }
    notes = body.notes.trim().slice(0, 1000) || null;
  }

  await run(
    `INSERT INTO race_results (athlete_id, event, date, time_s, place, feel, conditions, splits, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [athlete.id, event, date, timeS, place, feel, conditions, splits, notes]
  );
  return Response.json({ ok: true });
}
