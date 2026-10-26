/**
 * The grounded explanation layer: a language model that explains the
 * statistics and is never allowed to generate them.
 *
 * The model receives a strict JSON object of numbers the server computed
 * (the ratio, its legs, the personal threshold, the self-audit, optional
 * gait drift, data-quality flags) and nothing else: no name, no free text,
 * no health conditions. It must answer with JSON {summary, caution,
 * citation}; the citation must be one of the references listed here. The
 * reply is validated with zod, word-limited, and shown next to the raw
 * numbers. Anything that fails validation, times out or errors falls back
 * to RunGuard's own template wording, labelled as such, so the screen never
 * blocks on a model and never shows a number the model made up.
 *
 * Providers, by environment: ANTHROPIC_API_KEY (Claude Messages API) or
 * OLLAMA_MODEL (a local model, as the chat already uses). Neither set: the
 * template answers and says so. Nothing here is medical advice.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AthleteAudit } from "./acwrDiagnostics";

export const REFERENCES = [
  "Impellizzeri et al. (2021), Sports Medicine 51(3): time to dismiss ACWR",
  "Gabbett (2016), BJSM 50(5): the training–injury prevention paradox",
  "Williams et al. (2017), BJSM 51(3): the EWMA form of the ratio",
  "Impellizzeri et al. (2020), IJSPP 15(6): conceptual issues with ACWR",
] as const;

/** Exactly what the model is allowed to see. */
export type ExplainInput = {
  acwr: number | null;
  acute: number | null;
  chronic: number | null;
  method: "ewma" | "rac" | "rau";
  personalThreshold95: number | null;
  referenceFlaggedFraction: number | null;
  auditSpearman: number | null;
  auditCI: [number, number] | null;
  usableDays: number;
  gctDriftPct: number | null;
  voDriftPct: number | null;
  dataQualityFlags: string[];
};

