/**
 * Everything a chart needs before it can be drawn: densifying, labelling,
 * converting to the units the athlete reads, and deciding whether there is
 * enough data to draw at all.
 *
 * The primitives in `components/chart/` know nothing about running. They take
 * `{ label, value }` and a domain. All the judgement lives here, in one file,
 * so the eight charts cannot each invent their own answer to "what counts as
 * enough" or "what does a missing day look like".
 *
 * ── Why densify ────────────────────────────────────────────────────────────
 * `sleep30` and `mental30` are SPARSE (`lib/types.ts:334-337`): a day with
 * nothing recorded is absent from the array entirely, not present with nulls.
 * Plotted as-is, a two-week hole draws as two adjacent columns and the picture
 * claims a fortnight that never existed. So every daily series is projected
 * onto a continuous local-day axis first, and days with no row become
 * `value: null` — the dashed unknown mark.
 *
 * `risk.series` is dense in normal operation (a day with no run is present
 * with `load: 0`), but it is densified too: `lib/types.ts:313` is explicit
 * that "a day genuinely missing from the array is unknown, not a rest day",
 * and the only way to honour that is to notice the day is missing.
 *
 * ── Why 30 days and not 60 ─────────────────────────────────────────────────
 * The website plots `series.slice(-60)`. Sixty columns across a phone is about
 * 5px per day, which is not an honest touch target — you cannot tap the day
 * you meant, and a readout you cannot aim is worse than no readout. Thirty
 * days at ~9px is aimable. The window is narrower than the desktop's on
 * purpose; the charts say so in their own axis labels.
 *
 * ── Why lib/ imports a type from components/ ───────────────────────────────
 * `ChartPoint` is declared in `components/chart/scales.ts`, which is pure
 * arithmetic with no React and no react-native import. Taking the contract
 * from the module that defines it beats restating it here and letting the two
 * drift.
 */
import { ChartPoint, paddedDomain, zeroBasedDomain } from "../components/chart/scales";
import { dayLabel, localDayOffset } from "./dates";
import { DailyPoint, Fitness, MentalDay, PrPoint, SleepDay } from "./types";
import { fmtDuration, KM_PER_MI, miNum } from "./units";

/* ══════════════════════════════════════════════════════════════════════ *
 * Thresholds
 *
 * One named constant per chart, each mirroring the website's own guard so the
 * two surfaces never disagree about whether an athlete has enough history.
 * Under any of these, the chart renders `<ChartAbsent>` — which is the app's
 * ordinary `Absent`, because "not enough data yet" IS the unknown case.
 * ══════════════════════════════════════════════════════════════════════ */

/** Non-null workload ratios. `charts.tsx:70` — `hasEnoughData(pts, 5)`. */
export const MIN_ACWR_POINTS = 5;
/** Days with load > 0. `charts.tsx:136`. */
export const MIN_LOAD_DAYS = 5;
/** Weeks with km > 0. `charts.tsx:227`. */
export const MIN_KM_WEEKS = 3;
/** Weeks with a pace. `charts.tsx:270`. */
export const MIN_PACE_WEEKS = 3;
/** Weeks of fitness score. `charts.tsx:319`. */
export const MIN_FITNESS_WEEKS = 3;
/** Nights with `hours` recorded. `charts.tsx:342`. */
export const MIN_SLEEP_NIGHTS = 5;
/** Days with energy OR motivation. `charts.tsx:398`. */
export const MIN_MENTAL_DAYS = 5;
/** PRs on the event. `charts.tsx:372` — one point is a chart worth drawing. */
export const MIN_PR_POINTS = 1;

/** Days on every daily chart's x axis. See the header. */
export const DAILY_DAYS = 30;

/** The website's `InsufficientData` default (`EmptyState.tsx:2`). */
const NOT_ENOUGH =
  "Not enough training history yet — sync more data or give it a couple of weeks.";
