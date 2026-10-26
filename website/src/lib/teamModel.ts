/**
 * Learn from this team: a model trained on the roster's own data, evaluated
 * honestly, compared against the universal formula and against noise.
 *
 * Each athlete-day in the last year becomes one row: a dozen features the
 * app already computes (the workload ratio and its legs, weekly ramp,
 * monotony and strain, days since rest, days since a run, resting-HR, HRV
 * and sleep against the athlete's own 28-day medians, the worst soreness
 * reported in the last three days), labelled 1 when the coach logged an injury within
 * the next seven days. The 14 days after an injury are dropped, so the
 * model is predicting the week before, not recognising the week after.
 *
 * The model is L2-regularised logistic regression on standardised features,
 * trained by gradient descent: small, fast (well under a second for a
 * roster), and fully inspectable, which a black box is not. It is scored by
 * leave-one-athlete-out cross-validation: the model never sees the athlete
 * it is scored on, so a team of fourteen gives fourteen honest test sets.
 * The pooled out-of-fold AUC is compared with the shown ratio's AUC on the
 * same labels and with a ratio whose denominator is shuffled noise, the
 * three numbers a coach needs side by side.
 *
 * On the sample team the injuries were generated to follow load spikes, so
 * a model that finds the ramp is finding the generator; the panel says so.
 * On a real team it finds the team. Descriptive, not a diagnosis.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { activitiesForAthlete, athletesForTeam, injuriesForAthlete, metricsForAthlete, sorenessHistory } from "./db";
import { acwrSeries, dailySeries } from "./risk";
import { aucBinary, mean, nullChronicRatio, percentile, seededRandom, standardDeviation } from "./acwrDiagnostics";

export const MODEL_DAYS = 366;
export const HORIZON_DAYS = 7;
export const WASHOUT_DAYS = 14;
export const MINIMUM_EVENTS = 10;

export const FEATURES = [
  { key: "ratio", label: "Workload ratio" },
  { key: "kmRatio", label: "Distance: week vs. 4 weeks" },
  { key: "weekKm", label: "Weekly distance" },
  { key: "ramp", label: "Weekly distance ramp" },
  { key: "monotony", label: "Monotony (7 days)" },
  { key: "strain", label: "Strain (7 days)" },
  { key: "sinceRest", label: "Days since a rest day" },
  { key: "sinceRun", label: "Days since a run" },
  { key: "restingHr", label: "Resting HR vs. own baseline" },
  { key: "hrv", label: "HRV vs. own baseline" },
  { key: "sleep", label: "Sleep vs. own baseline" },
  { key: "sore", label: "Soreness reported (3 days)" },
] as const;

export type Row = { athleteId: number; date: string; x: number[]; y: 0 | 1; acute: number; chronic: number; ratio: number | null };

export type TeamModel = {
  days: number;
  athletes: number;
  rows: number;
  events: number;
  /** Null with a reason when there is too little to learn from. */
  result: {
    auc: number;
    aucCiLow: number;
    aucCiHigh: number;
    ratioAuc: number;
    /** Model AUC minus ratio AUC on the same rows, with a paired bootstrap interval. */
    deltaRatio: number;
    deltaCiLow: number;
    deltaCiHigh: number;
    noiseAuc: number;
    noiseCiLow: number;
    noiseCiHigh: number;
    coefficients: { key: string; label: string; weight: number }[];
    folds: number;
    iterations: number;
    elapsedMs: number;
  } | null;
  reason: string | null;
};

const DAY_MS = 86400000;
const median = (xs: number[]): number | null => (xs.length ? percentile(xs, 50) : null);

/* ------------------------------------------------------------------ *
 * Features
 * ------------------------------------------------------------------ */