export const ExplanationSchema = z.object({
  summary: z.string().min(1).max(600),
  caution: z.string().min(1).max(300),
  citation: z.enum(REFERENCES),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export type ExplainResult = {
  input: ExplainInput;
  explanation: Explanation;
  /** Who wrote the words. "template" means no model was involved. */
  source: "anthropic" | "ollama" | "template";
  model: string | null;
  /** Why the template answered, when it did. */
  fallbackReason: string | null;
  /** The model's reply when it was rejected, truncated, so a failure can be read. */
  rejectedReply: string | null;
};

const SYSTEM = `You are explaining a sports-science statistic to a high school runner.
Use only the numbers provided. Do not invent any number. Do not give medical advice. Do not recommend specific training changes. Do not mention injury probability.
Output JSON only, with exactly these keys: {"summary": string (at most 60 words), "caution": string (at most 30 words), "citation": string}.
The citation must be copied verbatim from this list: ${REFERENCES.map((r) => JSON.stringify(r)).join(", ")}.`;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Build the model's input from the server's own audit. Numbers only. */
export function explainInputFrom(
  audit: AthleteAudit,
  latest: { acwr: number | null; acute: number | null; chronic: number | null },
  gait?: { gctDriftPct: number | null; voDriftPct: number | null } | null,
): ExplainInput {
  const r = audit.rescaling;
  const ci = r && r.ciLow != null && !Number.isNaN(r.ciLow) ? ([r.ciLow, r.ciHigh] as [number, number]) : null;
  return {
    acwr: latest.acwr,
    acute: latest.acute,
    chronic: latest.chronic,
    method: audit.method,
    personalThreshold95: audit.threshold?.percentiles["95"] ?? null,
    referenceFlaggedFraction: audit.threshold?.referenceFlaggedFraction ?? null,
    auditSpearman: r?.spearman ?? null,
    auditCI: ci,
    usableDays: audit.usableDays,
    gctDriftPct: gait?.gctDriftPct ?? null,
    voDriftPct: gait?.voDriftPct ?? null,
    dataQualityFlags: audit.quality.findings.filter((f) => f.severity !== "note").map((f) => f.check),
  };
}

/** RunGuard's own wording, from the same numbers. Used when no model answers. */
export function templateExplanation(i: ExplainInput): Explanation {
  const parts: string[] = [];
  if (i.acwr !== null) parts.push(`Your workload ratio is ${i.acwr.toFixed(2)}: your last 7 days divided by your last 28.`);
  else parts.push("There is no ratio yet; the 4-week baseline is still being built.");
  if (i.personalThreshold95 !== null && i.referenceFlaggedFraction !== null) {
    parts.push(`The universal 1.5 cutoff flags ${(i.referenceFlaggedFraction * 100).toFixed(1)}% of your days; your own 95th percentile is ${i.personalThreshold95.toFixed(2)}.`);
  }
  if (i.auditSpearman !== null) {
    const rho = i.auditSpearman;
    parts.push(
      rho >= 0.9
        ? `The score tracks your last 7 days at ρ ${rho.toFixed(2)}, so it is mostly repeating your weekly mileage.`
        : rho >= 0.7
          ? `The score tracks your last 7 days at ρ ${rho.toFixed(2)}: most of its movement is last week, the baseline adds some.`
          : `The score tracks your last 7 days at ρ ${rho.toFixed(2)}, so the 4-week baseline is doing real work in it.`,
    );
  }
  if (i.gctDriftPct !== null) parts.push(`Ground contact time is ${i.gctDriftPct >= 0 ? "up" : "down"} ${Math.abs(i.gctDriftPct).toFixed(1)}% against your 4-week baseline.`);
  const caution = i.dataQualityFlags.length
    ? `Data check flagged: ${i.dataQualityFlags.join(", ")}. The ratio is a monitoring signal, not a diagnosis.`
    : "The ratio is a monitoring signal, not a diagnosis, and the field disputes whether it predicts injury at all.";
  return { summary: parts.join(" "), caution, citation: REFERENCES[0] };
}

function validate(raw: string): Explanation | null {
  // Models sometimes wrap JSON in fences; take the first object literal.
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const parsed = ExplanationSchema.safeParse(obj);
  if (!parsed.success) return null;
  if (words(parsed.data.summary) > 70 || words(parsed.data.caution) > 40) return null;
  // The model may describe only numbers it was given: any decimal number in
  // the reply must appear in the input (to two decimals) or be one of the
  // published constants.
  return parsed.data;
}

/** Every number the model is allowed to say, to two decimals, plus the published constants. */
function allowedNumbers(i: ExplainInput): Set<string> {
  const vals: number[] = [1.5, 1.3, 0.8, 7, 28, 4, 95, 90, 60, i.usableDays];
  for (const v of [i.acwr, i.acute, i.chronic, i.personalThreshold95, i.auditSpearman, i.gctDriftPct, i.voDriftPct]) if (v !== null) vals.push(v);
  if (i.referenceFlaggedFraction !== null) vals.push(i.referenceFlaggedFraction * 100, i.referenceFlaggedFraction);
  if (i.auditCI) vals.push(i.auditCI[0], i.auditCI[1]);
  const out = new Set<string>();
  for (const v of vals) {
    out.add(v.toFixed(0));
    out.add(v.toFixed(1));
    out.add(v.toFixed(2));
    out.add(String(Math.round(v)));
    out.add((Math.round(v * 10) / 10).toString());
    out.add((Math.round(v * 100) / 100).toString());
  }
  return out;
}

/** True when every number the model wrote was one it was given. */
export function numbersGrounded(text: string, i: ExplainInput): boolean {
  const allowed = allowedNumbers(i);
  const found = text.match(/\d+(?:\.\d+)?/g) ?? [];
  // Exact string match only: the allowed set already carries each input at
  // zero, one and two decimals, so "1.1" for 1.07 passes and "1.08" does not.
  return found.every((n) => allowed.has(n));
}

/**
 * Claude, through the official SDK with a structured output: the reply is
 * parsed against `ExplanationSchema` by the API itself, so a malformed reply
 * is a null `parsed_output`, not a guess. Thinking stays adaptive (the model
 * decides) at low effort; the output budget is sized so a short JSON answer
 * is never cut off.
 */
async function callAnthropic(input: ExplainInput, key: string): Promise<{ text: string; model: string }> {
  const model = process.env.EXPLAIN_MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(ExplanationSchema) },
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal") throw new Error("the model declined the request");
  const parsed = response.parsed_output;
  return { text: parsed ? JSON.stringify(parsed) : "", model };
}

async function callOllama(input: ExplainInput, model: string): Promise<{ text: string; model: string }> {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(input) }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return { text: body.message?.content ?? "", model };
}

export function explainProvider(): "anthropic" | "ollama" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_MODEL) return "ollama";
  return null;
}

/** Explain the numbers. Never throws; never blocks longer than the provider timeout. */
export async function explainAudit(input: ExplainInput): Promise<ExplainResult> {
  const provider = explainProvider();
  const template = (reason: string, rejected: string | null = null): ExplainResult => ({
    input,
    explanation: templateExplanation(input),
    source: "template",
    model: null,
    fallbackReason: reason,
    rejectedReply: rejected ? rejected.slice(0, 600) : null,
  });
  if (!provider) return template("no model configured on this server");
  try {
    const { text, model } =
      provider === "anthropic"
        ? await callAnthropic(input, process.env.ANTHROPIC_API_KEY as string)
        : await callOllama(input, process.env.OLLAMA_MODEL as string);
    const parsed = validate(text);
    if (!parsed) return template("the model's reply did not match the required JSON shape", text);
    if (!numbersGrounded(parsed.summary + " " + parsed.caution, input)) {
      return template("the model's reply contained a number it was not given", text);
    }
    return { input, explanation: parsed, source: provider, model, fallbackReason: null, rejectedReply: null };
  } catch (e) {
    return template(e instanceof Error ? e.message : "the model did not answer");
  }
}
