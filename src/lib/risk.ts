import { ActivityRow, MetricRow } from "./db";

/**
 * Core risk engine.
 *
 * Training load model: session load ≈ sRPE = duration (min) × intensity (1–10).
 * Intensity is estimated from average heart rate when available (as a fraction
 * of an assumed HRmax of 200 for high-schoolers), otherwise from pace, otherwise
 * a moderate default.
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

export type RiskSnapshot = {
  score: number; // 0–100
  zone: "ready" | "caution" | "high";
  zoneLabel: string;
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
};

export type DailyPoint = DayLoad & {
  acute: number;
  chronic: number;
  acwr: number | null;
};

const DAY_MS = 86400000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function estimateIntensity(a: ActivityRow): number {
  if (a.avg_hr && a.avg_hr > 60) {
    // % of assumed HRmax 200 → map 50%..95% to 2..10
    const pct = Math.min(0.98, a.avg_hr / 200);
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

export function sessionLoad(a: ActivityRow): number {
  const minutes = a.duration_s / 60;
  return minutes * estimateIntensity(a);
}

/** Group activities into per-day loads over the trailing `days` window ending at `end`. */
export function dailySeries(
  activities: ActivityRow[],
  days: number,
  end: Date = new Date()
): DayLoad[] {
  const map = new Map<string, DayLoad>();
  for (let i = days - 1; i >= 0; i--) {
    const d = isoDay(new Date(end.getTime() - i * DAY_MS));
    map.set(d, { date: d, load: 0, km: 0, minutes: 0 });
  }
  for (const a of activities) {
    const d = a.start_time.slice(0, 10);
    const slot = map.get(d);
    if (!slot) continue;
    slot.load += sessionLoad(a);
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

export function computeRisk(
  activities: ActivityRow[],
  metrics: MetricRow[] = [],
  now: Date = new Date()
): RiskSnapshot & { series: DailyPoint[] } {
  const daily = dailySeries(activities, 120, now);
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
    insights.push(
      "Not enough training history yet for a reliable workload ratio — sync more data or give it a couple of weeks."
    );
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
    series,
  };
}
