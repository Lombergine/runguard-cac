/**
 * Core's full athlete engine — everything computed on top of raw Apple Health /
 * Strava data: load metrics (TRIMP, HR zones), pattern detection, fitness &
 * freshness, race predictions, the weekly plan with taper mode, pre-practice
 * flags, notifications, badges, and comparison.
 */
import {
  ActivityRow,
  MetricRow,
  CheckinRow,
  RaceRow,
  RaceResultRow,
  GoalRow,
  InjuryRow,
  AthleteRow,
} from "./db";
import { computeRisk, RiskSnapshot, DailyPoint, sessionLoad } from "./risk";

const DAY_MS = 86400000;
const HR_MAX = 200; // assumed for high-schoolers
export const EVENTS = ["800m", "Mile", "5K", "XC 5K"] as const;
export type EventName = (typeof EVENTS)[number];
export const EVENT_DIST: Record<EventName, number> = {
  "800m": 800,
  Mile: 1609,
  "5K": 5000,
  "XC 5K": 5000,
};

/* ---------------- formatting helpers ---------------- */

export function fmtTime(totalS: number): string {
  const s = Math.round(totalS);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtPaceKm(secPerKm: number): string {
  return `${fmtTime(secPerKm)}/km`;
}

function round(n: number, p = 1): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ---------------- load metrics ---------------- */

export type ZoneMinutes = { z1: number; z2: number; z3: number; z4: number; z5: number };

export function hrZone(avgHr: number): keyof ZoneMinutes {
  const pct = avgHr / HR_MAX;
  if (pct < 0.7) return "z1";
  if (pct < 0.8) return "z2";
  if (pct < 0.87) return "z3";
  if (pct < 0.93) return "z4";
  return "z5";
}

/** Banister TRIMP for one session. */
export function trimp(a: ActivityRow, restingHr = 55): number {
  if (!a.avg_hr || a.duration_s <= 0) return 0;
  const dHr = clamp((a.avg_hr - restingHr) / (HR_MAX - restingHr), 0, 1);
  return (a.duration_s / 60) * dHr * 0.64 * Math.exp(1.92 * dHr);
}

export type LoadMetrics = {
  weekKm: number;
  weekTrimp: number;
  acuteLoad: number; // rolling 7d (EWMA)
  chronicLoad: number; // rolling 28d (EWMA)
  acwr: number | null;
  spikePct: number | null; // weekly volume spike %
  weekZones: ZoneMinutes; // minutes in each HR zone, last 7 days
};

export function loadMetrics(acts: ActivityRow[], risk: RiskSnapshot & { series: DailyPoint[] }, restingHr: number): LoadMetrics {
  const cutoff = Date.now() - 7 * DAY_MS;
  const weekActs = acts.filter((a) => new Date(a.start_time).getTime() > cutoff);
  const weekZones: ZoneMinutes = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let weekTrimp = 0;
  for (const a of weekActs) {
    weekTrimp += trimp(a, restingHr);
    if (a.avg_hr) weekZones[hrZone(a.avg_hr)] += a.duration_s / 60;
  }
  return {
    weekKm: risk.weekKm,
    weekTrimp: Math.round(weekTrimp),
    acuteLoad: risk.acute,
    chronicLoad: risk.chronic,
    acwr: risk.acwr,
    spikePct: risk.rampPct,
    weekZones: {
      z1: Math.round(weekZones.z1),
      z2: Math.round(weekZones.z2),
      z3: Math.round(weekZones.z3),
      z4: Math.round(weekZones.z4),
      z5: Math.round(weekZones.z5),
    },
  };
}

/* ---------------- pattern detection ---------------- */

export type Patterns = {
  highEffortStreak: number; // consecutive days above typical load
  monotony: number | null;
  overreaching: boolean;
  undertraining: boolean;
  sleepDebtH: number | null; // accumulated vs 8h target, last 7 days
  sleepConsistency: number | null; // 0-100
  daysSinceHardEffort: number | null;
};

export function detectPatterns(
  risk: RiskSnapshot & { series: DailyPoint[] },
  metrics: MetricRow[]
): Patterns {
  const series = risk.series;
  const nonzero = series.map((d) => d.load).filter((l) => l > 10).sort((a, b) => a - b);
  const median = nonzero.length ? nonzero[Math.floor(nonzero.length / 2)] : 0;

  let highEffortStreak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].load > median * 1.15 && median > 0) highEffortStreak++;
    else break;
  }

  let daysSinceHardEffort: number | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].load > median * 1.4 && median > 0) {
      daysSinceHardEffort = series.length - 1 - i;
      break;
    }
  }

  const overreaching =
    (risk.acwr !== null && risk.acwr > 1.4 && (risk.monotony ?? 0) > 1.7) ||
    (risk.acwr !== null && risk.acwr > 1.5) ||
    highEffortStreak >= 6;
  const avg4wk =
    series.slice(-28).reduce((s, d) => s + d.km, 0) / 4;
  const undertraining =
    risk.acwr !== null && risk.acwr < 0.7 && risk.weekKm < avg4wk * 0.7 && avg4wk > 10;

  const last7Sleep = metrics
    .filter((m) => m.sleep_hours != null)
    .slice(-7)
    .map((m) => m.sleep_hours as number);
  const sleepDebtH = last7Sleep.length
    ? round(last7Sleep.reduce((s, x) => s + Math.max(0, 8 - x), 0))
    : null;
  let sleepConsistency: number | null = null;
  if (last7Sleep.length >= 4) {
    const mean = last7Sleep.reduce((s, x) => s + x, 0) / last7Sleep.length;
    const sd = Math.sqrt(
      last7Sleep.reduce((s, x) => s + (x - mean) ** 2, 0) / last7Sleep.length
    );
    sleepConsistency = Math.round(clamp(100 - sd * 45, 0, 100));
  }

  return {
    highEffortStreak,
    monotony: risk.monotony,
    overreaching,
    undertraining,
    sleepDebtH,
    sleepConsistency,
    daysSinceHardEffort,
  };
}

