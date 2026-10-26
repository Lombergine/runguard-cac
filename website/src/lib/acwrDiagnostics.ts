/**
 * The acute:chronic workload ratio, and the tests of whether it means anything.
 *
 * Ported from Aditya Garg's Python package `acwr` (github.com/Lombergine/acwr):
 * the three published ratio methods, the Impellizzeri rescaling check, the
 * personal-threshold report and the data-quality pre-flight. Pure functions
 * over number arrays — no database, no HTTP — so `acwrDiagnostics.test.ts`
 * can check every output against numbers the Python package produced for the
 * same inputs (`__fixtures__/acwr_reference.json`), to nine decimal places.
 *
 * NaN is used internally for "no value" (warm-up days); every exported REPORT
 * type carries only finite numbers or null, so it can go on the wire.
 *
 * Reference: Impellizzeri, F. M., Woodcock, S., Coutts, A. J., Fanchini, M.,
 * McCall, A., & Vigotsky, A. D. (2021). What role do chronic workloads play in
 * the acute to chronic workload ratio? Time to dismiss ACWR and its underlying
 * theory. Sports Medicine, 51(3), 581–592.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
 */

export type Method = "rac" | "rau" | "ewma";

/* ------------------------------------------------------------------ *
 * Statistics, matching numpy/scipy conventions exactly.
 * ------------------------------------------------------------------ */

export function mean(x: number[]): number {
  if (!x.length) return NaN;
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

/** Sample standard deviation (ddof = 1) by default. */
export function standardDeviation(x: number[], ddof = 1): number {
  if (x.length <= ddof) return NaN;
  const m = mean(x);
  let ss = 0;
  for (const v of x) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (x.length - ddof));
}

/** numpy's default linear interpolation: index p/100 * (n-1) into the sorted array. */
export function percentile(x: number[], p: number): number {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const n = s.length;
  if (n === 1) return s[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

export function median(x: number[]): number {
  return percentile(x, 50);
}

/** Ranks from 1, ties averaged (scipy rankdata "average"). */
export function ranks(x: number[]): number[] {
  const n = x.length;
  const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  const out = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && x[order[j + 1]] === x[order[i]]) j++;
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) out[order[k]] = avg;
    i = j + 1;
  }
  return out;
}

export function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2 || y.length !== n) return NaN;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

export function spearman(x: number[], y: number[]): number {
  return pearson(ranks(x), ranks(y));
}

/**
 * A small seedable generator (mulberry32) so a bootstrap interval is the same
 * every time it is computed from the same data. Not numpy's generator, so
 * intervals agree with the Python package to about two decimals; the point
 * estimates they bracket agree exactly.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * The three ratio methods. Full chronic warm-up: the first chronic-1 days
 * are NaN rather than computed from a partial window.
 * ------------------------------------------------------------------ */

export function alphaSpan(n: number): number {
  return 2 / (n + 1);
}

function rollingMean(x: number[], window: number, minPeriods: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  for (let i = 0; i < x.length; i++) {
    const lo = Math.max(0, i - window + 1);
    const count = i - lo + 1;
    if (count >= minPeriods) {
      let s = 0;
      for (let k = lo; k <= i; k++) s += x[k];
      out[i] = s / count;
    }
  }
  return out;
}

/** pandas ewm(alpha, adjust=false): s0 = x0, s_t = (1-a) s_{t-1} + a x_t. */
function ewma(x: number[], alpha: number, minPeriods: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  if (!x.length) return out;
  let s = x[0];
  for (let i = 0; i < x.length; i++) {
    if (i > 0) s = (1 - alpha) * s + alpha * x[i];
    if (i + 1 >= minPeriods) out[i] = s;
  }
  return out;
}

export function acuteLoad(load: number[], acute = 7, method: Method = "rac", minPeriods?: number): number[] {
  if (!load.length) throw new Error("load series is empty");
  if (acute < 1) throw new Error("acute must be at least 1 day");
  const mp = minPeriods ?? acute;
  return method === "ewma" ? ewma(load, alphaSpan(acute), mp) : rollingMean(load, acute, mp);
}