export function featureRows(
  athleteId: number,
  daily: { date: string; load: number; km: number; acute: number; chronic: number; acwr: number | null }[],
  metrics: { date: string; resting_hr: number | null; hrv: number | null; sleep_hours: number | null }[],
  soreness: { date: string; severity: number | null }[],
  injuryDates: string[],
): Row[] {
  const byDate = new Map(metrics.map((m) => [m.date, m]));
  const soreByDate = new Map<string, number>();
  for (const r of soreness) soreByDate.set(r.date, Math.max(soreByDate.get(r.date) ?? 0, r.severity ?? 1));
  const injuryIdx = new Set<number>();
  const dateIdx = new Map(daily.map((d, i) => [d.date, i]));
  for (const d of injuryDates) {
    const i = dateIdx.get(d);
    if (i !== undefined) injuryIdx.add(i);
  }
  const rows: Row[] = [];
  let sinceRest = 0;
  let sinceRun = 0;
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];
    if (d.load > 0) {
      sinceRest += 1;
      sinceRun = 0;
    } else {
      sinceRest = 0;
      sinceRun += 1;
    }
    // Washout: the fortnight after an injury is recovery, not prediction.
    let inWashout = false;
    for (const j of injuryIdx) if (i >= j && i - j < WASHOUT_DAYS) inWashout = true;
    if (inWashout || i < 28) continue;

    const week = daily.slice(i - 6, i + 1);
    const prev = daily.slice(i - 13, i - 6);
    const month = daily.slice(i - 27, i + 1);
    const weekKm = week.reduce((s, x) => s + x.km, 0);
    const prevKm = prev.reduce((s, x) => s + x.km, 0);
    const monthKm = month.reduce((s, x) => s + x.km, 0);
    const ramp = prevKm > 0 ? (weekKm - prevKm) / prevKm : 0;
    const kmRatio = monthKm > 0 ? weekKm / (monthKm / 4) : 0;
    const loads = week.map((x) => x.load);
    const sd = standardDeviation(loads);
    const monotony = sd > 0 ? mean(loads) / sd : 0;
    const strain = loads.reduce((s, x) => s + x, 0) * monotony;

    const window = daily.slice(i - 27, i + 1).map((x) => byDate.get(x.date)).filter((m): m is NonNullable<typeof m> => !!m);
    const today = byDate.get(d.date);
    const rel = (now: number | null | undefined, base: number | null) => (now == null || base == null || base === 0 ? 0 : (now - base) / base);
    const restingHr = rel(today?.resting_hr, median(window.map((m) => m.resting_hr).filter((v): v is number => v != null)));
    const hrv = rel(today?.hrv, median(window.map((m) => m.hrv).filter((v): v is number => v != null)));
    const sleep = rel(today?.sleep_hours, median(window.map((m) => m.sleep_hours).filter((v): v is number => v != null)));
    const sore = Math.max(...[0, 1, 2].map((k) => soreByDate.get(daily[i - k]?.date ?? "") ?? 0));

    let y: 0 | 1 = 0;
    for (const j of injuryIdx) if (j > i && j - i <= HORIZON_DAYS) y = 1;

    rows.push({
      athleteId,
      date: d.date,
      x: [d.acwr ?? 0, kmRatio, weekKm, ramp, monotony, strain, sinceRest, sinceRun, restingHr, hrv, sleep, sore],
      y,
      acute: d.acute,
      chronic: d.chronic,
      ratio: d.acwr,
    });
  }
  return rows;
}

/**
 * Standardise each feature against the athlete's own year, so the model
 * learns WHEN an athlete is unusual for themselves rather than WHO runs the
 * most. Without this, leave-one-athlete-out punishes the model for learning
 * athlete identity: it scored below chance on the sample team.
 */