/* ---------------- fitness, freshness, tiers ---------------- */

export type Fitness = {
  score: number; // 0-100
  trend: "improving" | "plateau" | "declining";
  tier: "Elite" | "Advanced" | "Intermediate" | "Developing";
  weekly: { week: string; score: number }[]; // season trend line
  freshness: number; // 0-100 (form / "Body Battery")
  vo2max: number | null;
  peakThisWeek: boolean;
};

function vo2ToScore(vo2: number): number {
  return clamp((vo2 - 35) * 2.6, 0, 100);
}

export function computeFitness(
  risk: RiskSnapshot & { series: DailyPoint[] },
  metrics: MetricRow[],
  acts: ActivityRow[]
): Fitness {
  const vo2s = metrics.filter((m) => m.vo2max != null);
  const vo2max = vo2s.length ? (vo2s[vo2s.length - 1].vo2max as number) : null;

  // weekly fitness = blend of VO2 trend and pace trend (faster distance-weighted pace = fitter)
  const weekly: { week: string; score: number }[] = [];
  const series = risk.series;
  for (let w = 15; w >= 0; w--) {
    const start = series.length - (w + 1) * 7;
    const chunk = series.slice(Math.max(0, start), series.length - w * 7);
    if (!chunk.length) continue;
    const from = chunk[0].date;
    const to = chunk[chunk.length - 1].date;
    const weekActs = acts.filter(
      (a) => a.start_time.slice(0, 10) >= from && a.start_time.slice(0, 10) <= to && a.distance_m > 2000
    );
    const dist = weekActs.reduce((s, a) => s + a.distance_m, 0);
    const time = weekActs.reduce((s, a) => s + a.duration_s, 0);
    const vo2Near = vo2s.filter((m) => m.date <= to);
    const vo2At = vo2Near.length ? (vo2Near[vo2Near.length - 1].vo2max as number) : null;
    let score: number | null = null;
    if (dist > 5000) {
      const pace = time / (dist / 1000); // s/km
      const paceScore = clamp((420 - pace) / 2.2, 0, 100); // 7:00/km→0 · 3:20/km→100
      score = vo2At !== null ? 0.55 * vo2ToScore(vo2At) + 0.45 * paceScore : paceScore;
    } else if (vo2At !== null) {
      score = vo2ToScore(vo2At);
    }
    if (score !== null) {
      weekly.push({
        week: new Date(from + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: Math.round(score),
      });
    }
  }

  const score = weekly.length ? weekly[weekly.length - 1].score : vo2max !== null ? Math.round(vo2ToScore(vo2max)) : 50;
  const prior = weekly.slice(-5, -1);
  const priorAvg = prior.length ? prior.reduce((s, x) => s + x.score, 0) / prior.length : score;
  const trend: Fitness["trend"] =
    score - priorAvg > 2 ? "improving" : score - priorAvg < -2 ? "declining" : "plateau";

  const tier: Fitness["tier"] =
    score >= 75 ? "Elite" : score >= 58 ? "Advanced" : score >= 40 ? "Intermediate" : "Developing";

  // freshness: how far below chronic the acute load sits (tapered = fresh)
  const ratio = risk.chronic > 25 ? risk.acute / risk.chronic : 1;
  const freshness = Math.round(clamp(100 - (ratio - 0.7) * 110, 0, 100));

  const peakThisWeek =
    weekly.length >= 4 && weekly[weekly.length - 1].score >= Math.max(...weekly.map((w) => w.score));

  return { score, trend, tier, weekly, freshness, vo2max: vo2max !== null ? round(vo2max) : null, peakThisWeek };
}

/* ---------------- race predictions & pacing ---------------- */

export type Predictions = Record<EventName, { timeS: number; label: string }>;

export function predictRaces(vo2max: number | null, fitnessScore: number): Predictions {
  // velocity from VO2max (calibrated: VO2 60 → ~17:30 5K, VO2 45 → ~21:30)
  const vo2 = vo2max ?? 38 + fitnessScore * 0.27;
  const v5k = 0.0587 * vo2 + 1.238; // m/s
  const t5k = 5000 / v5k;
  const riegel = (d: number) => t5k * (d / 5000) ** 1.06;
  const out = {} as Predictions;
  for (const ev of EVENTS) {
    let t = riegel(EVENT_DIST[ev]);
    if (ev === "XC 5K") t *= 1.03; // terrain
    out[ev] = { timeS: Math.round(t), label: fmtTime(t) };
  }
  return out;
}

export function pacingStrategy(event: EventName, predictedS: number): string[] {
  const d = EVENT_DIST[event];
  if (event === "800m") {
    const lap = predictedS / 2;
    return [
      `You're fit enough to go out in ${fmtTime(lap - 1)} for the first 400.`,
      `Hold form through 600m — the race starts with 200 to go.`,
      `Target finish: ${fmtTime(predictedS)}.`,
    ];
  }
  if (event === "Mile") {
    const lap = predictedS / 4;
    return [
      `Even 400s of ${fmtTime(lap)} gets you ${fmtTime(predictedS)}.`,
      `Don't go out faster than ${fmtTime(lap - 2)} — banked time is borrowed time.`,
      `Start your drive with 500 to go.`,
    ];
  }
  const perKm = predictedS / (d / 1000);
  return [
    `Target ${fmtPaceKm(perKm)} — that's ${fmtTime(predictedS)} at the line.`,
    `First km no faster than ${fmtPaceKm(perKm + 5)}; negative-split the back half.`,
    `Attack the last 800m if you're still in control at 2 to go.`,
  ];
}

/* ---------------- weekly plan + taper ---------------- */

export type PlanDay = {
  date: string; // YYYY-MM-DD
  day: string; // Monday…
  type: string;
  distanceKm: number | null;
  targetPace: string | null;
  why: string;
  details: string;
  supplemental: string | null;
  status: "done" | "modified" | "skipped" | null;
  isToday: boolean;
  isTaper: boolean;
};

const SUPPLEMENTAL = [
  "Core: 3×30s plank, 2×15 dead bugs, 2×20 bird dogs",
  "Legs: 2×10 single-leg calf raises, 2×12 step-ups, glute bridges",
  "Mobility: hip flexor + calf stretching, 10 min, especially post-run",
  "Core: side planks 3×30s each side, hollow holds 3×20s",
  null,
  "Legs: eccentric calf drops 3×12 — best shin/achilles insurance there is",
  null,
];

export function weeklyPlan(
  risk: RiskSnapshot,
  predictions: Predictions,
  nextRace: RaceRow | null,
  statuses: Map<string, string>,
  now: Date = new Date()
): { days: PlanDay[]; taperMode: boolean; taperCountdown: number | null } {
  const pace5k = predictions["5K"].timeS / 5; // s/km
  const easy = fmtPaceKm(pace5k * 1.3);
  const tempo = fmtPaceKm(pace5k * 1.06);
  const interval = fmtPaceKm(pace5k * 0.96);
  const longP = fmtPaceKm(pace5k * 1.24);

  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // this week's Monday
  const todayIso = now.toISOString().slice(0, 10);

  const raceDate = nextRace ? new Date(nextRace.date + "T12:00:00") : null;
  const daysToRace = raceDate
    ? Math.ceil((raceDate.getTime() - now.getTime()) / DAY_MS)
    : null;
  const taperMode = daysToRace !== null && daysToRace >= 0 && daysToRace <= 6;

  const base = risk.weekKm > 10 ? risk.weekKm : 30;
  const scale = risk.zone === "high" ? 0.7 : risk.zone === "caution" ? 0.9 : 1.0;

  const template: Omit<PlanDay, "date" | "day" | "status" | "isToday" | "isTaper">[] = [
    { type: "Easy run", distanceKm: round(base * 0.14 * scale), targetPace: easy, why: "Flush the weekend's long run and start the week aerobic.", details: "Fully conversational. Heart rate under 150. If it feels fast, it is.", supplemental: SUPPLEMENTAL[0] },
    { type: "Workout: 5×4 min tempo", distanceKm: round(base * 0.16 * scale), targetPace: tempo, why: "Threshold work raises the pace you can hold without blowing up.", details: "2 min jog between reps. Comfortably hard — you could say short sentences.", supplemental: SUPPLEMENTAL[1] },
    { type: "Recovery run", distanceKm: round(base * 0.11 * scale), targetPace: easy, why: "Active recovery clears the workout without adding stress.", details: "Slowest run of the week on purpose. Add 4 relaxed strides at the end.", supplemental: SUPPLEMENTAL[2] },
    { type: "Workout: 8×400m", distanceKm: round(base * 0.15 * scale), targetPace: interval, why: "Speed touch keeps turnover sharp while volume builds.", details: "Full 90s recovery. Even splits beat heroic first reps.", supplemental: SUPPLEMENTAL[3] },
    { type: "Easy run + strides", distanceKm: round(base * 0.13 * scale), targetPace: easy, why: "Consolidate the week before the long run.", details: "6×20s strides on grass, walk-back recovery.", supplemental: SUPPLEMENTAL[4] },
    { type: "Long run", distanceKm: round(base * 0.26 * scale), targetPace: longP, why: "The aerobic engine is built here — biggest single fitness lever.", details: "Steady, relaxed. Fuel before, water during if hot.", supplemental: SUPPLEMENTAL[5] },
    { type: "Rest", distanceKm: null, targetPace: null, why: "Adaptation happens in recovery, not in training.", details: "Full day off. Sleep in. Legs up.", supplemental: SUPPLEMENTAL[6] },
  ];

  const taperTemplate = (dtr: number): Omit<PlanDay, "date" | "day" | "status" | "isToday" | "isTaper"> => {
    if (dtr <= 0) return { type: "RACE DAY", distanceKm: null, targetPace: null, why: "Everything this season pointed here.", details: "Long warmup, 4 strides, trust the fitness. Execute the pacing plan.", supplemental: null };
    if (dtr === 1) return { type: "Pre-race shakeout", distanceKm: 3, targetPace: easy, why: "Stay loose without spending anything.", details: "15–20 min jog + 3 gentle strides. Lay out your race kit tonight.", supplemental: null };
    if (dtr === 2) return { type: "Easy 25 min + 4 strides", distanceKm: 5, targetPace: easy, why: "Keep the legs ticking over.", details: "Strides at race pace, full recovery. Hydrate all day.", supplemental: null };
    if (dtr === 3) return { type: "Race-pace touch: 3×2 min", distanceKm: 6, targetPace: tempo, why: "A small dose of race rhythm so it feels automatic.", details: "3×2 min at race effort, 2 min jog between. Short and snappy.", supplemental: null };
    return { type: "Easy volume, reduced", distanceKm: round(base * 0.1), targetPace: easy, why: `Taper week: cut volume, keep a little intensity. Race in ${dtr} days.`, details: "About 60% of a normal day. Nothing new this week.", supplemental: SUPPLEMENTAL[2] };
  };

  const days: PlanDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dtr = raceDate ? Math.ceil((raceDate.getTime() - d.getTime()) / DAY_MS) : null;
    const inTaper = taperMode && dtr !== null && dtr >= 0 && dtr <= 6;
    const t = inTaper ? taperTemplate(dtr as number) : template[i];
    days.push({
      ...t,
      date: iso,
      day: d.toLocaleDateString("en-US", { weekday: "long" }),
      status: (statuses.get(iso) as PlanDay["status"]) ?? null,
      isToday: iso === todayIso,
      isTaper: inTaper,
    });
  }

  return { days, taperMode, taperCountdown: taperMode ? daysToRace : null };
}

