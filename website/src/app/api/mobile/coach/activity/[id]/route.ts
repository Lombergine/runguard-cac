import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { getActivityById, getAthlete, parseStream } from "@/lib/db";
import type { Split, SeriesSample } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * One run, opened from the coach's roster. The coach-scoped twin of
 * `/api/mobile/activity/[id]`.
 *
 * ── SCOPE IS TWO HOPS, AND BOTH MATTER ─────────────────────────────────────
 * `getActivityById` is a bare primary-key lookup with no ownership check, so
 * this route has to establish: the activity belongs to an athlete, AND that
 * athlete is on the token's team. Checking only the first would let any coach
 * read any run in the database by guessing an id.
 *
 * A run belonging to another team returns 404, not 403 — the same answer a
 * nonexistent id gets. A 403 would confirm that a given id is a real run
 * belonging to a real athlete, which turns this into an enumeration oracle for
 * another team's training history. That is the athlete route's reasoning,
 * applied one level out.
 *
 * ── THE PER-RUN STREAMS ────────────────────────────────────────────────────
 * `splits`, `hrSeries` and `elevSeries` are the three the deployed activity
 * page draws: mile splits with pace bars, a heart-rate trace, an elevation
 * profile.
 *
 * They were missing from the SQLite schema — declared on `ActivityRow`,
 * created by nothing, so `SELECT splits` errored on that driver and
 * `parseStream(undefined)` returned [], which the page renders as "not
 * recorded". Supabase has the columns and production draws all three, so the
 * gap was local-dev only and invisible: the feature simply looked unbuilt
 * against SQLite. `db/schema.sqlite.ts` now adds them.
 *
 * Metres on the wire for elevation, as everywhere else; the app converts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const activity = await getActivityById(activityId);
  if (!activity) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  // Second hop: the run's athlete must be on this coach's team.
  const owner = await getAthlete(activity.athlete_id);
  if (!owner || owner.team_id !== teamId) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const km = activity.distance_m / 1000;
  const avgPaceSecPerKm =
    activity.distance_m > 0 && activity.duration_s > 0 ? activity.duration_s / km : null;

  return Response.json({
    ok: true,
    // Whose run this is, so the screen can name them. A detail surface that
    // cannot say whose data it shows is the failure § "Coach dashboard" calls
    // the one that must never be misread.
    athlete: { id: owner.id, name: owner.name, hue: owner.avatar_hue },
    activity: {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      startTime: activity.start_time,
      distanceM: activity.distance_m,
      durationS: activity.duration_s,
      avgPaceSecPerKm,
      avgHr: activity.avg_hr,
      maxHr: activity.max_hr,
      elevationGainM: activity.elevation_gain_m,
      calories: activity.calories,
      cadence: activity.cadence,
      splits: parseStream<Split>(activity.splits),
      // `bpm` and `m` are optional on SeriesSample, so each stream is filtered
      // to the points that actually carry its own field. A sample with neither
      // is a gap, not a zero, and a chart must not close over it as one.
      hrSeries: parseStream<SeriesSample>(activity.hr_series)
        .filter((p) => typeof p.bpm === "number")
        .map((p) => ({ tS: p.t_s, bpm: p.bpm as number })),
      elevSeries: parseStream<SeriesSample>(activity.elev_series)
        .filter((p) => typeof p.m === "number")
        .map((p) => ({ tS: p.t_s, m: p.m as number })),
    },
  });
}
