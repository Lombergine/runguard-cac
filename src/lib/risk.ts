import { localDay } from "./day";
import { HR_MAX_DEFAULT, resolveHrMax, type HrMaxResolution, type HrMaxAthlete } from "./hrmax";
import { ActivityRow, MetricRow } from "./db";

/**
 * RunGuard risk engine.
 *
 * Training load model: session load ≈ sRPE = duration (min) × intensity (1–10).
 * Intensity is estimated from average heart rate when available, as a fraction
 * of that athlete's own HRmax (see src/lib/hrmax.ts — set by them, detected from
 * their history, or estimated from their age), otherwise from pace, otherwise a
 * moderate default.
 *
 * ACWR (acute:chronic workload ratio) uses exponentially weighted moving
 * averages: acute ≈ 7-day, chronic ≈ 28-day (Williams et al. 2017 EWMA method).
 * The sweet spot is ~0.8–1.3; risk rises sharply above 1.5.
 */

export type DayLoad = {
  date: string; // YYYY-MM-DD
  load: number;
  km: number;
  minutes: number;
};

export type RecoverySnapshot = {
  restingHr: number | null;
  restingHrBaseline: number | null;
  restingHrDelta: number | null; // recent minus baseline (bpm)
  hrv: number | null;
  hrvBaseline: number | null;
  hrvDeltaPct: number | null;
  sleepAvg: number | null; // hours, last 7 days
  vo2max: number | null;
  hasData: boolean;
};

/** One dated soreness report, as stored in `checkin_soreness`. */
export type SorenessReport = {
  date: string; // YYYY-MM-DD
  body_part: string;
  severity: number; // 0–10
};

/**
 * What the athlete has been telling us, over the last 7 days rather than just
 * today. Every other input infers strain from training data; this is the athlete
 * directly reporting that something hurts.
 *
 * It contributes NO points to the score — check-ins are optional, so scoring
 * them would rank honest reporters above quiet ones. It rides alongside the
 * score as its own flag instead. See the self-report block in computeRisk.
 */
export type SelfReport = {
  hasData: boolean;
  /** worst severity reported today, 0 if nothing reported */
  todayMax: number;
  /** the body part carrying that worst severity today */
  todayPart: string | null;
  /** the body part reported most often in the window */
  persistentPart: string | null;
  /** how many distinct days that part was reported sore, last 7 */
  persistentDays: number;
  /** peak severity for that part in the window */
  persistentPeak: number;
  /** true when that part's severity is trending upward across its reports */
  escalating: boolean;
  /** days since any check-in at all — null if never */
  daysSinceReport: number | null;
};

export type RiskSnapshot = {
  score: number; // 0–100
  zone: "ready" | "caution" | "high";
  zoneLabel: string;
  selfReport: SelfReport;
  /** the max heart rate every intensity in this snapshot was scored against */
  hrMax: HrMaxResolution;
  acwr: number | null;
  acute: number;
  chronic: number;
  weekKm: number;
  prevWeekKm: number;
  rampPct: number | null; // week-over-week mileage change
  monotony: number | null;
  strain: number | null;
  daysSinceRest: number;
  lastActivity: string | null; // ISO date of last activity
  recovery: RecoverySnapshot;
  insights: string[];
  hasActivityHistory: boolean; // false = brand-new athlete, no real data yet — don't show fabricated-looking numbers
};

export type DailyPoint = DayLoad & {
  acute: number;
  chronic: number;
  acwr: number | null;
};

const DAY_MS = 86400000;

export const NOT_ENOUGH_ACWR_HISTORY =
  "Not enough training history yet for a reliable workload ratio — sync more data or give it a couple of weeks.";

export function isoDay(d: Date): string {
  return localDay(d);
}

export function estimateIntensity(a: ActivityRow, hrMax: number = HR_MAX_DEFAULT): number {
  if (a.avg_hr && a.avg_hr > 60) {
    // % of this athlete's own HRmax → map 50%..95% to 2..10
    const pct = Math.min(0.98, a.avg_hr / hrMax);
    return Math.max(1, Math.min(10, ((pct - 0.5) / 0.45) * 8 + 2));
  }
  if (a.distance_m > 0 && a.duration_s > 0) {
    const paceSecPerKm = a.duration_s / (a.distance_m / 1000);
    // 3:00/km → 10, 7:30/km → 3
    const x = (450 - paceSecPerKm) / (450 - 180);
    return Math.max(2, Math.min(10, 3 + x * 7));
  }
  return 5;
}