/* ---------------- pre-practice flag, readiness, insight ---------------- */

export type PrePractice = { flag: "go" | "modify" | "sit_out"; reason: string };

export function prePracticeFlag(risk: RiskSnapshot, illness: boolean, sorenessSeverity: number | null): PrePractice {
  if (illness) return { flag: "sit_out", reason: "Illness pattern: HRV drop + elevated resting HR. Keep them away from hard work today." };
  if (risk.zone === "high") return { flag: "sit_out", reason: "Injury risk is high — replace today's session with rest or 20 min recovery jog." };
  if (sorenessSeverity !== null && sorenessSeverity >= 7) return { flag: "sit_out", reason: `Reported soreness ${sorenessSeverity}/10 — assess before any running.` };
  if (risk.zone === "caution" || (sorenessSeverity !== null && sorenessSeverity >= 4)) {
    return { flag: "modify", reason: "Elevated risk or soreness — cut volume ~30% and skip intensity today." };
  }
  return { flag: "go", reason: "All signals green. Run the plan as written." };
}

export function readinessScore(risk: RiskSnapshot, checkin: CheckinRow | null): number {
  let r = 100 - risk.score;
  if (checkin?.soreness_severity != null) r -= checkin.soreness_severity * 2.5;
  if (checkin?.energy != null) r += (checkin.energy - 5) * 1.5;
  if (checkin?.academic_stress) r -= 5;
  return Math.round(clamp(r, 0, 100));
}

