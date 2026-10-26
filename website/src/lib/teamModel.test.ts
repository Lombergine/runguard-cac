/** The learned team model: training, honest evaluation, feature building. AI-assisted, see DISCLOSURE.md. */
import { describe, expect, it } from "vitest";
import { evaluate, featureRows, leaveOneAthleteOut, predict, standardizeWithinAthlete, trainLogistic, type Row, FEATURES } from "./teamModel";
import { aucBinary, seededRandom } from "./acwrDiagnostics";

function synthetic(athletes = 8, days = 300, seed = 1): Row[] {
  const rnd = seededRandom(seed);
  const rows: Row[] = [];
  for (let a = 1; a <= athletes; a++) {
    for (let d = 0; d < days; d++) {
      const x = FEATURES.map(() => rnd() * 2 - 1);
      // Injury risk rises with feature 3 (ramp) and feature 11 (soreness); nothing else matters.
      const logit = -3 + 2.5 * x[3] + 1.5 * x[11];
      const y: 0 | 1 = rnd() < 1 / (1 + Math.exp(-logit)) ? 1 : 0;
      rows.push({ athleteId: a, date: `d${d}`, x, y, acute: 50 + rnd() * 10, chronic: 50 + rnd() * 10, ratio: 1 + (rnd() - 0.5) * 0.4 });
    }
  }
  return rows;
}

describe("logistic regression", () => {
  it("learns the generating features and ranks them first", () => {
    const rows = synthetic();
    const m = trainLogistic(rows.map((r) => r.x), rows.map((r) => r.y));
    const top = [...m.weights.keys()].sort((a, b) => Math.abs(m.weights[b]) - Math.abs(m.weights[a])).slice(0, 2);
    expect(new Set(top)).toEqual(new Set([3, 11]));
    expect(m.weights[3]).toBeGreaterThan(0);
  });
  it("predicts probabilities in (0, 1) that separate the classes", () => {
    const rows = synthetic();
    const m = trainLogistic(rows.map((r) => r.x), rows.map((r) => r.y));
    const scores = rows.map((r) => predict(m, r.x));
    expect(scores.every((s) => s > 0 && s < 1)).toBe(true);
    expect(aucBinary(scores, rows.map((r) => r.y))).toBeGreaterThan(0.8);
  });
});

describe("leave-one-athlete-out", () => {
  it("never scores an athlete with a model that saw them, and still separates", () => {
    const rows = synthetic();
    const cv = leaveOneAthleteOut(rows);
    expect(cv.folds).toBe(8);
    expect(cv.scores.length).toBe(rows.length);
    expect(aucBinary(cv.scores, cv.labels)).toBeGreaterThan(0.75);
  });
  it("finds nothing when the labels are noise", () => {
    const rnd = seededRandom(9);
    const rows = synthetic().map((r) => ({ ...r, y: (rnd() < 0.1 ? 1 : 0) as 0 | 1 }));
    const cv = leaveOneAthleteOut(rows);
    expect(Math.abs(aucBinary(cv.scores, cv.labels) - 0.5)).toBeLessThan(0.08);
  });
});

describe("evaluate", () => {
  it("reports the model, the ratio and the noise ratio on the same labels", () => {
    const r = evaluate(synthetic(), { bootDraws: 100, noiseDraws: 20 });
    expect(r.auc).toBeGreaterThan(0.75);
    expect(r.aucCiLow).toBeLessThan(r.auc);
    expect(r.aucCiHigh).toBeGreaterThan(r.auc);
    expect(Math.abs(r.ratioAuc - 0.5)).toBeLessThan(0.1);
    // the synthetic injuries follow the ramp and soreness, which the ratio does not see
    expect(r.deltaRatio).toBeCloseTo(r.auc - r.ratioAuc, 1);
    expect(r.deltaCiLow).toBeLessThanOrEqual(r.deltaRatio);
    expect(r.deltaCiHigh).toBeGreaterThanOrEqual(r.deltaRatio);
    expect(r.deltaCiLow).toBeGreaterThan(0);
    expect(Math.abs(r.noiseAuc - 0.5)).toBeLessThan(0.1);
    expect(r.coefficients[0].key).toMatch(/ramp|sore/);
    expect(r.folds).toBe(8);
    expect(r.elapsedMs).toBeLessThan(5000);
  });
});

describe("within-athlete standardisation", () => {
  it("removes each athlete's own level so identity cannot be learned", () => {
    const rows = synthetic(3, 100, 4).map((r) => ({ ...r, x: r.x.map((v, j) => (j === 2 ? v + r.athleteId * 100 : v)) }));
    const z = standardizeWithinAthlete(rows);
    for (const id of [1, 2, 3]) {
      const col = z.filter((r) => r.athleteId === id).map((r) => r.x[2]);
      expect(Math.abs(col.reduce((a, b) => a + b, 0) / col.length)).toBeLessThan(1e-9);
    }
    expect(z.length).toBe(rows.length);
  });
});

describe("feature rows", () => {
  const daily = Array.from({ length: 60 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, load: i % 7 === 0 ? 0 : 50 + (i > 40 ? 40 : 0), km: i % 7 === 0 ? 0 : 8, acute: 50, chronic: 48, acwr: i < 27 ? null : 1.04 }));
  it("labels the week before an injury and drops the fortnight after it", () => {
    const idx = 50;
    const rows = featureRows(1, daily, [], [], [daily[idx].date]);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    expect(byDate.get(daily[idx - 3].date)?.y).toBe(1);
    expect(byDate.get(daily[idx - 8].date)?.y).toBe(0);
    expect(byDate.has(daily[idx + 2].date)).toBe(false);
    expect(byDate.has(daily[idx + 9].date)).toBe(false);
  });
  it("computes ramp, days since rest and soreness from the inputs", () => {
    const rows = featureRows(1, daily, [{ date: daily[45].date, resting_hr: 50, hrv: 80, sleep_hours: 7 }], [{ date: daily[44].date, severity: 6 }], []);
    const r45 = rows.find((r) => r.date === daily[45].date)!;
    const f = Object.fromEntries(FEATURES.map((f, j) => [f.key, r45.x[j]]));
    expect(f.ramp).toBeCloseTo(0, 6);
    expect(f.kmRatio).toBeGreaterThan(0.9);
    expect(f.sinceRun).toBe(0);
    expect(f.sore).toBe(6);
    expect(f.sinceRest).toBeGreaterThan(0);
  });
});