export function chronicLoad(
  load: number[],
  acute = 7,
  chronic = 28,
  method: Method = "rac",
  minPeriods?: number,
): number[] {
  if (!load.length) throw new Error("load series is empty");
  if (chronic <= acute) throw new Error(`chronic (${chronic}) must be longer than acute (${acute})`);
  if (method === "ewma") return ewma(load, alphaSpan(chronic), minPeriods ?? chronic);
  if (method === "rac") return rollingMean(load, chronic, minPeriods ?? chronic);
  // rau: the `chronic - acute` days ending the day before the acute window.
  const window = chronic - acute;
  const mp = minPeriods ?? window;
  const out = new Array<number>(load.length).fill(NaN);
  for (let i = 0; i < load.length; i++) {
    const end = i - acute;
    const lo = Math.max(0, end - window + 1);
    if (end < 0) continue;
    const count = end - lo + 1;
    if (count >= mp && count === window) {
      let s = 0;
      for (let k = lo; k <= end; k++) s += load[k];
      out[i] = s / count;
    }
  }
  return out;
}

export type RatioSeries = { acute: number[]; chronic: number[]; ratio: number[] };

/** x/0 = Infinity and 0/0 = NaN, as in the reference: never a made-up number. */
export function acwrSeriesOf(load: number[], acute = 7, chronic = 28, method: Method = "rac"): RatioSeries {
  const a = acuteLoad(load, acute, method);
  const c = chronicLoad(load, acute, chronic, method);
  return { acute: a, chronic: c, ratio: a.map((v, i) => v / c[i]) };
}

/* ------------------------------------------------------------------ *
 * Self-audit: how much of the ratio is its own numerator.
 * ------------------------------------------------------------------ */

export type RescalingResult = {
  n: number;
  spearman: number;
  pearson: number;
  /** NaN (null on the wire) when fewer than ten resamples were usable. */
  ciLow: number;
  ciHigh: number;
  draws: number;
  seed: number;
};

/** Percentile bootstrap on paired (acute, ratio) resamples. */
function spearmanCI(x: number[], y: number[], draws: number, seed: number): [number, number] {
  const rnd = seededRandom(seed);
  const n = x.length;
  const out: number[] = [];
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  for (let d = 0; d < draws; d++) {
    let firstX = NaN;
    let firstY = NaN;
    let varX = false;
    let varY = false;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * n);
      xs[k] = x[i];
      ys[k] = y[i];
      if (k === 0) {
        firstX = xs[0];
        firstY = ys[0];
      } else {
        if (xs[k] !== firstX) varX = true;
        if (ys[k] !== firstY) varY = true;
      }
    }
    if (!varX || !varY) continue;
    out.push(spearman(xs, ys));
  }
  if (out.length < 10) return [NaN, NaN];
  return [percentile(out, 2.5), percentile(out, 97.5)];
}

/**
 * Correlate a ratio series against its own acute-load numerator. Pass the
 * series the athlete is actually shown; non-finite pairs are dropped.
 */
export function rescalingCheck(
  acute: Array<number | null>,
  ratio: Array<number | null>,
  draws = 2000,
  seed = 0,
): RescalingResult {
  const a: number[] = [];
  const r: number[] = [];
  for (let i = 0; i < ratio.length; i++) {
    const x = acute[i];
    const y = ratio[i];
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      a.push(x);
      r.push(y);
    }
  }
  if (a.length < 3) throw new Error(`only ${a.length} usable days after dropping incomplete windows; need at least 3`);
  const [ciLow, ciHigh] = spearmanCI(a, r, draws, seed);
  return { n: a.length, spearman: spearman(a, r), pearson: pearson(a, r), ciLow, ciHigh, draws, seed };
}

/* ------------------------------------------------------------------ *
 * Personal threshold: where 1.5 sits in this athlete's own distribution.
 * ------------------------------------------------------------------ */

export type ThresholdReport = {
  /** Days with a defined ratio, infinite ones included. */
  n: number;
  percentiles: Record<string, number>;
  reference: number;
  referenceFlagged: number;
  referenceFlaggedFraction: number;
  referencePercentile: number;
};

export function thresholdFromHistory(
  ratio: Array<number | null>,
  percentiles: number[] = [50, 75, 90, 95, 99],
  reference = 1.5,
): ThresholdReport {
  const usable = ratio.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!usable.length) throw new Error("no usable days; the series is shorter than the warm-up");
  const finite = usable.filter((v) => Number.isFinite(v));
  if (!finite.length) throw new Error("every usable day is infinite; percentiles are undefined");
  const values: Record<string, number> = {};
  for (const p of percentiles) values[String(p)] = percentile(finite, p);
  const flagged = usable.filter((v) => v > reference).length;
  const fraction = flagged / usable.length;
  return {
    n: usable.length,
    percentiles: values,
    reference,
    referenceFlagged: flagged,
    referenceFlaggedFraction: fraction,
    referencePercentile: 100 * (1 - fraction),
  };
}