export function aiInsight(risk: RiskSnapshot, fitness: Fitness, patterns: Patterns): string {
  const rec = risk.recovery;
  if (risk.zone === "high") return "Your load is in the danger zone — today is the day that decides whether next month is training or rehab.";
  if (rec.hrvDeltaPct !== null && rec.hrvDeltaPct >= 10) return `Your HRV is up ${rec.hrvDeltaPct}% this week — good time to push hard.`;
  if (rec.hrvDeltaPct !== null && rec.hrvDeltaPct <= -12) return `HRV is ${Math.abs(rec.hrvDeltaPct)}% below baseline — make today genuinely easy and it rebounds faster.`;
  if (fitness.peakThisWeek) return "You hit a new fitness peak this week — the training is working.";
  if (patterns.sleepDebtH !== null && patterns.sleepDebtH > 5) return `You're carrying ${patterns.sleepDebtH}h of sleep debt — tonight's sleep is worth more than tomorrow's run.`;
  if (fitness.trend === "improving") return "Fitness is trending up week over week. Consistency is compounding — keep the rhythm.";
  return "Everything's stable. Stack another clean week.";
}

/* ---------------- notifications ---------------- */

export type Notification = { type: string; text: string; severity: "info" | "warning" | "critical" };

export function buildNotifications(args: {
  risk: RiskSnapshot;
  fitness: Fitness;
  patterns: Patterns;
  illness: boolean;
  nextRace: RaceRow | null;
  daysToRace: number | null;
  predictions: Predictions;
  prs: Partial<Record<EventName, number>>;
  lastActivityDaysAgo: number | null;
}): Notification[] {
  const out: Notification[] = [];
  const { risk, fitness, patterns, illness, nextRace, daysToRace, predictions, prs, lastActivityDaysAgo } = args;

  if (risk.zone === "high") out.push({ type: "injury", text: "You could get injured tomorrow — your risk score is in the red. Back off today.", severity: "critical" });
  if (risk.acwr !== null && risk.acwr > 1.3) out.push({ type: "acwr", text: `Your ACWR is spiking (${risk.acwr.toFixed(2)}), consider an easy day tomorrow.`, severity: "warning" });
  if (nextRace && daysToRace !== null && daysToRace <= 3 && daysToRace >= 0) out.push({ type: "race", text: `Race in ${daysToRace} day${daysToRace === 1 ? "" : "s"} — here's your taper plan in the Training tab.`, severity: "info" });
  if (fitness.peakThisWeek) out.push({ type: "fitness", text: "You hit a new training fitness peak this week.", severity: "info" });
  if (risk.recovery.restingHrDelta !== null && risk.recovery.restingHrDelta >= 5) out.push({ type: "rhr", text: "Your resting HR is elevated, check your recovery today.", severity: "warning" });
  if (illness) out.push({ type: "illness", text: "HRV drop + elevated resting HR — classic getting-sick pattern. Hydrate, sleep, skip intensity.", severity: "warning" });
  if (lastActivityDaysAgo !== null && lastActivityDaysAgo >= 2) out.push({ type: "streak", text: `You haven't logged a workout in ${lastActivityDaysAgo} days, staying on track?`, severity: "info" });
  for (const ev of EVENTS) {
    const pr = prs[ev];
    if (pr && predictions[ev].timeS < pr - 1) {
      out.push({ type: "pr", text: `New PR predicted: ${predictions[ev].label} for the ${ev} based on your recent training (PR: ${fmtTime(pr)}).`, severity: "info" });
      break;
    }
  }
  if (patterns.undertraining) out.push({ type: "undertraining", text: "Volume has dropped well below your base — rebuild gently to hold fitness.", severity: "info" });
  return out;
}

