/** The gait heuristic, same cases as the Swift port. AI-assisted, see DISCLOSURE.md */
import { describe, expect, it } from "vitest";
import { analyzeGait, sampleGaitRuns, type GaitRun } from "../../../app/src/lib/gait";

const now = new Date("2026-10-25T12:00:00");
const daysAgo = (r: GaitRun) => Math.round((now.getTime() - Date.parse(r.start)) / 86400000);

describe("gait drift", () => {
  it("the sample dataset flags drift at unchanged pace", () => {
    const runs = sampleGaitRuns(now);
    expect(runs).toHaveLength(24);
    const a = analyzeGait(runs, now);
    expect(a.kind).toBe("analyzed");
    if (a.kind !== "analyzed") return;
    expect(a.drift.recentRuns).toBe(4);
    expect(a.drift.baselineRuns).toBe(16);
    expect(a.drift.groundContactDrift!).toBeGreaterThan(0.05);
    expect(a.drift.verticalOscillationDrift!).toBeLessThan(0.08);
    expect(Math.abs(a.drift.speedChange!)).toBeLessThan(0.02);
    expect(a.drift.flagsMechanicalDrift).toBe(true);
    expect(a.drift.reasons[0]).toMatch(/^Ground contact time up/);
  });
  it("a faster week explains longer contact, so no flag", () => {
    const runs = sampleGaitRuns(now).map((r) => (daysAgo(r) < 7 ? { ...r, speedMps: r.speedMps! * 1.1 } : r));
    const a = analyzeGait(runs, now);
    expect(a.kind === "analyzed" && a.drift.flagsMechanicalDrift).toBe(false);
    expect(a.kind === "analyzed" && a.drift.reasons.some((x) => x.includes("faster this week"))).toBe(true);
  });
  it("reports every insufficient-data state instead of guessing", () => {
    expect(analyzeGait([], now).kind).toBe("noDynamics");
    expect(analyzeGait([{ id: "x", start: now.toISOString(), groundContactMs: null, verticalOscillationCm: null, speedMps: 3, sampleCount: 0 }], now).kind).toBe("noDynamics");
    expect(analyzeGait(sampleGaitRuns(now).slice(-6), now)).toEqual({ kind: "insufficientBaseline", runs: 2, needed: 4 });
    expect(analyzeGait(sampleGaitRuns(now).filter((r) => daysAgo(r) >= 7), now).kind).toBe("noRecentRuns");
  });
  it("the baseline is uncoupled from the recent week", () => {
    const base = sampleGaitRuns(now);
    const doubled = base.map((r) => (daysAgo(r) < 7 ? { ...r, groundContactMs: r.groundContactMs! * 2 } : r));
    const a = analyzeGait(base, now);
    const b = analyzeGait(doubled, now);
    if (a.kind !== "analyzed" || b.kind !== "analyzed") throw new Error("expected analyses");
    expect(b.drift.baselineGroundContactMs).toBeCloseTo(a.drift.baselineGroundContactMs!, 12);
    expect(b.drift.flagsMechanicalDrift).toBe(true);
  });
});