export function standardizeWithinAthlete(rows: Row[]): Row[] {
  const p = rows[0]?.x.length ?? 0;
  const byAthlete = new Map<number, Row[]>();
  for (const r of rows) byAthlete.set(r.athleteId, [...(byAthlete.get(r.athleteId) ?? []), r]);
  const out: Row[] = [];
  for (const group of byAthlete.values()) {
    const means = Array.from({ length: p }, (_, j) => mean(group.map((r) => r.x[j])));
    const sds = Array.from({ length: p }, (_, j) => standardDeviation(group.map((r) => r.x[j]), 0) || 1);
    for (const r of group) out.push({ ...r, x: r.x.map((v, j) => (v - means[j]) / sds[j]) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Logistic regression
 * ------------------------------------------------------------------ */

export type Fitted = { weights: number[]; bias: number; means: number[]; sds: number[]; iterations: number };

export function trainLogistic(X: number[][], y: number[], { l2 = 1.0, iterations = 400, lr = 0.5 } = {}): Fitted {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const means = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const sds = Array.from({ length: p }, (_, j) => standardDeviation(X.map((r) => r[j]), 0) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / sds[j]));
  const w = new Array<number>(p).fill(0);
  let b = Math.log(Math.max(1e-6, mean(y)) / Math.max(1e-6, 1 - mean(y)));
  for (let it = 0; it < iterations; it++) {
    const gw = new Array<number>(p).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < p; j++) z += w[j] * Z[i][j];
      const pr = 1 / (1 + Math.exp(-z));
      const err = pr - y[i];
      for (let j = 0; j < p; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < p; j++) w[j] -= lr * (gw[j] / n + (l2 / n) * w[j]);
    b -= lr * (gb / n);
  }
  return { weights: w, bias: b, means, sds, iterations };
}

export function predict(model: Fitted, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < x.length; j++) z += model.weights[j] * ((x[j] - model.means[j]) / model.sds[j]);
  return 1 / (1 + Math.exp(-z));
}

/** Pooled out-of-fold scores: train on every athlete but one, score that one. */
export function leaveOneAthleteOut(rows: Row[], opts?: { l2?: number; iterations?: number }): { scores: number[]; labels: number[]; tested: Row[]; folds: number } {
  const ids = [...new Set(rows.map((r) => r.athleteId))];
  const scores: number[] = [];
  const labels: number[] = [];
  const tested: Row[] = [];
  let folds = 0;
  for (const id of ids) {
    const train = rows.filter((r) => r.athleteId !== id);
    const test = rows.filter((r) => r.athleteId === id);
    if (!train.some((r) => r.y === 1) || !test.length) continue;
    const m = trainLogistic(train.map((r) => r.x), train.map((r) => r.y), opts);
    for (const r of test) {
      scores.push(predict(m, r.x));
      labels.push(r.y);
      tested.push(r);
    }
    folds++;
  }
  return { scores, labels, tested, folds };
}

function bootstrapAuc(x: number[], y: number[], draws: number, seed: number): [number, number] {
  const rnd = seededRandom(seed);
  const n = x.length;
  const out: number[] = [];
  const bx = new Array<number>(n);
  const by = new Array<number>(n);
  for (let d = 0; d < draws; d++) {
    let pos = false;
    let neg = false;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * n);
      bx[k] = x[i];
      by[k] = y[i];
      if (by[k] === 1) pos = true;
      else neg = true;
    }
    if (!pos || !neg) continue;
    const a = aucBinary(bx, by);
    if (!Number.isNaN(a)) out.push(a);
  }
  return out.length >= 10 ? [percentile(out, 2.5), percentile(out, 97.5)] : [NaN, NaN];
}

/**
 * Paired bootstrap of AUC(model) - AUC(ratio) over the same rows: the two
 * scores are resampled together, so the interval is for the gap itself rather
 * than two overlapping intervals read against each other.
 */
function bootstrapDelta(a: number[], b: number[], y: number[], draws: number, seed: number): [number, number] {
  const rnd = seededRandom(seed);
  const n = a.length;
  const out: number[] = [];
  const ba = new Array<number>(n);
  const bb = new Array<number>(n);
  const by = new Array<number>(n);
  for (let d = 0; d < draws; d++) {
    let pos = false;
    let neg = false;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * n);
      ba[k] = a[i];
      bb[k] = b[i];
      by[k] = y[i];
      if (by[k] === 1) pos = true;
      else neg = true;
    }
    if (!pos || !neg) continue;
    const dlt = aucBinary(ba, by) - aucBinary(bb, by);
    if (!Number.isNaN(dlt)) out.push(dlt);
  }
  return out.length >= 10 ? [percentile(out, 2.5), percentile(out, 97.5)] : [NaN, NaN];
}