/* ---------------- badges & comparison ---------------- */

export type Badge = { id: string; label: string; earned: boolean; detail: string };

export function computeBadges(
  series: DailyPoint[],
  raceResults: RaceResultRow[],
  injuries: InjuryRow[],
  now: Date = new Date()
): Badge[] {
  // 100-mile (161 km) month: best rolling 30-day distance
  let best30 = 0;
  for (let i = 0; i + 30 <= series.length; i++) {
    const km = series.slice(i, i + 30).reduce((s, d) => s + d.km, 0);
    if (km > best30) best30 = km;
  }
  // longest consecutive training-day streak
  let streak = 0;
  let bestStreak = 0;
  for (const d of series) {
    if (d.load > 10) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else streak = 0;
  }
  const recentPr = raceResults.some((r) => {
    const best = Math.min(
      ...raceResults.filter((x) => x.event === r.event && x.date < r.date).map((x) => x.time_s),
      Infinity
    );
    return r.time_s < best && new Date(r.date).getTime() > now.getTime() - 45 * DAY_MS;
  });
  const seasonStart = now.getTime() - 120 * DAY_MS;
  const injuryFree = !injuries.some((i) => new Date(i.date).getTime() > seasonStart);

  return [
    { id: "hundred", label: "100-Mile Month", earned: best30 >= 161, detail: `Best 30 days: ${Math.round(best30)} km` },
    { id: "streak7", label: "7-Day Streak", earned: bestStreak >= 7, detail: `Longest streak: ${bestStreak} days` },
    { id: "pr", label: "New PR", earned: recentPr, detail: recentPr ? "PR set in the last 45 days" : "Race a PR to earn it" },
    { id: "healthy", label: "Injury-Free Season", earned: injuryFree, detail: injuryFree ? "No injuries logged this season" : "Injury logged this season" },
  ];
}