/* ------------------------------------------------------------------ *
 * Data-quality pre-flight.
 * ------------------------------------------------------------------ */

export type QualityCheck =
  | "history"
  | "no training"
  | "negative load"
  | "unobserved days"
  | "outlier days"
  | "suspected unit change"
  | "extreme dynamic range"
  | "break"
  | "mostly rest"
  | "few usable days"
  | "constant load";

export type Severity = "error" | "warning" | "note";

export type Finding = {
  check: QualityCheck;
  severity: Severity;
  message: string;
  /** Indices into the series; the caller maps them to dates. */
  dayIndices: number[];
};

export type LoadQuality = {
  nDays: number;
  nTrainingDays: number;
  findings: Finding[];
  /** Findings that make a computed ratio meaningless rather than suspect. */
  errors: Finding[];
  /** Findings that change the answer without invalidating it. */
  warnings: Finding[];
  /** True when nothing disqualifying was found; warnings may still exist. */
  ok: boolean;
};

/** Python's %.4g, near enough: four significant figures, integers plain. */
function g4(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e6) return String(x);
  return Number(x.toPrecision(4)).toString();
}

function longestZeroRun(load: number[]): [number, number | null] {
  let best = 0;
  let run = 0;
  let bestEnd: number | null = null;
  load.forEach((v, i) => {
    if (Number.isNaN(v) || v === 0) {
      run++;
      if (run > best) {
        best = run;
        bestEnd = i;
      }
    } else run = 0;
  });
  return [best, bestEnd];
}

export function checkLoad(
  load: number[],
  { chronic = 28, breakDays = 10, outlierFactor = 3, unitShiftFactor = 50 } = {},
): LoadQuality {
  const findings: Finding[] = [];
  const nDays = load.length;
  const observedIdx = load.map((v, i) => (Number.isNaN(v) ? -1 : i)).filter((i) => i >= 0);
  const trainingIdx = observedIdx.filter((i) => load[i] > 0);
  const training = trainingIdx.map((i) => load[i]);
  const nTraining = training.length;

  if (nDays < chronic) {
    findings.push({
      check: "history",
      severity: "error",
      message: `${nDays} days of history is shorter than the ${chronic} day chronic window`,
      dayIndices: [],
    });
  }
  if (nTraining === 0) {
    findings.push({ check: "no training", severity: "error", message: "every observed day is zero or missing", dayIndices: [] });
  }
  const negative = observedIdx.filter((i) => load[i] < 0);
  if (negative.length) {
    findings.push({
      check: "negative load",
      severity: "error",
      message: `${negative.length} day(s) carry a negative load`,
      dayIndices: negative.slice(0, 5),
    });
  }
  const missing = load.map((v, i) => (Number.isNaN(v) ? i : -1)).filter((i) => i >= 0);
  if (missing.length) {
    findings.push({
      check: "unobserved days",
      severity: "warning",
      message: `${missing.length} day(s) are unobserved rather than zero, so every window touching them is undefined`,
      dayIndices: missing.slice(0, 5),
    });
  }
  if (nTraining >= 10) {
    const upper = percentile(training, 95);
    const big = trainingIdx.filter((i) => load[i] > outlierFactor * upper);
    if (big.length) {
      const largest = Math.max(...big.map((i) => load[i]));
      findings.push({
        check: "outlier days",
        severity: "warning",
        message: `${big.length} day(s) exceed ${g4(outlierFactor)} times the 95th percentile training day of ${g4(upper)}, the largest being ${g4(largest)}`,
        dayIndices: [...big].sort((p, q) => load[q] - load[p]).slice(0, 5),
      });
    }
    const half = Math.floor(nDays / 2);
    const first = trainingIdx.filter((i) => i < half).map((i) => load[i]);
    const second = trainingIdx.filter((i) => i >= half).map((i) => load[i]);
    if (first.length >= 5 && second.length >= 5) {
      const a = median(first);
      const b = median(second);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (lo > 0 && hi / lo > unitShiftFactor) {
        findings.push({
          check: "suspected unit change",
          severity: "warning",
          message: `the median training day is ${g4(a)} in the first half of the series and ${g4(b)} in the second, a factor of ${Math.round(hi / lo)}. A change of recording unit is far more likely than a change of that size in training`,
          dayIndices: [half],
        });
      }
    }
    const smallest = Math.min(...training);
    const largest = Math.max(...training);
    if (smallest > 0 && largest / smallest > 1e9) {
      findings.push({
        check: "extreme dynamic range",
        severity: "warning",
        message: `training loads span a factor of ${(largest / smallest).toExponential(1)}, which is wide enough for the rolling sums to lose precision`,
        dayIndices: [],
      });
    }
  }
  const [longest, ends] = longestZeroRun(load);
  if (longest >= breakDays && ends !== null) {
    findings.push({
      check: "break",
      severity: "warning",
      message: `the longest run of zero-load days is ${longest} days. The ratio on the days after it is dominated by the break rather than by the training`,
      dayIndices: [ends],
    });
  }
  if (nDays > 0) {
    const rest = 1 - nTraining / nDays;
    if (rest > 0.5) {
      findings.push({
        check: "mostly rest",
        severity: "note",
        message: `${Math.round(100 * rest)}% of days carry no load, so the chronic window is mostly zeros and the ratio will be volatile`,
        dayIndices: [],
      });
    }
  }
  if (nDays >= chronic) {
    const usable = nDays - chronic + 1;
    if (usable < 30) {
      findings.push({
        check: "few usable days",
        severity: "note",
        message: `only ${usable} day(s) will carry a ratio once the ${chronic} day warm-up is taken out`,
        dayIndices: [],
      });
    }
  }
  if (nTraining > 0 && Math.min(...training) === Math.max(...training)) {
    findings.push({
      check: "constant load",
      severity: "note",
      message: "every training day carries the same load, so the ratio is 1.0 wherever it is defined",
      dayIndices: [],
    });
  }
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  return { nDays, nTrainingDays: nTraining, findings, errors, warnings, ok: errors.length === 0 };
}

