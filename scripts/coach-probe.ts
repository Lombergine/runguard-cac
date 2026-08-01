/**
 * Measures whether a local model is worth wiring into the chat at all.
 *
 *   npx tsx scripts/coach-probe.ts              # the canned question set
 *   npx tsx scripts/coach-probe.ts "why do my shins hurt"
 *   npx tsx scripts/coach-probe.ts --no-data    # same questions, digest withheld
 *   npx tsx scripts/coach-probe.ts --athlete 1
 *
 * Touches nothing in src/. Starts no server, changes no route, writes no rows.
 * The point is to buy the numbers BEFORE building the feature, because every
 * inference figure in the plan is modelled rather than measured.
 *
 * Three things it answers:
 *
 *   1. How fast is it, really? Uses the NATIVE /api/chat endpoint, not the
 *      OpenAI-compatible /v1 path, because only the native one returns timings
 *      (prompt_eval_count, eval_count, eval_duration). Everything downstream —
 *      whether a 45s deadline is generous or impossible, whether the token caps
 *      are sane — depends on tok/s, and nobody has measured it on this machine.
 *
 *   2. Does it invent numbers? This is the dangerous failure: a model that skips
 *      the data and states a plausible figure is indistinguishable from one that
 *      read it. Every numeral in the reply is checked against the digest it was
 *      given plus the figures in KNOWLEDGE_FOR_PROMPT, harvested programmatically
 *      so the allowlist can't drift. Roughly 50 legal literals, against ~3,500 if
 *      you whitelisted the whole profile — which would match anything.
 *
 *   3. Does it need tools? --no-data withholds the digest. If the model says it
 *      doesn't know, tools might earn their cost. If it confidently makes numbers
 *      up, they won't, because a tool the model declines to call is not a control.
 *
 * Reuses COACH_SYSTEM and dataContext from src/lib/chat.ts — a working
 * inline-everything coaching prompt that already exists in this repo.
 */
import { buildProfile } from "../src/lib/profile";
import { COACH_SYSTEM, dataContext } from "../src/lib/chat";
import { KNOWLEDGE_FOR_PROMPT } from "../src/lib/knowledge";

const BASE = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "").replace(/\/v1$/, "");
const MODEL = process.env.OLLAMA_MODEL || "granite4.1:8b";

/* Athlete 4 is Ethan Park — the only seeded athlete with shin injury history, so
   the injury branches actually fire. */
const args = process.argv.slice(2);
const noData = args.includes("--no-data");
const athleteIx = args.indexOf("--athlete");
const athleteId = athleteIx >= 0 ? Number(args[athleteIx + 1]) : 4;
const custom = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--athlete");

const QUESTIONS = custom.length
  ? custom
  : [
      "how much have i been running lately, is my risk climbing?",
      "should i run today?",
      "why do my shins hurt when i run?",
      "how's my sleep been affecting my training?",
      "what should my next workout be?",
      "am i doing too much?",
      "how do i get faster at the 5k?",
      "why am i slower than i was last month?",
      "how should i taper for my next race?",
      "what does my week look like?",
      "im feeling burnt out, what do i do?",
      "how do i pace my next race?",
    ];

/** Numerals that a reply is allowed to contain: whatever we handed the model. */
function harvest(text: string): Set<string> {
  const out = new Set<string>();
  for (const n of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    out.add(n);
    const f = Number(n);
    if (Number.isFinite(f)) {
      out.add(String(Math.round(f)));
      out.add(f.toFixed(1));
      out.add(f.toFixed(2));
    }
  }
  return out;
}

/** Generic training figures that are knowledge, not this athlete's data. */
const KB_NUMS = harvest(KNOWLEDGE_FOR_PROMPT + " " + COACH_SYSTEM);

function unsourced(reply: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const n of reply.match(/\d+(?:\.\d+)?/g) ?? []) {
    // Times like 18:07 and dates read as numerals; skip 1-2 digit integers,
    // which are almost always paces, reps, days of the week or list markers.
    if (/^\d{1,2}$/.test(n)) continue;
    if (!allowed.has(n) && !KB_NUMS.has(n)) bad.push(n);
  }
  return [...new Set(bad)];
}

type NativeChat = {
  message?: { content?: string };
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
};

async function ask(system: string, q: string): Promise<NativeChat | null> {
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        keep_alive: "30m",
        // Temperature is sent explicitly: Ollama defaults it to 1.0 when
        // omitted, which overrides anything set in a Modelfile.
        options: { temperature: 0.2, num_predict: 600 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: q },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as NativeChat;
  } catch (e) {
    console.error(`  request failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function main() {
  const p = buildProfile(athleteId);
  if (!p) {
    console.error(`No athlete ${athleteId}. Run npm run seed first.`);
    process.exit(1);
  }

  const digest = noData ? "" : dataContext(p);
  const system = COACH_SYSTEM + digest;
  const allowed = noData ? new Set<string>() : harvest(digest);

  console.log(`\nmodel      ${MODEL}   via ${BASE}`);
  console.log(`athlete    ${p.athlete.name} (id ${athleteId})`);
  console.log(`prompt     ${system.length} chars ≈ ${Math.round(system.length / 4)} tok`);
  console.log(`digest     ${noData ? "WITHHELD (--no-data)" : `${digest.length} chars, ${allowed.size} allowed numerals`}`);
  console.log(`knowledge  ${KB_NUMS.size} generic figures allowlisted\n`);

  const genRates: number[] = [];
  const preRates: number[] = [];
  let leaked = 0;
  let answered = 0;

  for (const q of QUESTIONS) {
    console.log(`── ${q}`);
    const t0 = Date.now();
    const r = await ask(system, q);
    const wall = (Date.now() - t0) / 1000;
    if (!r) continue;

    const reply = (r.message?.content ?? "").trim();
    const inTok = r.prompt_eval_count ?? 0;
    const outTok = r.eval_count ?? 0;
    const genS = (r.eval_duration ?? 0) / 1e9;
    const preS = (r.prompt_eval_duration ?? 0) / 1e9;
    const genRate = genS > 0 ? outTok / genS : 0;
    const preRate = preS > 0 ? inTok / preS : 0;
    if (genRate) genRates.push(genRate);
    if (preRate) preRates.push(preRate);
    answered++;

    const bad = unsourced(reply, allowed);
    if (bad.length) leaked++;

    console.log(
      `   ${wall.toFixed(1)}s wall · in ${inTok} tok @ ${preRate.toFixed(0)}/s · out ${outTok} tok @ ${genRate.toFixed(1)}/s`
    );
    console.log(`   numbers: ${bad.length ? `⚠ UNSOURCED ${bad.join(", ")}` : "all sourced"}`);
    console.log(`   ${reply.replace(/\n+/g, "\n   ").slice(0, 600)}${reply.length > 600 ? "…" : ""}\n`);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  console.log("─".repeat(64));
  console.log(`answered            ${answered}/${QUESTIONS.length}`);
  console.log(`generation          ${avg(genRates).toFixed(1)} tok/s   (plan assumed 25)`);
  console.log(`prefill             ${avg(preRates).toFixed(0)} tok/s   (plan assumed 450)`);
  console.log(`replies w/ invented numbers  ${leaked}/${answered}`);
  console.log(
    `\nGo/no-go: ship only if the prose beats the rule engine's templates on a\n` +
      `blind read AND invented numbers is 0. If numbers leak, the answer is not\n` +
      `"add tools" — a tool the model declines to call is not a control.\n`
  );
}

main();
