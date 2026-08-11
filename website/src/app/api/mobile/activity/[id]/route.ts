import { resolveAthlete } from "@/lib/apiAuth";
import { getActivityById } from "@/lib/db";

/**
 * One activity's detail, for the app's run detail screen. The web equivalent is
 * `/athlete/activity/[id]`; this ships the same facts in raw form.
 *
 * UNITS — the app converts at the boundary, so every number here is the stored
 * SI/base unit and the field name says which:
 *   distanceM          metres
 *   durationS          seconds
 *   avgPaceSecPerKm    seconds per kilometre
 *   elevationGainM     metres        (the web page renders this as feet)
 *   avgHr / maxHr      bpm
 *   calories           kcal
 *   cadence            spm
 *   startTime          ISO 8601 datetime string, as stored
 *   route              [{lat, lng}, ...] in decimal degrees
 *
 * Nothing is coalesced. A missing average HR is `null`, never 0 — a blank must
 * never read as a healthy value, so the app has to be able to tell "not
 * recorded" from "recorded as zero".
 *
 * `route` is the raw coordinate list, not a pre-normalised SVG path: the app
 * redraws it in react-native-svg at a different aspect ratio and does its own
 * normalisation. It is `null` — never `[]` — when no usable route is stored, so
 * the app reads "no route recorded" rather than "a route with no points".
 *
 * No device token appears in this payload; the athlete row is used for the
 * ownership check only and is never echoed back.
 */

/** Nicely label the sync source. Mirrors the web activity page. */
function sourceLabel(source: string): string {
  switch (source) {
    case "healthkit":
      return "Apple Watch";
    case "apple_export":
      return "Apple Health";
    case "strava":
      return "Strava";
    case "seed":
      return "Sample data";
    default:
      return source;
  }
}

/**
 * The `route` column is a TEXT blob of JSON. Accept the same shapes the web page
 * does — `[lat,lng]` pairs, or objects with lat/latitude and lng/lon/longitude —
 * and return `null` unless at least two points survive, which is the same
 * threshold at which the web page says "GPS route not recorded".
 *
 * Points go out as `{lat, lng}`, never as a `[lat, lng]` tuple, even though the
 * column often stores tuples. Latitude and longitude are the same type, so a
 * transposed tuple draws a perfectly plausible route in the wrong hemisphere
 * with nothing to catch it — at 37.77,-122.42 the swap lands in the South
 * Atlantic and still renders a line. Naming the fields makes that a type error
 * on the app side instead of a wrong map.
 */
type RoutePoint = { lat: number; lng: number };

function parseRoute(route: string | null): RoutePoint[] | null {
  if (!route) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(route);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const pts = parsed
    .map((p): RoutePoint | null => {
      if (Array.isArray(p) && p.length >= 2) return { lat: Number(p[0]), lng: Number(p[1]) };
      if (p && typeof p === "object") {
        const o = p as Record<string, unknown>;
        return { lat: Number(o.lat ?? o.latitude), lng: Number(o.lng ?? o.lon ?? o.longitude) };
      }
      return null;
    })
    .filter((p): p is RoutePoint => p !== null && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return pts.length >= 2 ? pts : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The token's own athlete is the only correct answer here, so no client-supplied
  // athleteId is passed — there is nothing to scope this to but the bearer itself.
  const athlete = await resolveAthlete(request);
  if (!athlete) return Response.json({ error: "Invalid device token" }, { status: 401 });

  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) {
    return Response.json({ error: "Invalid activity id" }, { status: 400 });
  }

  // getActivityById is a bare lookup by primary key with no ownership check, so
  // the check has to happen here — same as the web page does. Someone else's
  // activity gets the same 404 as one that does not exist: a 403 would confirm
  // that a given id is a real run belonging to a real athlete, which turns this
  // endpoint into an enumeration oracle for another athlete's training history.
  const activity = await getActivityById(activityId);
  if (!activity || activity.athlete_id !== athlete.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const km = activity.distance_m / 1000;
  const avgPaceSecPerKm =
    activity.distance_m > 0 && activity.duration_s > 0 ? activity.duration_s / km : null;

  return Response.json({
    id: activity.id,
    source: activity.source,
    sourceLabel: sourceLabel(activity.source),
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
    route: parseRoute(activity.route ?? null),
  });
}