export function sessionLoad(a: ActivityRow, hrMax: number = HR_MAX_DEFAULT): number {
  const minutes = a.duration_s / 60;
  return minutes * estimateIntensity(a, hrMax);
}

/** Group activities into per-day loads over the trailing `days` window ending at `end`. */
export function dailySeries(
  activities: ActivityRow[],
  days: number,
  end: Date = new Date(),
  hrMax: number = HR_MAX_DEFAULT
): DayLoad[] {
  const map = new Map<string, DayLoad>();
  for (let i = days - 1; i >= 0; i--) {
    const d = isoDay(new Date(end.getTime() - i * DAY_MS));
    map.set(d, { date: d, load: 0, km: 0, minutes: 0 });
  }
  for (const a of activities) {
    // Bucket by the local calendar day the run happened on. The map keys are
    // local days and `start_time` is a UTC timestamp, so slicing its string
    // would file an evening run under tomorrow.
    const d = localDay(new Date(a.start_time));
    const slot = map.get(d);
    if (!slot) continue;
    slot.load += sessionLoad(a, hrMax);
    slot.km += a.distance_m / 1000;
    slot.minutes += a.duration_s / 60;
  }
  return [...map.values()];
}

/** EWMA-based acute/chronic series over a daily load series. */
export function acwrSeries(daily: DayLoad[]): DailyPoint[] {
  const la = 2 / (7 + 1);
  const lc = 2 / (28 + 1);
  let acute = 0;
  let chronic = 0;
  let seeded = false;
  const out: DailyPoint[] = [];
  for (const d of daily) {
    if (!seeded) {
      acute = d.load;
      chronic = d.load;
      seeded = true;
    } else {
      acute = d.load * la + acute * (1 - la);
      chronic = d.load * lc + chronic * (1 - lc);
    }
    const acwr = chronic > 25 ? acute / chronic : null; // need a real base to be meaningful
    out.push({ ...d, acute, chronic, acwr });
  }
  return out;
}

function round(n: number, p = 1): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

