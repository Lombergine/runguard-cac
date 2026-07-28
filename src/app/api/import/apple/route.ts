import { isLoggedIn, currentTeamId } from "@/lib/session";
import { insertActivity, upsertMetric, getAthlete } from "@/lib/db";
import { parseAppleHealthExport } from "@/lib/appleHealth";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await isLoggedIn())) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const athleteId = Number(form?.get("athleteId"));
  if (!(file instanceof File) || !Number.isInteger(athleteId)) {
    return Response.json(
      { error: "Upload an export.zip (or export.xml) and pick an athlete." },
      { status: 400 }
    );
  }
  // team-scope: coaches can only import for their own athletes
  const teamId = await currentTeamId();
  const target = getAthlete(athleteId);
  if (!target || (teamId && target.team_id && target.team_id !== teamId)) {
    return Response.json({ error: "That athlete isn't on your team." }, { status: 403 });
  }
  if (file.size > 400 * 1024 * 1024) {
    return Response.json(
      { error: "File is over 400 MB — export a smaller date range." },
      { status: 400 }
    );
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { workouts, metrics } = await parseAppleHealthExport(buf, file.name);
    let imported = 0;
    for (const w of workouts) {
      const ok = insertActivity({
        athlete_id: athleteId,
        source: "apple_export",
        external_id: w.externalId,
        name: w.type,
        type: w.type,
        start_time: w.start,
        distance_m: Math.round(w.distanceM),
        duration_s: w.durationS,
        avg_hr: w.avgHr,
      });
      if (ok) imported++;
    }
    for (const m of metrics) {
      upsertMetric({
        athlete_id: athleteId,
        date: m.date,
        resting_hr: m.restingHr,
        hrv: m.hrv,
        sleep_hours: m.sleepHours,
        vo2max: m.vo2max,
        resp_rate: m.respRate,
        spo2: m.spo2,
        wrist_temp: m.wristTemp,
        sleep_deep: m.sleepDeep,
        sleep_rem: m.sleepRem,
        sleep_light: m.sleepLight,
        sleep_awake: m.sleepAwake,
        source: "apple_export",
      });
    }
    return Response.json({
      ok: true,
      found: workouts.length,
      imported,
      metricsDays: metrics.length,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not parse that file." },
      { status: 400 }
    );
  }
}
