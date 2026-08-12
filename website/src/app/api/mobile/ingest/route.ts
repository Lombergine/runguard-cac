import { getAthleteByToken, insertActivity, upsertMetric, AthleteRow } from "@/lib/db";

/**
 * The RunGuard iOS app posts HealthKit data here:
 *   { workouts?: [...], metrics?: [{ date, restingHr, hrv, sleepHours, vo2max, respRate }] }
 * Auth: Authorization: Bearer <device_token> (each athlete has one).
 */
async function athleteFromRequest(request: Request): Promise<AthleteRow | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  return (await getAthleteByToken(token)) ?? null;
}

/** A usable number, or null meaning NOT RECORDED. A string, a null, NaN and
 *  ±Infinity are all "we did not receive a reading" — never a value. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The same, but negative reads as not-recorded rather than as a measurement.
 * Every field this is used on — heart rate, HRV, hours asleep, VO2max,
 * respiratory rate, SpO2, calories, cadence — is a magnitude that cannot be
 * below zero, so a negative one is a broken sender, and storing it makes the
 * engine average nonsense into a baseline it then reports as fact.
 *
 * `wristTemp` is deliberately NOT run through this: Apple reports wrist
 * temperature as a deviation from the athlete's own baseline, so a negative
 * value there is a real, cooler-than-usual night.
 */
function nonNeg(v: unknown): number | null {
  const n = num(v);
  return n !== null && n >= 0 ? n : null;
}

export async function POST(request: Request) {
  const athlete = await athleteFromRequest(request);
  if (!athlete) {
    return Response.json({ error: "Invalid device token" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const workouts = Array.isArray(body?.workouts) ? body.workouts : [];
  const metrics = Array.isArray(body?.metrics) ? body.metrics : [];
  if (workouts.length === 0 && metrics.length === 0) {
    return Response.json(
      { error: "Expected { workouts: [...] } and/or { metrics: [...] }" },
      { status: 400 }
    );
  }

  let importedWorkouts = 0;
  let rejectedWorkouts = 0;
  for (const w of workouts.slice(0, 1000)) {
    const startMs = typeof w?.start === "string" ? new Date(w.start).getTime() : NaN;
    const durationS = num(w?.durationS);
    // An absent `distanceM` means a workout with no distance — a lift, a swim —
    // and 0 is the right value for those; the app sends 0 explicitly for them.
    // But a distance that is PRESENT and unreadable (a string, a null, NaN) must
    // never become 0. That would store "this athlete ran zero metres" as a
    // measured fact: a 5 km run would show as a 0.0 mi run in the log and
    // contribute nothing to the week, and because the insert dedupes on
    // (athlete_id, source, external_id) a corrected re-sync would not replace it.
    const distanceM = w?.distanceM === undefined ? 0 : num(w.distanceM);
    // `new Date("banana").toISOString()` THROWS, and this loop is not wrapped:
    // one unparseable timestamp anywhere in a 1000-workout page used to 500 the
    // whole request, abandoning every later workout in it, and the app retries
    // the same page forever. Checked here so a bad entry costs itself only.
    if (
      !Number.isFinite(startMs) ||
      durationS === null ||
      durationS < 0 ||
      distanceM === null ||
      distanceM < 0
    ) {
      rejectedWorkouts++;
      continue;
    }
    const ok = await insertActivity({
      athlete_id: athlete.id,
      source: "healthkit",
      external_id: typeof w.id === "string" ? w.id : `${w.start}-${w.durationS}`,
      name: typeof w.name === "string" ? w.name : "Workout",
      type: typeof w.type === "string" ? w.type : "Run",
      start_time: new Date(startMs).toISOString(),
      distance_m: distanceM,
      duration_s: durationS,
      avg_hr: nonNeg(w.avgHr),
      max_hr: nonNeg(w.maxHr),
      calories: nonNeg(w.calories),
      cadence: nonNeg(w.cadence),
    });
    if (ok) importedWorkouts++;
  }

  let importedMetrics = 0;
  let rejectedMetrics = 0;
  for (const m of metrics.slice(0, 800)) {
    const date = typeof m?.date === "string" ? m.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rejectedMetrics++;
      continue;
    }
    const row = {
      resting_hr: nonNeg(m.restingHr),
      hrv: nonNeg(m.hrv),
      sleep_hours: nonNeg(m.sleepHours),
      vo2max: nonNeg(m.vo2max),
      resp_rate: nonNeg(m.respRate),
      spo2: nonNeg(m.spo2),
      wrist_temp: num(m.wristTemp),
      sleep_deep: nonNeg(m.sleepDeep),
      sleep_rem: nonNeg(m.sleepRem),
      sleep_light: nonNeg(m.sleepLight),
    };
    // A day carrying nothing readable is not written at all.
    //
    // `upsertMetric` COALESCEs, so an all-null row cannot overwrite an existing
    // reading — but on a date with no row yet it CREATES one, and
    // `computeRecovery` (website/src/lib/risk.ts) reports
    // `hasData: metrics.length > 0`. An empty row therefore answers "does this
    // athlete have recovery data?" with yes while every value in it is null:
    // a row EXISTING mistaken for a question being ANSWERED. It also counted
    // itself as an imported metric, so the sync reported storing something it
    // had not stored.
    if (Object.values(row).every((v) => v === null)) {
      rejectedMetrics++;
      continue;
    }
    await upsertMetric({ athlete_id: athlete.id, date, ...row });
    importedMetrics++;
  }

  return Response.json({
    ok: true,
    imported: importedWorkouts, // back-compat
    importedWorkouts,
    importedMetrics,
    // Entries the server refused. Reported rather than dropped in silence:
    // `imported` alone cannot tell "the server already had this one" — the
    // insert is ON CONFLICT DO NOTHING, so a re-sync legitimately imports zero —
    // from "the server threw this one away", and a client that cannot tell them
    // apart cannot know its own data never landed.
    rejectedWorkouts,
    rejectedMetrics,
  });
}