/** Everything from rows: the honest AUC, the two comparisons, the coefficients. */
export function evaluate(rows: Row[], { bootDraws = 300, noiseDraws = 60, seed = 0 } = {}): NonNullable<TeamModel["result"]> {
  const t0 = Date.now();
  const cv = leaveOneAthleteOut(rows);
  const auc = aucBinary(cv.scores, cv.labels);
  const [aucCiLow, aucCiHigh] = bootstrapAuc(cv.scores, cv.labels, bootDraws, seed);

  const usable = rows.filter((r) => r.ratio !== null && Number.isFinite(r.ratio));
  const ratioAuc = aucBinary(usable.map((r) => r.ratio as number), usable.map((r) => r.y));
  const paired = cv.tested.map((r, i) => ({ r, s: cv.scores[i] })).filter(({ r }) => r.ratio !== null && Number.isFinite(r.ratio));
  const pairedModel = paired.map((p) => p.s);
  const pairedRatio = paired.map((p) => p.r.ratio as number);
  const pairedY = paired.map((p) => p.r.y);
  const deltaRatio = aucBinary(pairedModel, pairedY) - aucBinary(pairedRatio, pairedY);
  const [deltaCiLow, deltaCiHigh] = bootstrapDelta(pairedModel, pairedRatio, pairedY, bootDraws, seed + 1);
  const acute = usable.map((r) => r.acute);
  const chronic = usable.map((r) => r.chronic);
  const nulls: number[] = [];
  for (let d = 0; d < noiseDraws; d++) {
    const nr = nullChronicRatio(acute, chronic, "shuffle", seed + d);
    const xs: number[] = [];
    const ys: number[] = [];
    nr.forEach((v, i) => {
      if (Number.isFinite(v)) {
        xs.push(v);
        ys.push(usable[i].y);
      }
    });
    const a = aucBinary(xs, ys);
    if (!Number.isNaN(a)) nulls.push(a);
  }

  const full = trainLogistic(rows.map((r) => r.x), rows.map((r) => r.y));
  const coefficients = FEATURES.map((f, j) => ({ key: f.key, label: f.label, weight: full.weights[j] })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return {
    auc,
    aucCiLow,
    aucCiHigh,
    ratioAuc,
    deltaRatio,
    deltaCiLow,
    deltaCiHigh,
    noiseAuc: nulls.length ? mean(nulls) : NaN,
    noiseCiLow: nulls.length >= 10 ? percentile(nulls, 2.5) : NaN,
    noiseCiHigh: nulls.length >= 10 ? percentile(nulls, 97.5) : NaN,
    coefficients,
    folds: cv.folds,
    iterations: full.iterations,
    elapsedMs: Date.now() - t0,
  };
}

/* ------------------------------------------------------------------ *
 * From the database
 * ------------------------------------------------------------------ */

export async function buildTeamModel(teamId: number, nowMs: number): Promise<TeamModel> {
  const now = new Date(nowMs);
  const since = new Date(nowMs - MODEL_DAYS * DAY_MS).toISOString();
  const roster = await athletesForTeam(teamId);
  const perAthlete = await Promise.all(
    roster.map(async (a) => {
      const [acts, metrics, soreness, injuries] = await Promise.all([
        activitiesForAthlete(a.id, since),
        metricsForAthlete(a.id, since),
        sorenessHistory(a.id, since.slice(0, 10)),
        injuriesForAthlete(a.id),
      ]);
      const daily = acwrSeries(dailySeries(acts, MODEL_DAYS, now));
      return featureRows(a.id, daily, metrics, soreness, injuries.map((i) => i.date));
    }),
  );
  const rows = standardizeWithinAthlete(perAthlete.flat());
  const events = rows.filter((r) => r.y === 1).length;
  const injuryWeeks = new Set(rows.filter((r) => r.y === 1).map((r) => `${r.athleteId}`)).size;
  const base = { days: MODEL_DAYS, athletes: roster.length, rows: rows.length, events };
  if (rows.length < 200 || events < MINIMUM_EVENTS || injuryWeeks < 3) {
    return { ...base, result: null, reason: `${events} injury-week days across ${injuryWeeks} athlete${injuryWeeks === 1 ? "" : "s"}; a model needs at least ${MINIMUM_EVENTS} spread across three athletes before leave-one-athlete-out means anything.` };
  }
  return { ...base, result: evaluate(rows), reason: null };
}
