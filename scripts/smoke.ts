import { listAthletes, getDb } from "../src/lib/db";
import { buildProfile } from "../src/lib/profile";
import { coachWhy, answer } from "../src/lib/chat";

let fails = 0;
function ok(label: string, fn: () => unknown) {
  try {
    const v = fn();
    if (v === undefined || v === null) throw new Error("returned nothing");
  } catch (e) {
    fails++;
    console.log(`  x ${label}: ${(e as Error).message}`);
  }
}

async function main() {
  const athletes = listAthletes();
  console.log(`Smoke-testing ${athletes.length} athletes end to end\n`);

  for (const a of athletes) {
    const p = buildProfile(a.id);
    if (!p) {
      fails++;
      console.log(`  x ${a.name}: buildProfile returned null`);
      continue;
    }
    ok(`${a.name} coachWhy`, () => coachWhy(p));
    ok(`${a.name} fields`, () =>
      [
        p.readiness, p.risk.selfReport, p.risk.hrMax, p.recentRuns, p.energyTrend,
        p.plan.adjustment, p.prePractice.flag, p.fitness.score, p.patterns, p.badges,
        p.races.upcoming, p.notifications, p.insights, p.stats, p.load, p.predictions,
        p.sleep30, p.mental30, p.paceSeason, p.weeks, p.yearDays, p.goals, p.injuries,
      ].every((x) => x !== undefined));
  }

  const p0 = buildProfile(athletes[0].id)!;
  const questions = [
    "should i run today", "why is my risk high", "my shin hurts", "how much should i run",
    "should i lift", "im tired and unmotivated", "what shoes should i get", "my stomach hurts",
    "how should i pace my race", "how much sleep do i need", "what should i eat", "am i improving",
  ];
  for (const q of questions) {
    try {
      const r = await answer(q, p0);
      if (!r || r.length < 20) throw new Error("empty or too short");
    } catch (e) {
      fails++;
      console.log(`  x chat "${q}": ${(e as Error).message}`);
    }
  }

  const cols = (t: string) =>
    (getDb().prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const [table, need] of [
    ["athletes", "hr_max"],
    ["athletes", "hr_max_source"],
    ["injuries", "resolved_at"],
    ["checkin_soreness", "severity"],
    ["risk_snapshots", "spike_pct_above"],
    ["risk_snapshots", "readiness"],
  ] as const) {
    if (!cols(table).includes(need)) {
      fails++;
      console.log(`  x schema ${table}.${need} missing`);
    }
  }

  console.log(fails === 0 ? "\nAll smoke checks passed" : `\n${fails} failures`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
