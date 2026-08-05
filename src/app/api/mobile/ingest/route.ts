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

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
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
  for (const w of workouts.slice(0, 1000)) {
    if (typeof w?.start !== "string" || typeof w?.durationS !== "number") continue;
    const ok = await insertActivity({
      athlete_id: athlete.id,
      source: "healthkit",
      external_id: typeof w.id === "string" ? w.id : `${w.start}-${w.durationS}`,
      name: typeof w.name === "string" ? w.name : "Workout",
      type: typeof w.type === "string" ? w.type : "Run",
      start_time: new Date(w.start).toISOString(),
      distance_m: num(w.distanceM) ?? 0,
      duration_s: w.durationS,
      avg_hr: num(w.avgHr),
      max_hr: num(w.maxHr),
      calories: num(w.calories),
      cadence: num(w.cadence),
    });
    if (ok) importedWorkouts++;
  }

  let importedMetrics = 0;
  for (const m of metrics.slice(0, 800)) {
    if (typeof m?.date !== "string") continue;
    const date = m.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    await upsertMetric({
      athlete_id: athlete.id,
      date,
      resting_hr: num(m.restingHr),
      hrv: num(m.hrv),
      sleep_hours: num(m.sleepHours),
      vo2max: num(m.vo2max),
      resp_rate: num(m.respRate),
      spo2: num(m.spo2),
      wrist_temp: num(m.wristTemp),
      sleep_deep: num(m.sleepDeep),
      sleep_rem: num(m.sleepRem),
      sleep_light: num(m.sleepLight),
    });
    importedMetrics++;
  }

  return Response.json({
    ok: true,
    imported: importedWorkouts, // back-compat
    importedWorkouts,
    importedMetrics,
  });
}