/* ------------------------------------------------------------------ *
 * Convenience entry points from a daily load series.
 * ------------------------------------------------------------------ */

export type AcwrMethod = Method;
export type AcwrOptions = { acute?: number; chronic?: number; method?: Method };

/** The three ratio methods, from a daily load series, with full warm-up. */
export function referenceAcwr(load: number[], { acute = 7, chronic = 28, method = "rac" }: AcwrOptions = {}): RatioSeries {
  return acwrSeriesOf(load, acute, chronic, method);
}

export function rescalingCheckFromLoad(
  load: number[],
  { acute = 7, chronic = 28, method = "rac", draws = 2000, seed = 0 }: AcwrOptions & { draws?: number; seed?: number } = {},
): RescalingResult {
  const s = acwrSeriesOf(load, acute, chronic, method);
  return rescalingCheck(s.acute, s.ratio, draws, seed);
}

export function thresholdFromLoad(
  load: number[],
  { acute = 7, chronic = 28, method = "rac", percentiles, reference = 1.5 }: AcwrOptions & { percentiles?: number[]; reference?: number } = {},
): ThresholdReport {
  return thresholdFromHistory(acwrSeriesOf(load, acute, chronic, method).ratio, percentiles, reference);
}

/* ------------------------------------------------------------------ *
 * The bundle that rides on the athlete's profile.
 * ------------------------------------------------------------------ */

/** One day of the product's own series: `DailyPoint` in risk.ts, loosely. */
export type AuditDay = { date: string; load: number; acute: number; chronic: number; acwr: number | null };

export type AuditFinding = { check: QualityCheck; severity: Severity; message: string; dates: string[] };

export type AthleteAudit = {
  /** The ratio the audit ran on: the EWMA series the athlete is shown. */
  method: "ewma";
  days: number;
  /** Days that carry a ratio once the warm-up is taken out. */
  usableDays: number;
  quality: { nDays: number; nTrainingDays: number; ok: boolean; findings: AuditFinding[] };
  /** Null until at least one day carries a ratio. */
  threshold: ThresholdReport | null;
  /** Null until at least three days carry a ratio. */
  rescaling: RescalingResult | null;
  /**
   * Cut points learned from the athlete's own distribution — caution from
   * their 90th percentile, high above their 95th — once `usableDays` reaches
   * `personalZonesMinimumDays`. Reported, not applied: the athlete screens
   * never rank the athlete (stats.tsx), so these draw a line on the chart
   * and a sentence on the card.
   */
  personalZones: { caution: number; high: number } | null;
  personalZonesMinimumDays: number;
};

