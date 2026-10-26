/**
 * The Impellizzeri test against the Python reference (`acwr.compare_to_null`).
 * The real AUC is deterministic and must match to 1e-9. The null and the
 * bootstrap use a different generator from numpy, so their means and
 * intervals agree to a couple of hundredths; the verdict must agree exactly.
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { describe, expect, it } from "vitest";
import ref from "./__fixtures__/acwr_reference.json";
import { aucBinary, compareToNull, compareToNullFromLoad, nullChronicRatio, referenceAcwr } from "./acwrDiagnostics";

type Case = { load: number[]; outcome: number[]; n: number; n_events: number; real: number; real_ci95: number[]; null: number; null_ci95: number[]; real_beats_null: boolean };
const R = (ref as unknown as { compare_to_null: { acute_driven: Case; ratio_driven: Case; auc_hand: { x: number[]; y: number[]; auc: number } } }).compare_to_null;

describe("AUC", () => {
  it("matches scipy's Mann-Whitney form with ties", () => {
    expect(aucBinary(R.auc_hand.x, R.auc_hand.y)).toBeCloseTo(R.auc_hand.auc, 12);
    expect(Number.isNaN(aucBinary([1, 2], [1, 1]))).toBe(true);
  });
});

describe("null denominators", () => {
  it("shuffle keeps the chronic distribution and loses its timing", () => {
    const s = referenceAcwr(R.acute_driven.load);
    const nr = nullChronicRatio(s.acute, s.chronic, "shuffle", 1);
    const implied = nr.map((v, i) => s.acute[i] / v).filter(Number.isFinite).sort((a, b) => a - b);
    const real = s.chronic.filter(Number.isFinite).sort((a, b) => a - b);
    expect(implied.length).toBe(real.length);
    implied.forEach((v, i) => expect(v).toBeCloseTo(real[i], 9));
  });
  it("constant uses the mean chronic load", () => {
    const s = referenceAcwr(R.acute_driven.load);
    const nr = nullChronicRatio(s.acute, s.chronic, "constant", 0);
    const real = s.chronic.filter(Number.isFinite);
    const m = real.reduce((a, b) => a + b, 0) / real.length;
    nr.forEach((v, i) => { if (Number.isFinite(v)) expect(s.acute[i] / v).toBeCloseTo(m, 9); });
  });
  it("is reproducible from a seed", () => {
    const s = referenceAcwr(R.acute_driven.load);
    expect(nullChronicRatio(s.acute, s.chronic, "shuffle", 7)).toEqual(nullChronicRatio(s.acute, s.chronic, "shuffle", 7));
  });
});

describe("compare_to_null", () => {
  const check = (c: Case, label: string) => {
    const r = compareToNullFromLoad(c.load, c.outcome, { kind: "shuffle", nNullDraws: 120, seed: 2 });
    expect(r.n, `${label} n`).toBe(c.n);
    expect(r.nEvents, `${label} events`).toBe(c.n_events);
    expect(r.real, `${label} real AUC`).toBeCloseTo(c.real, 9);
    expect(Math.abs(r.realCiLow - c.real_ci95[0]), `${label} real ci low`).toBeLessThan(0.02);
    expect(Math.abs(r.realCiHigh - c.real_ci95[1]), `${label} real ci high`).toBeLessThan(0.02);
    expect(Math.abs(r.null - c.null), `${label} null mean`).toBeLessThan(0.02);
    expect(Math.abs(r.nullCiLow - c.null_ci95[0]), `${label} null ci low`).toBeLessThan(0.03);
    expect(Math.abs(r.nullCiHigh - c.null_ci95[1]), `${label} null ci high`).toBeLessThan(0.03);
    expect(r.realBeatsNull, `${label} verdict`).toBe(c.real_beats_null);
    console.log(`${label}: real ${r.real.toFixed(4)} [${r.realCiLow.toFixed(3)}, ${r.realCiHigh.toFixed(3)}] null ${r.null.toFixed(4)} [${r.nullCiLow.toFixed(3)}, ${r.nullCiHigh.toFixed(3)}] python real ${c.real.toFixed(4)} null ${c.null.toFixed(4)}`);
    return r;
  };
  it("reproduces the Impellizzeri result when injury depends on acute load alone", () => {
    const r = check(R.acute_driven, "acute-driven");
    expect(r.real).toBeGreaterThan(0.55);
    expect(r.null).toBeGreaterThan(0.55);
    expect(r.realBeatsNull).toBe(false);
    // The coupled denominator damps the very spikes the outcome responds to.
    expect(r.null).toBeGreaterThan(r.real);
  });
  it("lets the real ratio win when injury depends on the ratio", () => {
    const r = check(R.ratio_driven, "ratio-driven");
    expect(r.realBeatsNull).toBe(true);
    expect(r.realOutsideNull).toBe(true);
  });
  it("works on the product's own series legs", () => {
    const s = referenceAcwr(R.ratio_driven.load, { method: "ewma" });
    const r = compareToNull(s.acute, s.chronic, R.ratio_driven.outcome, { nNullDraws: 40, bootDraws: 200 });
    expect(r.measure).toBe("AUC");
    expect(r.n).toBeGreaterThan(800);
  });
  it("needs enough aligned observations", () => {
    expect(() => compareToNullFromLoad(R.acute_driven.load.slice(0, 30), R.acute_driven.outcome.slice(0, 30))).toThrow(/aligned, complete/);
  });
});