/** `website/src/lib/risk.ts:102`. */
const NOT_ENOUGH_ACWR =
  "Not enough training history yet for a reliable workload ratio — sync more data or give it a couple of weeks.";

/**
 * At least `min` entries are real. Mirrors `hasEnoughData`
 * (`website/src/components/EmptyState.tsx:19`) exactly, including its
 * tolerance of undefined input — these arrays are all optional on `Profile`.
 */
export function enough<T>(
  data: T[] | undefined | null,
  min = 5,
  isPresent: (d: T) => boolean = () => true,
): boolean {
  if (!Array.isArray(data)) return false;
  return data.filter(isPresent).length >= min;
}

/* ══════════════════════════════════════════════════════════════════════ *
 * The prepared shape
 * ══════════════════════════════════════════════════════════════════════ */

export type ChartSeries = {
  points: ChartPoint[];
  /** `[bottom, top]` — reversed for pace and PRs. See scales.ts. */
  domain: [number, number];
  ticks?: number[];
  tickFormat: (v: number) => string;
  /** Printed at the y-axis head. */
  unitLabel: string;
  /** The value phrase for point `i`, unit welded in. */
  readout: (i: number) => string;
  enough: boolean;
  /** The sentence `<ChartAbsent>` shows when `enough` is false. */
  absentLabel: string;
};

/* ══════════════════════════════════════════════════════════════════════ *
 * Densifying
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * Project a sparse, date-keyed series onto the last `count` local days,
 * oldest first. `row` is null for a day with nothing recorded.
 *
 * `now` is injectable only so the gallery and tests can pin a date; screens
 * pass nothing.
 */
function densify<T extends { date: string }>(
  rows: T[] | undefined,
  count: number,
  now = new Date(),
): { iso: string; row: T | null }[] {
  const by = new Map((rows ?? []).map((r) => [r.date, r]));
  const out: { iso: string; row: T | null }[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const iso = localDayOffset(back, now);
    out.push({ iso, row: by.get(iso) ?? null });
  }
  return out;
}

/**
 * The label for a weekly bucket.
 *
 * CAVEAT, and it is the one place this file cannot fully honour
 * non-negotiable #2: the server ships weekly buckets with `week` ALREADY
 * formatted ("Mar 3" — `website/src/lib/profile.ts:276`), and no ISO date
 * beside it, so the app has nothing to re-derive from. The label is at least
 * explicit and calendar-anchored rather than relative ("Mar 3", never "3 weeks
 * ago"), and the server anchors it at local noon so it cannot slip a day. If
 * the mobile payload ever grows an ISO week start, format it here with
 * `dayLabel` and delete this.
 */
function weekLabel(week: string): string {
  return week ? `Week of ${week}` : "Week not recorded";
}

const intTick = (v: number) => String(Math.round(v));

/* ══════════════════════════════════════════════════════════════════════ *
 * Weekly mileage — bars
 * ══════════════════════════════════════════════════════════════════════ */