/** Below this many usable days the percentiles are computable but not worth acting on. */
export const PERSONAL_ZONES_MINIMUM_DAYS = 60;

/**
 * Audit the series the product actually shows. The rescaling check
 * correlates the shown ratio against its own acute leg; the threshold
 * report reads the shown ratio's distribution; the data check reads the
 * daily load. Server-side the bootstrap is 500 draws (about 100 ms on a
 * year of data); the reference uses 2000.
 */
export function athleteAudit(series: AuditDay[], { draws = 500, seed = 0 }: { draws?: number; seed?: number } = {}): AthleteAudit {
  const load = series.map((d) => d.load);
  const quality = checkLoad(load);
  const ratio = series.map((d) => d.acwr);
  const acute = series.map((d) => (d.acwr === null ? null : d.acute));
  let threshold: ThresholdReport | null = null;
  let rescaling: RescalingResult | null = null;
  try {
    threshold = thresholdFromHistory(ratio);
  } catch {
    threshold = null;
  }
  try {
    rescaling = rescalingCheck(acute, ratio, draws, seed);
  } catch {
    rescaling = null;
  }
  const usableDays = threshold?.n ?? 0;
  const p90 = threshold?.percentiles["90"];
  const p95 = threshold?.percentiles["95"];
  const personalZones =
    threshold && usableDays >= PERSONAL_ZONES_MINIMUM_DAYS && p90 !== undefined && p95 !== undefined && Number.isFinite(p90) && Number.isFinite(p95)
      ? { caution: p90, high: p95 }
      : null;
  return {
    method: "ewma",
    days: quality.nDays,
    usableDays,
    quality: {
      nDays: quality.nDays,
      nTrainingDays: quality.nTrainingDays,
      ok: quality.ok,
      findings: quality.findings.map((f) => ({
        check: f.check,
        severity: f.severity,
        message: f.message,
        dates: f.dayIndices.map((i) => series[i]?.date).filter((d): d is string => !!d),
      })),
    },
    threshold,
    rescaling,
    personalZones,
    personalZonesMinimumDays: PERSONAL_ZONES_MINIMUM_DAYS,
  };
}

/* ------------------------------------------------------------------ *
 * The Impellizzeri test proper: does the real ratio predict the outcome
 * better than a ratio whose chronic denominator is noise?
 * Port of `acwr.compare_to_null` / `null_chronic_acwr`.
 * ------------------------------------------------------------------ */

export type NullKind = "shuffle" | "normal" | "constant";

/**
 * Area under the ROC curve for a binary outcome, from the Mann-Whitney U
 * statistic with ties counted as half (scipy.stats.mannwhitneyu). NaN when
 * either class is empty.
 */
export function aucBinary(x: number[], y: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  for (let i = 0; i < x.length; i++) (y[i] === 1 ? pos : neg).push(x[i]);
  if (!pos.length || !neg.length) return NaN;
  // Rank-sum form: U = R_pos - n_pos(n_pos+1)/2, with average ranks for ties.
  const all = pos.concat(neg);
  const r = ranks(all);
  let rPos = 0;
  for (let i = 0; i < pos.length; i++) rPos += r[i];
  const u = rPos - (pos.length * (pos.length + 1)) / 2;
  return u / (pos.length * neg.length);
}

/**
 * A ratio whose denominator carries no real information: the genuine
 * acute leg over a chronic leg that has been shuffled, redrawn from a
 * matched normal, or replaced by its mean. NaN where the real chronic
 * leg was undefined.
 */
