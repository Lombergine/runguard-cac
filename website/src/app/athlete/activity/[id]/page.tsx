import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAthleteByToken, getActivityById } from "@/lib/db";
import { athleteTokenFromCookie } from "@/lib/session";
import { fmtTime } from "@/lib/engine";
import { miNum, fmtMilesFromMeters } from "@/lib/units";

export const dynamic = "force-dynamic";

/** Nicely label the sync source. */
function sourceLabel(source: string): string {
  switch (source) {
    case "healthkit":
      return "Apple Watch";
    case "apple_export":
      return "Apple Health";
    case "seed":
      return "Sample data";
    default:
      return source;
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Try to render a GPS route as a normalized SVG polyline. Accepts a JSON array
 *  of [lat,lng] (or {lat,lng}/{lat,lon}) points stored on the activity. */
function RouteMap({ route }: { route: string | null }) {
  let pts: [number, number][] = [];
  if (route) {
    try {
      const parsed = JSON.parse(route);
      if (Array.isArray(parsed)) {
        pts = parsed
          .map((p): [number, number] | null => {
            if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])];
            if (p && typeof p === "object") {
              const lat = Number(p.lat ?? p.latitude);
              const lng = Number(p.lng ?? p.lon ?? p.longitude);
              if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
            }
            return null;
          })
          .filter((x): x is [number, number] => x !== null && Number.isFinite(x[0]) && Number.isFinite(x[1]));
      }
    } catch {
      pts = [];
    }
  }

  if (pts.length < 2) {
    return (
      <div
        className="rounded-2xl border p-6 text-sm text-center"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)", color: "var(--ink-muted)" }}
      >
        GPS route not recorded for this run.
      </div>
    );
  }

  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 600, H = 320, PAD = 20;
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  const path = pts
    .map(([lat, lng], i) => {
      const x = PAD + ((lng - minLng) / spanLng) * (W - 2 * PAD);
      // invert lat so north is up
      const y = PAD + (1 - (lat - minLat) / spanLat) * (H - 2 * PAD);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Run route">
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default async function ActivityDetail({ params }: { params: Promise<{ id: string }> }) {
  const token = await athleteTokenFromCookie();
  const athlete = token ? await getAthleteByToken(token) : undefined;
  if (!athlete) redirect("/athlete/login");

  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) notFound();

  const activity = await getActivityById(activityId);
  // ownership: an athlete can only open their own runs
  if (!activity || activity.athlete_id !== athlete.id) notFound();

  const km = activity.distance_m / 1000;
  const hasDistance = activity.distance_m > 0;
  const hasDuration = activity.duration_s > 0;
  const secPerKm = hasDistance && hasDuration ? activity.duration_s / km : null;
  const paceMi = secPerKm !== null ? `${fmtTime(secPerKm * 1.609344)}/mi` : "—";
  const elevationFt = activity.elevation_gain_m !== null ? Math.round(activity.elevation_gain_m * 3.28084) : null;

  const start = new Date(activity.start_time);
  const dateLine = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLine = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex-1" style={{ background: "var(--page)" }}>
      <header
        className="sticky top-0 z-20 border-b glass"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          <Link href="/athlete?tab=Home" className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
            ← Back
          </Link>
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
            {sourceLabel(activity.source)}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>
            {activity.name || activity.type || "Run"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
            {dateLine} · {timeLine}
          </p>
        </div>

        {/* headline numbers */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Distance" value={hasDistance ? fmtMilesFromMeters(activity.distance_m, 2) : "—"} />
          <Stat label="Time" value={hasDuration ? fmtTime(activity.duration_s) : "—"} />
          <Stat label="Avg pace" value={paceMi} />
        </div>

        {/* everything else */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Avg heart rate" value={activity.avg_hr !== null ? `${Math.round(activity.avg_hr)}` : "—"} sub={activity.avg_hr !== null ? "bpm" : "not recorded"} />
          <Stat label="Max heart rate" value={activity.max_hr !== null ? `${Math.round(activity.max_hr)}` : "—"} sub={activity.max_hr !== null ? "bpm" : "not recorded"} />
          <Stat label="Elevation gain" value={elevationFt !== null ? `${elevationFt}` : "—"} sub={elevationFt !== null ? "ft" : "not recorded"} />
          <Stat label="Calories" value={activity.calories !== null ? `${Math.round(activity.calories)}` : "—"} sub={activity.calories !== null ? "kcal" : "not recorded"} />
          <Stat label="Cadence" value={activity.cadence !== null ? `${Math.round(activity.cadence)}` : "—"} sub={activity.cadence !== null ? "spm" : "not recorded"} />
          <Stat label="Type" value={activity.type || "Run"} sub={`${miNum(km, 2)} mi total`} />
        </div>

        {/* route */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>Route</h2>
          <RouteMap route={activity.route ?? null} />
        </div>
      </main>
    </div>
  );
}