export function weeklyKmSeries(
  weeks: { week: string; km: number }[] | undefined,
): ChartSeries {
  const rows = weeks ?? [];
  const points: ChartPoint[] = rows.map((w) => ({
    label: weekLabel(w.week),
    // KILOMETRES in, miles out. Nothing downstream ever sees a kilometre.
    value: Number.isFinite(w.km) ? miNum(w.km, 1) : null,
  }));
  return {
    points,
    domain: zeroBasedDomain(points.map((p) => p.value ?? 0)),
    tickFormat: intTick,
    unitLabel: "MI",
    readout: (i) => {
      const v = points[i]?.value;
      return v === null || v === undefined ? "Not recorded" : `${v} mi`;
    },
    enough: enough(rows, MIN_KM_WEEKS, (w) => w.km > 0),
    absentLabel: NOT_ENOUGH,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Weekly pace — line, small is up
 * ══════════════════════════════════════════════════════════════════════ */

export function paceSeries(
  season: { week: string; pace: number | null }[] | undefined,
): ChartSeries {
  const rows = season ?? [];
  // sec/km → sec/mi at the door, so the domain, the ticks and the readout are
  // all one unit and nothing downstream can mix them.
  const points: ChartPoint[] = rows.map((w) => ({
    label: weekLabel(w.week),
    value:
      w.pace !== null && Number.isFinite(w.pace) && w.pace > 0
        ? w.pace * KM_PER_MI
        : null,
  }));
  const vals = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const [lo, hi] = paddedDomain(vals, 0.25, 8);
  return {
    points,
    // Reversed by ORDER, not by a flag: a smaller pace is a faster one, and
    // faster belongs at the top. `[bottom, top]` = `[slowest, fastest]`.
    domain: [hi, lo],
    tickFormat: (v) => fmtDuration(v),
    unitLabel: "MIN /MI",
    readout: (i) => {
      const v = points[i]?.value;
      return v === null || v === undefined
        ? "Not recorded"
        : `${fmtDuration(v)} /mi`;
    },
    enough: enough(rows, MIN_PACE_WEEKS, (w) => w.pace !== null),
    absentLabel: NOT_ENOUGH,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Sleep — bars, with an 8h reference line the chart draws itself
 * ══════════════════════════════════════════════════════════════════════ */

export const SLEEP_TARGET_H = 8;

export function sleepSeries(
  sleep30: SleepDay[] | undefined,
  now = new Date(),
): ChartSeries {
  const days = densify(sleep30, DAILY_DAYS, now);
  const points: ChartPoint[] = days.map((d) => ({
    label: dayLabel(d.iso),
    /*
     * NOT PORTED, DELIBERATELY: `charts.tsx:343` does
     * `hours: d.hours ?? 0`, which draws a floor-height bar for a night
     * nobody measured — a blank rendering as a value, the exact failure the
     * visual spec exists to prevent. Here an unmeasured night stays null and
     * draws as the dashed unknown mark. Do not "restore" the website's
     * behaviour when comparing the two.
     */
    value: d.row && d.row.hours !== null ? d.row.hours : null,
  }));
  return {
    points,
    // The website's fixed [0, 10] (`charts.tsx:349`) — a sleep axis that
    // rescales to the data would make five hours look like a full night.
    domain: [0, 10],
    ticks: [0, 2, 4, 6, 8, 10],
    tickFormat: intTick,
    unitLabel: "HOURS",
    readout: (i) => {
      const v = points[i]?.value;
      return v === null || v === undefined
        ? "Not recorded"
        : `${v.toFixed(1)} h`;
    },
    enough: enough(sleep30, MIN_SLEEP_NIGHTS, (d) => d.hours !== null),
    absentLabel: NOT_ENOUGH,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Workload ratio — line, with a 0.8–1.3 band and a 1.5 line
 * ══════════════════════════════════════════════════════════════════════ */

export const ACWR_BAND: [number, number] = [0.8, 1.3];
export const ACWR_DANGER = 1.5;

export function acwrSeries(
  series: DailyPoint[] | undefined,
  now = new Date(),
): ChartSeries {
  const days = densify(series, DAILY_DAYS, now);
  const points: ChartPoint[] = days.map((d) => ({
    label: dayLabel(d.iso),
    // Two different unknowns collapse to the same null on purpose: no row for
    // the day, and a row whose ratio the engine could not compute yet
    // (`lib/types.ts:148`). Both mean "we don't know", and the athlete is owed
    // the same dashed mark for each.
    value: d.row && d.row.acwr !== null ? d.row.acwr : null,
  }));
  return {
    points,
    // The website's fixed scale and ticks (`charts.tsx:84-88`): the band edges
    // are the point of this chart, so they are labelled rather than nice.
    domain: [0, 2.2],
    ticks: [0.5, 0.8, 1.3, 1.5, 2],
    tickFormat: (v) => v.toFixed(1),
    unitLabel: "RATIO",
    readout: (i) => {
      const v = points[i]?.value;
      return v === null || v === undefined
        ? "Not recorded"
        : `${v.toFixed(2)} workload ratio`;
    },
    // Counted over the window actually drawn, not the website's 60.
    enough: enough(points, MIN_ACWR_POINTS, (p) => p.value !== null),
    absentLabel: NOT_ENOUGH_ACWR,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Daily load — bars, plus the two EWMA lines
 * ══════════════════════════════════════════════════════════════════════ */

export type LoadSeries = ChartSeries & {
  /** 7-day EWMA. Draw with `LinePath`. */
  acute: ChartPoint[];
  /** 28-day EWMA. */
  chronic: ChartPoint[];
};

/**
 * NOTE FOR THE CHART'S AGENT: feed this `profile.risk.series`, not the
 * top-level `series`. `/api/mobile/me` trims the top-level one to
 * `{date, load, km, acwr}` (`website/src/app/api/mobile/me/route.ts`), so the
 * acute and chronic lines would be silently empty.
 */
export function loadSeries(
  series: DailyPoint[] | undefined,
  now = new Date(),
): LoadSeries {
  const days = densify(series, DAILY_DAYS, now);
  const label = (iso: string) => dayLabel(iso);

  const points: ChartPoint[] = days.map((d) => ({
    label: label(d.iso),
    // A day present with load 0 is a MEASURED zero and draws as the solid
    // stub; a day missing from the payload is unknown and draws dashed.
    // `lib/types.ts:313`.
    value: d.row?.load ?? null,
  }));
  // `?? null`, not `d.row ? d.row.acute : null`. `DailyPoint` DECLARES `acute`
  // and `chronic`, but /api/mobile/me's trimmed top-level `series` does not
  // carry them — so a caller who wires `profile.series` here instead of
  // `profile.risk.series` hands us rows where the field is `undefined` while the
  // type insists it is a number. TypeScript cannot catch that: the lie is on the
  // wire, not in the code.
  //
  // Without the coalesce, `undefined` flows into `ChartPoint.value`, `LinePath`
  // splits on `=== null` and therefore treats the day as PRESENT, and
  // `frame.y(undefined)` is `NaN` — RNSVG gets a polyline of `NaN,NaN` and the
  // readout degrades to "0 load". A wrong picture, not an empty one, which is
  // the failure this whole module is built to prevent.
  const acute: ChartPoint[] = days.map((d) => ({
    label: label(d.iso),
    value: d.row?.acute ?? null,
  }));
  const chronic: ChartPoint[] = days.map((d) => ({
    label: label(d.iso),
    value: d.row?.chronic ?? null,
  }));

  const all = [...points, ...acute, ...chronic]
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  return {
    points,
    acute,
    chronic,
    domain: zeroBasedDomain(all),
    tickFormat: intTick,
    unitLabel: "LOAD",
    readout: (i) => {
      const l = points[i]?.value;
      const a = acute[i]?.value;
      const c = chronic[i]?.value;
      if (l === null || l === undefined) return "Not recorded";
      const parts = [`${Math.round(l)} load`];
      if (a !== null && a !== undefined) parts.push(`${Math.round(a)} acute`);
      if (c !== null && c !== undefined) parts.push(`${Math.round(c)} chronic`);
      return parts.join(" · ");
    },
    enough: enough(series, MIN_LOAD_DAYS, (d) => d.load > 0),
    absentLabel: NOT_ENOUGH,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Energy and motivation — two lines
 * ══════════════════════════════════════════════════════════════════════ */

export type MentalSeries = ChartSeries & {
  /** The second line. `points` is energy. */
  motivation: ChartPoint[];
};

export function mentalSeries(
  mental30: MentalDay[] | undefined,
  now = new Date(),
): MentalSeries {
  const days = densify(mental30, DAILY_DAYS, now);
  const label = (iso: string) => dayLabel(iso);

  /*
   * NOT PORTED, DELIBERATELY: `charts.tsx:422-423` sets `connectNulls` on both
   * lines, which draws a straight segment THROUGH every day the athlete did
   * not check in — the app inventing a mood it was never told. Here the nulls
   * survive into `ChartPoint.value`, `LinePath` breaks at each one, and
   * `AbsentMarks` says so on the axis. Do not "restore" `connectNulls`.
   */
  const energy: ChartPoint[] = days.map((d) => ({
    label: label(d.iso),
    value: d.row ? d.row.energy : null,
  }));
  const motivation: ChartPoint[] = days.map((d) => ({
    label: label(d.iso),
    value: d.row ? d.row.motivation : null,
  }));

  return {
    points: energy,
    motivation,
    domain: [0, 10],
    ticks: [0, 2, 4, 6, 8, 10],
    tickFormat: intTick,
    unitLabel: "1–10",
    readout: (i) => {
      const e = energy[i]?.value;
      const m = motivation[i]?.value;
      if ((e === null || e === undefined) && (m === null || m === undefined)) {
        return "Not recorded";
      }
      // "—" is this app's unknown glyph, so one missing half reads the same
      // way here as it does in every slot on every other screen. The scale is
      // welded on: a bare "7" out of context could be anything.
      return `energy ${e ?? "—"}/10 · motivation ${m ?? "—"}/10`;
    },
    enough: enough(
      mental30,
      MIN_MENTAL_DAYS,
      (d) => d.energy !== null || d.motivation !== null,
    ),
    absentLabel: NOT_ENOUGH,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Fitness score — line
 * ══════════════════════════════════════════════════════════════════════ */

export function fitnessSeries(
  weekly: Fitness["weekly"] | undefined,
): ChartSeries {
  const rows = weekly ?? [];
  const points: ChartPoint[] = rows.map((w) => ({
    label: weekLabel(w.week),
    value: Number.isFinite(w.score) ? w.score : null,
  }));
  return {
    points,
    // Fixed 0–100 (`charts.tsx:325`). The score is a model output on a fixed
    // scale; rescaling the axis to the data would turn three points of drift
    // into a mountain range.
    domain: [0, 100],
    ticks: [0, 25, 50, 75, 100],
    tickFormat: intTick,
    unitLabel: "SCORE",
    readout: (i) => {
      const v = points[i]?.value;
      return v === null || v === undefined
        ? "Not recorded"
        : `${Math.round(v)} fitness score`;
    },
    enough: enough(rows, MIN_FITNESS_WEEKS),
    absentLabel: NOT_ENOUGH,
  };
}

/* ══════════════════════════════════════════════════════════════════════ *
 * PR progression — step line, small is up
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * The one series with genuinely uneven dates. It is still plotted
 * categorically — as the website's own PR chart is (`charts.tsx:380`) — since
 * a handful of PRs spread over a season read better evenly spaced than bunched
 * at one end. Its labels ARE derived locally from ISO here, so unlike the
 * weekly charts this one is fully explicit.
 */
export function prSeries(points: PrPoint[] | undefined, event: string): ChartSeries {
  const rows = points ?? [];
  const pts: ChartPoint[] = rows.map((p) => ({
    label: dayLabel(p.date),
    value: Number.isFinite(p.timeS) ? p.timeS : null,
  }));
  const vals = pts.map((p) => p.value).filter((v): v is number => v !== null);
  // The website's PR padding: `Math.max(5, span * 0.3)` (`charts.tsx:375`).
  const [lo, hi] = paddedDomain(vals, 0.3, 5);
  return {
    points: pts,
    // Faster is a smaller time, and faster belongs at the top.
    domain: [hi, lo],
    tickFormat: (v) => fmtDuration(v),
    unitLabel: "MIN:SEC",
    readout: (i) => {
      const v = pts[i]?.value;
      return v === null || v === undefined
        ? "Not recorded"
        : `${fmtDuration(v)} · ${event} PR`;
    },
    enough: enough(rows, MIN_PR_POINTS),
    absentLabel: "No PRs logged yet for this event.",
  };
}