export function nullChronicRatio(acute: number[], chronic: number[], kind: NullKind, seed: number): number[] {
  const validIdx = chronic.map((c, i) => (Number.isFinite(c) ? i : -1)).filter((i) => i >= 0);
  const real = validIdx.map((i) => chronic[i]);
  if (real.length < 2) throw new Error("not enough chronic load values to build a null model");
  const rnd = seededRandom(seed);
  let fake: number[];
  if (kind === "shuffle") {
    fake = [...real];
    for (let i = fake.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [fake[i], fake[j]] = [fake[j], fake[i]];
    }
  } else if (kind === "normal") {
    const m = mean(real);
    const sd = standardDeviation(real) || 1;
    const floor = Math.max(m * 1e-3, 1e-9);
    fake = real.map(() => {
      // Box-Muller
      const u1 = Math.max(rnd(), 1e-12);
      const u2 = rnd();
      return Math.max(floor, m + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    });
  } else {
    const m = mean(real);
    fake = real.map(() => m);
  }
  const out = new Array<number>(acute.length).fill(NaN);
  validIdx.forEach((i, k) => {
    out[i] = acute[i] / fake[k];
  });
  return out;
}

export type NullComparison = {
  n: number;
  nEvents: number;
  measure: "AUC";
  real: number;
  realCiLow: number;
  realCiHigh: number;
  null: number;
  nullCiLow: number;
  nullCiHigh: number;
  nullKind: NullKind;
  nNullDraws: number;
  /** One-sided: the real statistic exceeds the null interval. */
  realBeatsNull: boolean;
  /** Either side: the real denominator helped, or actively cost signal. */
  realOutsideNull: boolean;
};

/**
 * Compare the real ratio's association with a binary outcome against
 * ratios built on contrived denominators. Takes the three legs of whatever
 * series produced the score on screen, aligned day by day with the outcome
 * (1 = event that day). Days where the ratio or outcome is undefined are
 * dropped. Descriptive, not a hypothesis test.
 */
export function compareToNull(
  acute: Array<number | null>,
  chronic: Array<number | null>,
  outcome: Array<number | null>,
  { kind = "shuffle", nNullDraws = 200, bootDraws = 2000, seed = 0 }: { kind?: NullKind; nNullDraws?: number; bootDraws?: number; seed?: number } = {},
): NullComparison {
  const a: number[] = [];
  const c: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < acute.length; i++) {
    const ai = acute[i];
    const ci = chronic[i];
    const yi = outcome[i];
    if (ai == null || ci == null || yi == null) continue;
    const r = ai / ci;
    if (!Number.isFinite(r) || Number.isNaN(yi)) continue;
    a.push(ai);
    c.push(ci);
    y.push(yi);
  }
  if (a.length < 10) throw new Error(`only ${a.length} aligned, complete observations; need at least 10`);
  const ratio = a.map((v, i) => v / c[i]);
  const real = aucBinary(ratio, y);

  const nulls: number[] = [];
  for (let d = 0; d < nNullDraws; d++) {
    const nr = nullChronicRatio(a, c, kind, seed + d);
    const xs: number[] = [];
    const ys: number[] = [];
    nr.forEach((v, i) => {
      if (Number.isFinite(v)) {
        xs.push(v);
        ys.push(y[i]);
      }
    });
    if (xs.length < 10) continue;
    const s = aucBinary(xs, ys);
    if (!Number.isNaN(s)) nulls.push(s);
  }
  if (nulls.length < 10) throw new Error("could not build enough null draws to describe a distribution");

  const rnd = seededRandom(seed);
  const n = ratio.length;
  const boots: number[] = [];
  const bx = new Array<number>(n);
  const by = new Array<number>(n);
  for (let b = 0; b < bootDraws; b++) {
    let anyPos = false;
    let anyNeg = false;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * n);
      bx[k] = ratio[i];
      by[k] = y[i];
      if (by[k] === 1) anyPos = true;
      else anyNeg = true;
    }
    if (!anyPos || !anyNeg) continue;
    const s = aucBinary(bx, by);
    if (!Number.isNaN(s)) boots.push(s);
  }
  const realCi: [number, number] = boots.length >= 10 ? [percentile(boots, 2.5), percentile(boots, 97.5)] : [NaN, NaN];
  const nullLo = percentile(nulls, 2.5);
  const nullHi = percentile(nulls, 97.5);
  return {
    n,
    nEvents: y.reduce((s, v) => s + v, 0),
    measure: "AUC",
    real,
    realCiLow: realCi[0],
    realCiHigh: realCi[1],
    null: mean(nulls),
    nullCiLow: nullLo,
    nullCiHigh: nullHi,
    nullKind: kind,
    nNullDraws: nulls.length,
    realBeatsNull: real > nullHi,
    realOutsideNull: real < nullLo || real > nullHi,
  };
}

/** The reference form: from a daily load series, with the chosen method. */
export function compareToNullFromLoad(
  load: number[],
  outcome: number[],
  { acute = 7, chronic = 28, method = "rac", ...rest }: AcwrOptions & { kind?: NullKind; nNullDraws?: number; bootDraws?: number; seed?: number } = {},
): NullComparison {
  const s = acwrSeriesOf(load, acute, chronic, method);
  return compareToNull(s.acute, s.chronic, outcome, rest);
}