export type Comparison = { weekKmPercentile: number; fivekPercentile: number; peers: number };

export function compareToPeers(
  mine: { weekKm: number; pred5kS: number },
  peers: { weekKm: number; pred5kS: number }[]
): Comparison {
  const kmBelow = peers.filter((p) => p.weekKm < mine.weekKm).length;
  const fasterThan = peers.filter((p) => p.pred5kS > mine.pred5kS).length;
  const n = Math.max(1, peers.length);
  return {
    weekKmPercentile: Math.round((kmBelow / n) * 100),
    fivekPercentile: Math.round((fasterThan / n) * 100),
    peers: peers.length,
  };
}

/* ---------------- illness & PRs ---------------- */

export function illnessFlag(risk: RiskSnapshot): boolean {
  const r = risk.recovery;
  return (
    r.restingHrDelta !== null &&
    r.restingHrDelta >= 5 &&
    r.hrvDeltaPct !== null &&
    r.hrvDeltaPct <= -15
  );
}

export function personalRecords(results: RaceResultRow[]): Partial<Record<EventName, number>> {
  const prs: Partial<Record<EventName, number>> = {};
  for (const r of results) {
    const ev = r.event as EventName;
    if (!EVENTS.includes(ev)) continue;
    if (prs[ev] === undefined || r.time_s < (prs[ev] as number)) prs[ev] = r.time_s;
  }
  return prs;
}

/* ---------------- sleep & mental trends ---------------- */

export type SleepDay = {
  date: string;
  hours: number | null;
  deep: number | null;
  rem: number | null;
  light: number | null;
};

export function sleepTrend(metrics: MetricRow[], days = 30): SleepDay[] {
  return metrics.slice(-days).map((m) => ({
    date: m.date,
    hours: m.sleep_hours,
    deep: m.sleep_deep,
    rem: m.sleep_rem,
    light: m.sleep_light,
  }));
}

export type MentalDay = { date: string; energy: number | null; motivation: number | null; stress: boolean };

export function mentalTrend(checkins: CheckinRow[], days = 30): MentalDay[] {
  return checkins.slice(-days).map((c) => ({
    date: c.date,
    energy: c.energy,
    motivation: c.motivation,
    stress: Boolean(c.academic_stress),
  }));
}
