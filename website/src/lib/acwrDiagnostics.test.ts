/**
 * The TypeScript port against the Python reference (`acwr` package):
 * every ratio value, percentile, Pearson and Spearman to 1e-9 on three
 * seeded series, plus the hand-computed cases from the package's own tests.
 * Spearman is compared to the ties-resolved reference: with rest days,
 * consecutive 7-day windows holding the same single run are mathematically
 * tied; pandas' running rolling sum breaks those ties by round-off, a plain
 * sum ties them exactly. See generate_reference.py.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { describe, expect, it } from "vitest";

import ref from "./__fixtures__/acwr_reference.json";
import {
  acuteLoad,
  alphaSpan,
  athleteAudit,
  checkLoad,
  chronicLoad,
  median,
  pearson,
  percentile,
  ranks,
  referenceAcwr,
  rescalingCheckFromLoad,
  spearman,
  thresholdFromLoad,
  type AcwrMethod,
} from "./acwrDiagnostics";

type RefVal = number | null | "inf" | "-inf";
const num = (v: RefVal): number => (v === null ? NaN : v === "inf" ? Infinity : v === "-inf" ? -Infinity : v);
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

function expectSeries(ours: number[], theirs: RefVal[], label: string) {
  expect(ours.length, `${label} length`).toBe(theirs.length);
  let worst = 0;
  theirs.forEach((t, i) => {
    const r = num(t);
    const o = ours[i];
    if (Number.isNaN(r) || Number.isNaN(o)) expect(Number.isNaN(o) && Number.isNaN(r), `${label}[${i}] ${o} vs ${r}`).toBe(true);
    else if (!Number.isFinite(r) || !Number.isFinite(o)) expect(o, `${label}[${i}]`).toBe(r);
    else {
      worst = Math.max(worst, Math.abs(o - r));
      expect(o, `${label}[${i}]`).toBeCloseTo(r, 9);
    }
  });
  console.log(`${label}: ${ours.length} values, max |ours - python| = ${worst}`);
}

type Comp = { acute: RefVal[]; chronic: RefVal[]; acwr: RefVal[] };
type Series = { start: string; load: number[]; rac?: Comp; rau?: Comp; ewma?: Comp; diagnostics_rac?: Diag; diagnostics_rau?: Diag; diagnostics_ewma?: Diag };
type Diag = {
  rescaling: { n: number; spearman: number; spearman_ties_resolved: number; pearson: number; spearman_ci95: number[] };
  threshold: { n: number; percentiles: Record<string, number>; reference_flagged: number; reference_flagged_fraction: number; reference_percentile: number };
  quality: { n_days: number; n_training_days: number; ok: boolean; findings: { check: string; severity: string; dates: string[] }[] };
};
const R = ref as unknown as { gamma400: Series; rhythm500: Series; lumpy900: Series; hand: Record<string, number | string | string[]>; stats: { arr: number[]; percentiles: Record<string, number>; spearman_vs_index: number; pearson_vs_index: number } };

describe("statistics match numpy/scipy", () => {
  it("percentile uses linear interpolation", () => {
    for (const [p, v] of Object.entries(R.stats.percentiles)) expect(percentile(R.stats.arr, Number(p))).toBeCloseTo(v, 12);
    expect(percentile([4.2], 95)).toBe(4.2);
  });
  it("ranks average ties", () => {
    expect(ranks([3, 1, 4, 1, 5])).toEqual([3, 1.5, 4, 1.5, 5]);
  });
  it("spearman and pearson", () => {
    const idx = R.stats.arr.map((_, i) => i);
    expect(spearman(R.stats.arr, idx)).toBeCloseTo(R.stats.spearman_vs_index, 12);
    expect(pearson(R.stats.arr, idx)).toBeCloseTo(R.stats.pearson_vs_index, 12);
    expect(Number.isNaN(pearson([1, 1, 1], [1, 2, 3]))).toBe(true);
  });
});

describe("ratio methods", () => {
  const spike = [...rep(50, 28), ...rep(100, 7)];
  it("coupled and uncoupled match hand computation", () => {
    expect(referenceAcwr(spike, { method: "rac" }).ratio.at(-1)).toBeCloseTo(100 / 62.5, 12);
    expect(referenceAcwr(spike, { method: "rau" }).ratio.at(-1)).toBeCloseTo(2.0, 12);
    expect(referenceAcwr(spike, { method: "ewma" }).ratio.at(-1)).toBeCloseTo(R.hand.spike_ewma_last as number, 9);
  });
  it("warms up for a full chronic window on every method", () => {
    for (const m of ["rac", "rau", "ewma"] as AcwrMethod[]) {
      const r = referenceAcwr(rep(50, 40), { method: m }).ratio;
      expect(r.filter(Number.isNaN).length, m).toBe(27);
      expect(Number.isNaN(r[27])).toBe(false);
    }
  });
  it("ewma follows lambda = 2/(N+1)", () => {
    expect(alphaSpan(7)).toBeCloseTo(0.25, 15);
    const a = acuteLoad([...rep(0, 10), 100, ...rep(0, 10)], 7, "ewma", 1);
    expect(a[10]).toBeCloseTo(25, 12);
    expect(a[11]).toBeCloseTo(18.75, 12);
    expect(referenceAcwr(rep(50, 400), { method: "ewma" }).ratio.at(-1)).toBeCloseTo(1, 9);
  });
  it("reports division by zero as what it is", () => {
    expect(referenceAcwr([...rep(0, 28), ...rep(10, 7)], { method: "rau" }).ratio.at(-1)).toBe(Infinity);
    expect(Number.isNaN(referenceAcwr(rep(0, 40)).ratio.at(-1)!)).toBe(true);
    expect(() => referenceAcwr(rep(50, 40), { acute: 7, chronic: 7 })).toThrow();
    expect(() => chronicLoad([], 7, 28)).toThrow();
  });
  it("the coupled ratio can never exceed chronic/acute", () => {
    for (const v of referenceAcwr(R.lumpy900.load).ratio) if (Number.isFinite(v)) expect(v).toBeLessThanOrEqual(4 + 1e-9);
    expect(referenceAcwr([...rep(0, 28), ...rep(10, 7)]).ratio.at(-1)).toBeCloseTo(4, 12);
  });
  it("gamma400 matches python for all three methods", () => {
    for (const m of ["rac", "rau", "ewma"] as AcwrMethod[]) {
      const ours = referenceAcwr(R.gamma400.load, { method: m });
      const theirs = R.gamma400[m]!;
      expectSeries(ours.acute, theirs.acute, `gamma400 ${m} acute`);
      expectSeries(ours.chronic, theirs.chronic, `gamma400 ${m} chronic`);
      expectSeries(ours.ratio, theirs.acwr, `gamma400 ${m} acwr`);
    }
  });
  it("rhythm500 with rest days and lumpy900 with layoffs match python", () => {
    expectSeries(referenceAcwr(R.rhythm500.load).ratio, R.rhythm500.rac!.acwr, "rhythm500 rac");
    expectSeries(referenceAcwr(R.rhythm500.load, { method: "ewma" }).ratio, R.rhythm500.ewma!.acwr, "rhythm500 ewma");
    expectSeries(referenceAcwr(R.lumpy900.load).ratio, R.lumpy900.rac!.acwr, "lumpy900 rac");
    expectSeries(referenceAcwr(R.lumpy900.load, { method: "rau" }).ratio, R.lumpy900.rau!.acwr, "lumpy900 rau");
  });
});

describe("diagnostics match python", () => {
  function check(s: Series, d: Diag, method: AcwrMethod, label: string) {
    const r = rescalingCheckFromLoad(s.load, { method, draws: 2000, seed: 0 });
    expect(r.n, `${label} n`).toBe(d.rescaling.n);
    expect(r.pearson).toBeCloseTo(d.rescaling.pearson, 9);
    expect(r.spearman).toBeCloseTo(d.rescaling.spearman_ties_resolved, 9);
    expect(Math.abs(r.spearman - d.rescaling.spearman)).toBeLessThan(1e-6);
    expect(r.ciLow).toBeLessThan(r.spearman);
    expect(r.ciHigh).toBeGreaterThan(r.spearman);
    expect(Math.abs(r.ciLow - d.rescaling.spearman_ci95[0])).toBeLessThan(0.02);
    expect(Math.abs(r.ciHigh - d.rescaling.spearman_ci95[1])).toBeLessThan(0.02);
    console.log(`${label}: spearman ${r.spearman} [${r.ciLow}, ${r.ciHigh}] python [${d.rescaling.spearman_ci95}]`);
    const t = thresholdFromLoad(s.load, { method });
    expect(t.n).toBe(d.threshold.n);
    expect(t.referenceFlagged).toBe(d.threshold.reference_flagged);
    expect(t.referenceFlaggedFraction).toBeCloseTo(d.threshold.reference_flagged_fraction, 12);
    expect(t.referencePercentile).toBeCloseTo(d.threshold.reference_percentile, 9);
    for (const [p, v] of Object.entries(d.threshold.percentiles)) expect(t.percentiles[p], `${label} p${p}`).toBeCloseTo(v, 9);
    const q = checkLoad(s.load);
    expect(q.nDays).toBe(d.quality.n_days);
    expect(q.nTrainingDays).toBe(d.quality.n_training_days);
    expect(q.ok).toBe(d.quality.ok);
    expect(q.findings.map((f) => f.check)).toEqual(d.quality.findings.map((f) => f.check));
  }
  it("gamma400 rac and ewma", () => {
    check(R.gamma400, R.gamma400.diagnostics_rac!, "rac", "gamma400 rac");
    check(R.gamma400, R.gamma400.diagnostics_ewma!, "ewma", "gamma400 ewma");
  });
  it("rhythm500 rac", () => check(R.rhythm500, R.rhythm500.diagnostics_rac!, "rac", "rhythm500 rac"));
  it("lumpy900 rac and rau", () => {
    check(R.lumpy900, R.lumpy900.diagnostics_rac!, "rac", "lumpy900 rac");
    check(R.lumpy900, R.lumpy900.diagnostics_rau!, "rau", "lumpy900 rau");
  });
  it("a constant denominator makes the ratio a copy of the numerator", () => {
    const s = referenceAcwr(R.rhythm500.load);
    const acute = s.acute.filter((v) => !Number.isNaN(v));
    const c = median(s.chronic.filter((v) => !Number.isNaN(v)));
    expect(spearman(acute, acute.map((v) => v / c))).toBeCloseTo(1, 12);
  });
  it("needs enough days and says so", () => {
    expect(() => rescalingCheckFromLoad(rep(50, 20))).toThrow(/usable days/);
    expect(() => thresholdFromLoad(rep(10, 20))).toThrow(/no usable days/);
  });
  it("infinite days count as flagged but stay out of the percentiles", () => {
    const t = thresholdFromLoad([...rep(0, 40), ...rep(20, 200)], { method: "rau" });
    expect(Object.values(t.percentiles).every(Number.isFinite)).toBe(true);
    const inf = referenceAcwr([...rep(0, 40), ...rep(20, 200)], { method: "rau" }).ratio.filter((v) => v === Infinity).length;
    expect(inf).toBeGreaterThan(0);
    expect(t.referenceFlagged).toBeGreaterThanOrEqual(inf);
  });
});

describe("data check", () => {
  const checks = (load: number[], o?: Parameters<typeof checkLoad>[1]) => new Set(checkLoad(load, o).findings.map((f) => f.check));
  it("an ordinary log passes with nothing to report", () => {
    const q = checkLoad(R.gamma400.load);
    expect(q.ok).toBe(true);
    expect(q.findings).toEqual([]);
  });
  it("short history, no training and negative loads are errors", () => {
    const q = checkLoad(rep(10, 20));
    expect(q.ok).toBe(false);
    expect(q.errors[0].message).toBe(R.hand.short20_error);
    expect(checks(rep(0, 60)).has("no training")).toBe(true);
    const v = rep(10, 60); v[30] = -5;
    expect(checkLoad(v).findings.find((f) => f.check === "negative load")!.dayIndices).toEqual([30]);
  });
  it("a watch left running is an outlier, a long run is not", () => {
    const v = rep(10, 100); v[50] = 900;
    const f = checkLoad(v).findings.find((x) => x.check === "outlier days")!;
    expect(f.dayIndices).toEqual([50]);
    expect(f.message).toBe(R.hand.outlier_message);
    expect(checks(R.gamma400.load).has("outlier days")).toBe(false);
    const w = rep(10, 100); w[50] = 25;
    expect(checks(w).has("outlier days")).toBe(false);
    expect(checks(w, { outlierFactor: 2 }).has("outlier days")).toBe(true);
  });
  it("a unit change is caught, a fitness change is not", () => {
    const f = checkLoad([...rep(10, 100), ...rep(10000, 100)]).findings.find((x) => x.check === "suspected unit change")!;
    expect(f.message).toContain("factor of 1000");
    expect(checks([...rep(20, 100), ...rep(40, 100)]).has("suspected unit change")).toBe(false);
  });
  it("a long break is reported with the day it ends", () => {
    const f = checkLoad([...rep(10, 60), ...rep(0, 30), ...rep(10, 60)]).findings.find((x) => x.check === "break")!;
    expect(f.message).toContain("30 days");
    expect(f.dayIndices).toEqual([89]);
    expect(checks([10, 0, 10, 0, 10, 0, 10].flatMap((x) => rep(x, 1)).concat(...rep(0, 0)).length ? Array(20).fill([10, 0, 10, 0, 10, 0, 10]).flat() : []).has("break")).toBe(false);
  });
  it("notes: mostly rest, few usable days, constant load", () => {
    expect(checks(Array(20).fill([10, 0, 0, 0, 0]).flat()).has("mostly rest")).toBe(true);
    expect(checks(rep(10, 40)).has("few usable days")).toBe(true);
    expect(checks(rep(10, 60)).has("constant load")).toBe(true);
  });
  it("lumpy900 findings match python with dates", () => {
    const d = R.lumpy900.diagnostics_rac!.quality;
    const q = checkLoad(R.lumpy900.load);
    expect(q.findings.map((f) => f.check)).toEqual(d.findings.map((f) => f.check));
    const start = new Date(R.lumpy900.start + "T00:00:00Z");
    const dates = q.findings[0].dayIndices.map((i) => new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
    expect(dates).toEqual(d.findings[0].dates);
  });
});

describe("athlete audit bundle", () => {
  it("runs over the product's own series shape", () => {
    const load = R.rhythm500.load;
    const s = referenceAcwr(load, { method: "ewma" });
    const series = load.map((l, i) => ({ date: `d${i}`, load: l, acute: s.acute[i], chronic: s.chronic[i], acwr: Number.isNaN(s.ratio[i]) ? null : s.ratio[i] }));
    const a = athleteAudit(series, { draws: 200 });
    expect(a.days).toBe(500);
    expect(a.usableDays).toBe(473);
    expect(a.personalZones).not.toBeNull();
    expect(a.rescaling!.n).toBe(473);
    expect(a.threshold!.percentiles["95"]).toBeGreaterThan(1);
    expect(a.quality.ok).toBe(true);
  });
  it("says not enough history instead of guessing", () => {
    const a = athleteAudit(rep(0, 10).map((_, i) => ({ date: `d${i}`, load: 10, acute: 10, chronic: 10, acwr: null })));
    expect(a.threshold).toBeNull();
    expect(a.rescaling).toBeNull();
    expect(a.personalZones).toBeNull();
    expect(a.quality.ok).toBe(false);
  });
});
