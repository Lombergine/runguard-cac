/** The grounded explanation layer. AI-assisted, see DISCLOSURE.md. */
import { describe, expect, it } from "vitest";
import { REFERENCES, explainAudit, explainInputFrom, numbersGrounded, templateExplanation, type ExplainInput } from "./explain";
import { athleteAudit, referenceAcwr } from "./acwrDiagnostics";
import ref from "./__fixtures__/acwr_reference.json";

const input: ExplainInput = {
  acwr: 1.07, acute: 42.1, chronic: 39.4, method: "ewma",
  personalThreshold95: 1.37, referenceFlaggedFraction: 0.035,
  auditSpearman: 0.83, auditCI: [0.77, 0.89], usableDays: 342,
  gctDriftPct: null, voDriftPct: null, dataQualityFlags: ["break"],
};

describe("template explanation", () => {
  it("uses only the numbers it was given and cites a listed reference", () => {
    const e = templateExplanation(input);
    expect(numbersGrounded(e.summary + " " + e.caution, input)).toBe(true);
    expect(REFERENCES).toContain(e.citation);
    expect(e.summary).toContain("1.07");
    expect(e.caution).toContain("break");
  });
  it("handles an athlete with no ratio yet", () => {
    const e = templateExplanation({ ...input, acwr: null, acute: null, chronic: null, personalThreshold95: null, referenceFlaggedFraction: null, auditSpearman: null, auditCI: null, usableDays: 0, dataQualityFlags: [] });
    expect(e.summary).toMatch(/no ratio yet/);
  });
});

describe("number grounding", () => {
  it("accepts numbers from the input and the published constants", () => {
    expect(numbersGrounded("Your ratio is 1.07, below the 1.5 line; 3.5% of days; rho 0.83 (0.77 to 0.89) over 342 days.", input)).toBe(true);
  });
  it("rejects a number the model was not given", () => {
    expect(numbersGrounded("Your injury risk is 23% this week.", input)).toBe(false);
    expect(numbersGrounded("Your ratio is 1.08.", input)).toBe(false);
  });
});

describe("explainAudit", () => {
  it("falls back to the template and says why when no model is configured", async () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OLLAMA_MODEL };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_MODEL;
    const r = await explainAudit(input);
    expect(r.source).toBe("template");
    expect(r.fallbackReason).toMatch(/no model configured/);
    expect(r.input).toEqual(input);
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o) process.env.OLLAMA_MODEL = saved.o;
  });
  it("builds its input from the server's own audit, numbers only", () => {
    const load = ref.rhythm500.load;
    const s = referenceAcwr(load, { method: "ewma" });
    const series = load.map((l, i) => ({ date: `d${i}`, load: l, acute: s.acute[i], chronic: s.chronic[i], acwr: Number.isNaN(s.ratio[i]) ? null : s.ratio[i] }));
    const audit = athleteAudit(series, { draws: 100 });
    const i = explainInputFrom(audit, { acwr: 1.1, acute: 50, chronic: 45 }, { gctDriftPct: 6.4, voDriftPct: 2.9 });
    expect(i.usableDays).toBe(473);
    expect(i.personalThreshold95).toBeCloseTo(audit.threshold!.percentiles["95"], 12);
    expect(i.gctDriftPct).toBe(6.4);
    expect(JSON.stringify(i)).not.toMatch(/name|email/);
  });
});