function median(xs: number[]): number | null {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Recovery snapshot from Apple Health daily metrics.
 * Recent = last 5 days; baseline = the 28 days before that (the athlete's norm).
 * Elevated resting HR + suppressed HRV are classic early overtraining / illness
 * signals that show up before performance drops.
 */
export function computeRecovery(
  metrics: MetricRow[],
  now: Date = new Date()
): RecoverySnapshot {
  const dayOf = (d: string) =>
    Math.round((now.getTime() - new Date(d + "T12:00:00").getTime()) / DAY_MS);

  const recentRHR: number[] = [];
  const baseRHR: number[] = [];
  const recentHRV: number[] = [];
  const baseHRV: number[] = [];
  const recentSleep: number[] = [];
  let vo2max: number | null = null;
  let vo2maxDay = Infinity;

  for (const m of metrics) {
    const ago = dayOf(m.date);
    if (m.resting_hr != null) {
      if (ago <= 5) recentRHR.push(m.resting_hr);
      else if (ago <= 33) baseRHR.push(m.resting_hr);
    }
    if (m.hrv != null) {
      if (ago <= 5) recentHRV.push(m.hrv);
      else if (ago <= 33) baseHRV.push(m.hrv);
    }
    if (m.sleep_hours != null && ago <= 7) recentSleep.push(m.sleep_hours);
    if (m.vo2max != null && ago < vo2maxDay) {
      vo2max = m.vo2max;
      vo2maxDay = ago;
    }
  }

  const restingHr = median(recentRHR);
  const restingHrBaseline = median(baseRHR);
  const hrv = median(recentHRV);
  const hrvBaseline = median(baseHRV);
  const sleepAvg =
    recentSleep.length
      ? recentSleep.reduce((s, x) => s + x, 0) / recentSleep.length
      : null;

  return {
    restingHr: restingHr !== null ? round(restingHr) : null,
    restingHrBaseline: restingHrBaseline !== null ? round(restingHrBaseline) : null,
    restingHrDelta:
      restingHr !== null && restingHrBaseline !== null
        ? round(restingHr - restingHrBaseline)
        : null,
    hrv: hrv !== null ? round(hrv) : null,
    hrvBaseline: hrvBaseline !== null ? round(hrvBaseline) : null,
    hrvDeltaPct:
      hrv !== null && hrvBaseline !== null && hrvBaseline > 0
        ? Math.round(((hrv - hrvBaseline) / hrvBaseline) * 100)
        : null,
    sleepAvg: sleepAvg !== null ? round(sleepAvg) : null,
    vo2max: vo2max !== null ? round(vo2max) : null,
    hasData: metrics.length > 0,
  };
}

/**
 * Collapse a window of soreness reports into the handful of things that matter:
 * how bad it is today, and whether one area keeps coming back and getting worse.
 * A single sore day is noise. The same shin, five days running, climbing from
 * 4 to 7, is how a running injury announces itself.
 */
export function summarizeSelfReport(
  reports: SorenessReport[],
  now: Date = new Date()
): SelfReport {
  const empty: SelfReport = {
    hasData: false,
    todayMax: 0,
    todayPart: null,
    persistentPart: null,
    persistentDays: 0,
    persistentPeak: 0,
    escalating: false,
    daysSinceReport: null,
  };
  if (!reports.length) return empty;

  const today = isoDay(now);
  const from = isoDay(new Date(now.getTime() - 6 * DAY_MS));
  const window = reports.filter((r) => r.date >= from && r.date <= today);

  const lastDate = reports.reduce((m, r) => (r.date > m ? r.date : m), reports[0].date);
  const daysSinceReport = Math.max(
    0,
    Math.round((new Date(today + "T12:00:00").getTime() - new Date(lastDate + "T12:00:00").getTime()) / DAY_MS)
  );
  if (!window.length) return { ...empty, hasData: true, daysSinceReport };

  const todays = window.filter((r) => r.date === today);
  const todayWorst = todays.reduce<SorenessReport | null>(
    (m, r) => (!m || r.severity > m.severity ? r : m),
    null
  );

  // the part reported on the most distinct days; ties broken by peak severity
  const byPart = new Map<string, SorenessReport[]>();
  for (const r of window) {
    if (r.severity <= 0) continue;
    byPart.set(r.body_part, [...(byPart.get(r.body_part) ?? []), r]);
  }
  let persistentPart: string | null = null;
  let best: SorenessReport[] = [];
  for (const [part, rs] of byPart) {
    const days = new Set(rs.map((r) => r.date)).size;
    const bestDays = new Set(best.map((r) => r.date)).size;
    const peak = Math.max(...rs.map((r) => r.severity));
    const bestPeak = best.length ? Math.max(...best.map((r) => r.severity)) : -1;
    if (days > bestDays || (days === bestDays && peak > bestPeak)) {
      persistentPart = part;
      best = rs;
    }
  }

  // escalating = the mean of the later half of that part's reports is at least a
  // point above the earlier half. Needs 3+ reports so one bad morning can't fire it.
  let escalating = false;
  if (best.length >= 3) {
    const ordered = [...best].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(ordered.length / 2);
    const mean = (xs: SorenessReport[]) => xs.reduce((s, r) => s + r.severity, 0) / xs.length;
    escalating = mean(ordered.slice(mid)) - mean(ordered.slice(0, mid)) >= 1;
  }

  return {
    hasData: true,
    todayMax: todayWorst?.severity ?? 0,
    todayPart: todayWorst?.body_part ?? null,
    persistentPart,
    persistentDays: best.length ? new Set(best.map((r) => r.date)).size : 0,
    persistentPeak: best.length ? Math.max(...best.map((r) => r.severity)) : 0,
    escalating,
    daysSinceReport,
  };
}

/* ---------------- single-session spikes ---------------- */

/**
 * The one load pattern that survives scrutiny in runners.
 *
 * The Garmin-RUNSAFE cohort (5,205 runners, 588,071 sessions, 1,311 overuse
 * injuries) found no association between injury and either the acute:chronic
 * workload ratio or week-to-week volume ratios — but single sessions markedly
 * longer than the runner's recent longest did carry elevated risk.
 *
 * So this compares one run against the longest single run before it, and is
 * reported against that run rather than against the athlete. Nothing here feeds
 * a score: it is a warning attached to a specific session, naming the specific
 * thing that could have been done differently.
 *
 * Provenance caveat the UI copy must preserve: that cohort had a mean age of
 * 45.8. Nothing equivalent has been shown in adolescents.
 */
export type SessionSpike = {
  km: number;
  /** longest single run in the window before this one */
  longestKm: number;
  /** how much longer this run was, as a percentage */
  pctAbove: number;
  level: "notable" | "large";
};

const SPIKE_WINDOW_DAYS = 30;
/** below this the comparison is noise, not a spike */
const SPIKE_MIN_PCT = 25;
const SPIKE_LARGE_PCT = 50;
/** ignore short runs — 30% more than a 2 km jog is not a risk event */
const SPIKE_MIN_KM = 5;

/**
 * Rate one activity against the athlete's own recent history.
 * `history` may contain the activity itself; it is excluded.
 * Returns null when the run is unremarkable or there is nothing to compare to.
 */
export function sessionSpike(
  activity: ActivityRow,
  history: ActivityRow[]
): SessionSpike | null {
  const km = activity.distance_m / 1000;
  if (km < SPIKE_MIN_KM) return null;

  const at = new Date(activity.start_time);
  const day = localDay(at);
  const from = localDay(new Date(at.getTime() - SPIKE_WINDOW_DAYS * DAY_MS));

  let longestKm = 0;
  for (const a of history) {
    if (a === activity || a.id === activity.id) continue;
    const d = localDay(new Date(a.start_time));
    if (d < from || d > day) continue; // only what was already known by then
    longestKm = Math.max(longestKm, a.distance_m / 1000);
  }
  if (longestKm <= 0) return null; // nothing to compare against yet

  const pctAbove = ((km - longestKm) / longestKm) * 100;
  if (pctAbove < SPIKE_MIN_PCT) return null;

  return {
    km: round(km),
    longestKm: round(longestKm),
    pctAbove: Math.round(pctAbove),
    level: pctAbove >= SPIKE_LARGE_PCT ? "large" : "notable",
  };
}

/* ---------------- energy trend ---------------- */

/** One dated check-in energy rating, as stored in `checkins`. */
export type EnergyReport = { date: string; energy: number | null };

/**
 * A run of consecutive check-ins where reported energy is falling. Not a score —
 * a pattern worth a conversation ("energy has dropped four days running").
 * Self-report is the most sensitive signal available here, so the trend is worth
 * surfacing even where the absolute level is not.
 */
export type EnergyTrend = {
  /** consecutive reports in the decline, counting the first */
  days: number;
  from: number;
  to: number;
};

export function detectEnergyDecline(
  reports: EnergyReport[],
  now: Date = new Date()
): EnergyTrend | null {
  const from = localDay(new Date(now.getTime() - 13 * DAY_MS));
  const today = localDay(now);
  const rated = reports
    .filter((r) => r.energy != null && r.date >= from && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rated.length < 3) return null;

  // walk back from the most recent while each report is lower than the one before
  let days = 1;
  for (let i = rated.length - 1; i > 0; i--) {
    if ((rated[i].energy as number) < (rated[i - 1].energy as number)) days++;
    else break;
  }
  if (days < 3) return null;

  const slice = rated.slice(rated.length - days);
  return {
    days,
    from: slice[0].energy as number,
    to: slice[slice.length - 1].energy as number,
  };
}

export function computeRisk(
  activities: ActivityRow[],
  metrics: MetricRow[] = [],
  now: Date = new Date(),
  soreness: SorenessReport[] = [],
  athlete: HrMaxAthlete | null = null
): RiskSnapshot & { series: DailyPoint[] } {
  // Resolved here rather than passed in, so every caller gets a per-athlete
  // value without threading it through. `athlete` only refines the answer (a
  // manually-set figure, or their age); history alone is usually enough.
  const hrMax = resolveHrMax(athlete, activities);
  const daily = dailySeries(activities, 120, now, hrMax.value);
  const series = acwrSeries(daily);
  const last = series[series.length - 1];

  const last7 = series.slice(-7);
  const prev7 = series.slice(-14, -7);
  const weekKm = last7.reduce((s, d) => s + d.km, 0);
  const prevWeekKm = prev7.reduce((s, d) => s + d.km, 0);
  const rampPct =
    prevWeekKm > 3 ? ((weekKm - prevWeekKm) / prevWeekKm) * 100 : null;

  const loads7 = last7.map((d) => d.load);
  const mean7 = loads7.reduce((s, x) => s + x, 0) / 7;
  const sd7 = Math.sqrt(
    loads7.reduce((s, x) => s + (x - mean7) ** 2, 0) / 7
  );
  const monotony = sd7 > 1 ? mean7 / sd7 : null;
  const weekLoad = loads7.reduce((s, x) => s + x, 0);
  const strain = monotony ? weekLoad * monotony : null;

  let daysSinceRest = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].load < 10) break;
    daysSinceRest++;
  }

  const lastAct = activities.length
    ? activities[activities.length - 1].start_time
    : null;

  const acwr = last?.acwr ?? null;

  // ----- score -----
  let score = 0;
  const insights: string[] = [];

  if (acwr !== null) {
    if (acwr > 1.5) {
      score += Math.min(70, 40 + (acwr - 1.5) * 60);
      insights.push(
        `Workload ratio is ${round(acwr, 2)} — training load is spiking far above their base. This is the classic pre-injury pattern.`
      );
    } else if (acwr > 1.3) {
      score += 20 + ((acwr - 1.3) / 0.2) * 20;
      insights.push(
        `Workload ratio is ${round(acwr, 2)} — above the safe zone (0.8–1.3). Watch closely and avoid stacking hard days.`
      );
    } else if (acwr < 0.6 && weekKm > 2) {
      score += 15;
      insights.push(
        `Workload ratio is ${round(acwr, 2)} — well below their base. Returning after time off: rebuild gradually, a sudden jump from here is high-risk.`
      );
    } else if (acwr >= 0.8 && acwr <= 1.3) {
      insights.push(
        `Workload ratio ${round(acwr, 2)} is in the sweet spot (0.8–1.3). Load is building at a sustainable rate.`
      );
    }
  } else {
    insights.push(NOT_ENOUGH_ACWR_HISTORY);
  }

  if (rampPct !== null && rampPct > 30) {
    score += Math.min(25, (rampPct - 30) * 0.7);
    insights.push(
      `Weekly mileage jumped ${Math.round(rampPct)}% (${round(prevWeekKm)} km → ${round(weekKm)} km). Jumps over ~30% sharply raise injury risk.`
    );
  } else if (rampPct !== null && rampPct < -40 && prevWeekKm > 15) {
    insights.push(
      `Mileage dropped ${Math.abs(Math.round(rampPct))}% this week — check in: taper, illness, or a niggle?`
    );
  }

  if (monotony !== null && monotony > 2 && weekLoad > 300) {
    score += Math.min(25, (monotony - 2) * 10);
    insights.push(
      `Training monotony is high (${round(monotony, 1)}) — every day looks the same. Mix in genuinely easy days; monotony amplifies injury and illness risk.`
    );
  }

  // compounding factors: a load-ratio spike AND a big mileage ramp together are
  // far more dangerous than either alone
  if (acwr !== null && acwr > 1.3 && rampPct !== null && rampPct > 40) {
    score += 12;
  }

  if (daysSinceRest >= 10) {
    score += 10;
    insights.push(
      `${daysSinceRest} straight days without a rest day. Schedule one — adaptation happens in recovery.`
    );
  }

  // ----- recovery factors from Apple Health -----
  const recovery = computeRecovery(metrics, now);

  if (recovery.restingHrDelta !== null && recovery.restingHrDelta >= 5) {
    score += Math.min(15, (recovery.restingHrDelta - 4) * 3);
    insights.push(
      `Resting heart rate is up ${recovery.restingHrDelta} bpm over their baseline (${recovery.restingHrBaseline} → ${recovery.restingHr}). An elevated resting HR is one of the earliest signs of under-recovery or illness — often before the athlete feels it.`
    );
  } else if (recovery.restingHrDelta !== null && recovery.restingHrDelta <= -3) {
    insights.push(
      `Resting heart rate is trending down (${recovery.restingHrBaseline} → ${recovery.restingHr} bpm) — a good sign that fitness is improving and recovery is on track.`
    );
  }

  if (recovery.hrvDeltaPct !== null && recovery.hrvDeltaPct <= -12) {
    score += Math.min(12, Math.abs(recovery.hrvDeltaPct + 12) * 0.6 + 4);
    insights.push(
      `Heart-rate variability has dropped ${Math.abs(recovery.hrvDeltaPct)}% below baseline (${recovery.hrvBaseline} → ${recovery.hrv} ms). Suppressed HRV means the nervous system is still under stress and hasn't bounced back.`
    );
  }

  if (recovery.sleepAvg !== null && recovery.sleepAvg < 7) {
    score += Math.min(12, (7 - recovery.sleepAvg) * 4);
    insights.push(
      `Averaging ${recovery.sleepAvg}h of sleep this week. Under 7 hours measurably raises injury risk for teenage athletes — the body does most of its tissue repair asleep.`
    );
  }

  // ----- what the athlete has actually told us -----
  // Deliberately scores ZERO points. Check-ins are optional, so an athlete who
  // never logs would otherwise look healthier than one who reports honestly —
  // and since a high score gets you pulled from practice, folding soreness into
  // the number teaches athletes to stop reporting it. Worse, the roster sorts
  // by score, so it would rank diligent reporters above quiet ones rather than
  // ranking by actual risk.
  //
  // So the score stays objective (load + recovery, always present) and the
  // self-report travels alongside it as its own flag. The two are read
  // together by the coach instead of being averaged into one misleading number.
  // If the check-in ever becomes a required one-tap "nothing hurts", a reported
  // zero becomes a fact rather than missing data, and this can be revisited.
  const self = summarizeSelfReport(soreness, now);

  if (self.persistentPart && self.persistentDays >= 3) {
    insights.push(
      `The ${self.persistentPart} has been reported sore on ${self.persistentDays} of the last 7 days (peak ${self.persistentPeak}/10)${self.escalating ? ", and it is getting worse rather than settling" : ""}. Soreness that keeps returning to one area is how a running injury usually starts — worth assessing regardless of what the load numbers say.`
    );
  } else if (self.todayMax >= 6) {
    insights.push(
      `Reported soreness ${self.todayMax}/10 in the ${self.todayPart} today.`
    );
  }

  // Absence of a report is not the same as absence of pain — say so rather than
  // letting a silent week look like a clean one.
  if (!self.hasData) {
    insights.push(
      "No check-ins on record — nothing is known about how this athlete actually feels."
    );
  } else if ((self.daysSinceReport ?? 0) >= 5) {
    insights.push(
      `No check-in for ${self.daysSinceReport} days, so there is no current self-reported picture.`
    );
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const zone: RiskSnapshot["zone"] =
    score >= 60 ? "high" : score >= 30 ? "caution" : "ready";

  if (zone === "ready" && insights.length === 0) {
    insights.push(
      recovery.hasData
        ? "Load, ramp rate, and recovery signals all look healthy. Keep the current rhythm."
        : "Load, ramp rate, and variety all look healthy. Keep the current rhythm."
    );
  }

  return {
    score,
    zone,
    zoneLabel: zone === "high" ? "High risk" : zone === "caution" ? "Caution" : "Ready",
    selfReport: self,
    hrMax,
    acwr: acwr !== null ? round(acwr, 2) : null,
    acute: round(last?.acute ?? 0),
    chronic: round(last?.chronic ?? 0),
    weekKm: round(weekKm),
    prevWeekKm: round(prevWeekKm),
    rampPct: rampPct !== null ? Math.round(rampPct) : null,
    monotony: monotony !== null ? round(monotony, 1) : null,
    strain: strain !== null ? Math.round(strain) : null,
    daysSinceRest,
    lastActivity: lastAct,
    recovery,
    insights,
    hasActivityHistory: activities.length > 0,
    series,
  };
}
