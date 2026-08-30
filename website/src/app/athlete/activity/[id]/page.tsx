import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAthleteByToken, getActivityById, getAthlete, parseStream } from "@/lib/db";
import type { Split, SeriesSample } from "@/lib/db";
import { ActivityHrChart, ActivityElevChart } from "@/components/charts";
import { athleteTokenFromCookie, isDemoSession } from "@/lib/session";
import { demoTeamId } from "@/lib/demo";
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


/** Pace for one split, normalised to a full mile so the final partial mile is
 *  comparable to the rest rather than looking like a sprint. */
function splitPace(sp: Split): number {
  const frac = sp.partial > 0 ? sp.partial : 1;
  return sp.seconds / frac;
}

/**
 * Split table. The bar is scaled against the FASTEST mile, not
 * against a fixed maximum, so the shape of the run is legible whether it was
 * an even 8:00 grind or a progression run.
 */
function Splits({ splits }: { splits: Split[] }) {
  if (!splits.length) {
    return (
      <p className="text-sm rounded-2xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--surface)", color: "var(--ink-muted)" }}>
        Mile splits are not recorded for this run. The RunGuard app stores the
        totals Apple Health reports for a workout; the per-mile breakdown needs
        the sample series, which it does not collect yet.
      </p>
    );
  }
  const paces = splits.map(splitPace);
  const best = Math.min(...paces);
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="grid grid-cols-[2.4rem_4.2rem_1fr_3.2rem_3.4rem] gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide"
           style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--hairline)" }}>
        <div>Mi</div><div>Pace</div><div /><div className="text-right">HR</div><div className="text-right">Elev</div>
      </div>
      {splits.map((sp, i) => {
        const pace = paces[i];
        const width = Math.max(8, (best / pace) * 100);
        const isBest = pace === best;
        return (
          <div key={sp.mi} className="grid grid-cols-[2.4rem_4.2rem_1fr_3.2rem_3.4rem] gap-2 px-4 py-2 items-center text-sm"
               style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
            <div className="tabular-nums" style={{ color: "var(--ink-muted)" }}>
              {sp.partial < 0.98 ? sp.partial.toFixed(2).replace(/^0/, "") : sp.mi}
            </div>
            <div className="tabular-nums font-medium" style={{ color: "var(--ink)" }}>{fmtTime(pace)}</div>
            <div className="h-2.5 rounded-full" style={{ background: "var(--surface-2)" }}>
              <div className="h-2.5 rounded-full" style={{ width: `${width}%`, background: isBest ? "var(--status-good, #16a34a)" : "#2a78d6" }} />
            </div>
            <div className="text-right tabular-nums" style={{ color: "var(--ink-muted)" }}>
              {sp.avg_hr != null ? Math.round(sp.avg_hr) : "\u2014"}
            </div>
            <div className="text-right tabular-nums" style={{ color: "var(--ink-muted)" }}>
              {sp.elev_delta_m != null ? `${sp.elev_delta_m >= 0 ? "+" : ""}${Math.round(sp.elev_delta_m * 3.28084)}` : "\u2014"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function ActivityDetail({ params }: { params: Promise<{ id: string }> }) {
  const token = await athleteTokenFromCookie();
  const athlete = token ? await getAthleteByToken(token) : undefined;

  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) notFound();

  const activity = await getActivityById(activityId);
  if (!activity) notFound();

  /**
   * Two kinds of visitor reach this page. An athlete opening one of their own
   * runs, and a coach in the read-only demo who clicked a run from the athlete
   * tab of the roster. The demo coach carries no athlete cookie, so requiring
   * one bounced them to the athlete login in the middle of the demo.
   *
   * Let that coach through, but only for runs belonging to the sample team, and
   * only while the demo is actually on. Everyone else still gets the login.
   */
  const owner = await getAthlete(activity.athlete_id);
  const demoTeam = demoTeamId();
  const viaDemoCoach =
    !athlete && demoTeam !== null && owner?.team_id === demoTeam && (await isDemoSession());

  if (!athlete && !viaDemoCoach) redirect("/athlete/login");
  // ownership: an athlete can only open their own runs
  if (athlete && activity.athlete_id !== athlete.id) notFound();

  // Send the coach back to the roster page they came from, not the athlete app.
  const backHref = viaDemoCoach
    ? `/dashboard/athlete/${activity.athlete_id}?view=athlete`
    : "/athlete?tab=Home";

  const splits = parseStream<Split>(activity.splits);
  const hr = parseStream<SeriesSample>(activity.hr_series)
    .filter((p) => typeof p.bpm === "number")
    .map((p) => ({ t_s: p.t_s, bpm: p.bpm as number }));
  // Metres on the wire, feet on the screen — the rest of this page is imperial.
  const elev = parseStream<SeriesSample>(activity.elev_series)
    .filter((p) => typeof p.m === "number")
    .map((p) => ({ t_s: p.t_s, ft: (p.m as number) * 3.28084 }));

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
          <Link href={backHref} className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
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

        {/* splits */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>Mile splits</h2>
          <Splits splits={splits} />
        </div>

        {/* heart rate through the run */}
        {hr.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>Heart rate</h2>
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
              <ActivityHrChart data={hr} />
            </div>
          </div>
        )}

        {/* elevation profile */}
        {elev.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>Elevation</h2>
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
              <ActivityElevChart data={elev} />
            </div>
          </div>
        )}

        {/* route */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>Route</h2>
          <RouteMap route={activity.route ?? null} />
        </div>
      </main>
    </div>
  );
}
