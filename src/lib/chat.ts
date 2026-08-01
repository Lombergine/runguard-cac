/**
 * RunGuard AI — the coaching brain.
 *
 * Not a chatbot with canned lines: a scored intent engine with real
 * sports-science knowledge (ACWR research, 80/20 training, taper science,
 * injury red-flag screening, sleep/recovery physiology, race execution),
 * where EVERY answer is grounded in the athlete's own numbers. If
 * ANTHROPIC_API_KEY is set, Claude answers with the same knowledge and the
 * athlete's live data as context; otherwise this engine handles it.
 */
import { getDb } from "./db";
import { CoreProfile } from "./profile";
import { fmtTime, EventName, EVENTS } from "./engine";
import { FACTS, KNOWLEDGE_FOR_PROMPT } from "./knowledge";

export function logChat(athleteId: number, role: "user" | "assistant", text: string): void {
  getDb()
    .prepare("INSERT INTO chat_messages (athlete_id, role, text) VALUES (?, ?, ?)")
    .run(athleteId, role, text);
}

export function chatHistory(athleteId: number, limit = 30): { role: string; text: string }[] {
  return (getDb()
    .prepare(
      "SELECT role, text FROM chat_messages WHERE athlete_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(athleteId, limit) as { role: string; text: string }[]).reverse();
}

/* ------------------------------------------------------------------ */
/* Coach-facing: why is this athlete dangerous right now?              */
/* ------------------------------------------------------------------ */

export function coachWhy(p: CoreProfile): string {
  const r = p.risk;
  const rec = r.recovery;
  const causes: string[] = [];

  if (r.acwr !== null && r.acwr > 1.5) {
    causes.push(
      `their training load is ${r.acwr.toFixed(2)}× what their body has adapted to — past 1.5 the injury odds roughly double in the research`
    );
  } else if (r.acwr !== null && r.acwr > 1.3) {
    causes.push(`their acute:chronic load ratio is ${r.acwr.toFixed(2)}, above the 0.8–1.3 zone tissue can absorb`);
  }
  if (r.rampPct !== null && r.rampPct > 30) {
    causes.push(`weekly mileage jumped ${Math.round(r.rampPct)}% (${r.prevWeekKm} → ${r.weekKm} km) — bone and tendon adapt weeks slower than the heart and lungs`);
  }
  if (p.illness) {
    causes.push(`resting HR is up ${rec.restingHrDelta} bpm while HRV is down ${Math.abs(rec.hrvDeltaPct ?? 0)}% — the classic pattern of a body fighting illness or deep fatigue`);
  } else {
    if (rec.restingHrDelta !== null && rec.restingHrDelta >= 5)
      causes.push(`resting heart rate is running ${rec.restingHrDelta} bpm above their baseline`);
    if (rec.hrvDeltaPct !== null && rec.hrvDeltaPct <= -12)
      causes.push(`HRV is ${Math.abs(rec.hrvDeltaPct)}% below their normal — the nervous system hasn't recovered`);
  }
  if (p.patterns.monotony !== null && p.patterns.monotony > 2)
    causes.push(`training monotony is ${p.patterns.monotony} — every day is the same medium-hard effort, which multiplies load stress`);
  if (rec.sleepAvg !== null && rec.sleepAvg < 7)
    causes.push(`they're averaging ${rec.sleepAvg}h of sleep, under the 8h where tissue repair actually happens`);
  const worstSoreness = [...p.todaySoreness].sort((a, b) => b.severity - a.severity)[0];
  if (worstSoreness && worstSoreness.severity >= 5)
    causes.push(`they logged ${worstSoreness.part} soreness at ${worstSoreness.severity}/10 today${p.todaySoreness.length > 1 ? ` (${p.todaySoreness.length} areas flagged)` : ""}`);
  if (p.patterns.highEffortStreak >= 5)
    causes.push(`${p.patterns.highEffortStreak} straight days above their typical load with no recovery day`);
  if (p.injuries.length > 0 && causes.length > 0) {
    causes.push(`history matters here: ${p.injuries[0].body_part} (${p.injuries[0].date.slice(0, 7)})`);
  }

  if (causes.length >= 3 || p.prePractice.flag === "unusual") {
    const top = causes.slice(0, 3).join("; ");
    return `Several things are stacking up here: ${top}. This is the exact pattern that precedes most overuse injuries — the body is absorbing more stress than it can repair. Today: no intensity, cut volume hard or rest fully, and check in with them face to face before warmup.`;
  }
  if (causes.length > 0) {
    const top = causes.slice(0, 2).join("; ");
    return `Worth a look: ${top}. Not an emergency — but this is the window where one more hard day tips it. Keep today genuinely easy and skip anything explosive.`;
  }
  return `Nothing standing out: recovery markers are at their baseline${rec.sleepAvg !== null ? ` and they're sleeping ${rec.sleepAvg}h` : ""}. Run the plan as written.`;
}

/* ------------------------------------------------------------------ */
/* Athlete chat: scored intent engine                                  */
/* ------------------------------------------------------------------ */

type Ctx = { p: CoreProfile; q: string };
type Intent = {
  id: string;
  score: (q: string) => number;
  answer: (c: Ctx) => string;
};

const hit = (q: string, res: RegExp[], weight = 1) =>
  res.reduce((s, re) => s + (re.test(q) ? weight : 0), 0);

function firstName(p: CoreProfile): string {
  return p.athlete.name.split(" ")[0];
}

function readinessLine(p: CoreProfile): string {
  return `readiness ${p.readiness}/100, load ratio ${p.risk.acwr ?? "building"}, ${p.risk.weekKm} km this week`;
}

function nextRaceLine(p: CoreProfile): string | null {
  const r = p.races.upcoming[0];
  return r ? `${r.name} (${r.event}) in ${r.daysUntil} days` : null;
}

/* ---- the knowledge ---- */

const INTENTS: Intent[] = [
  /* ---------- should I run today / soreness ---------- */
  {
    id: "run-today",
    score: (q) =>
      hit(q, [/should i (run|train|go)/, /run today/, /legs (are|feel|really)/, /\bsore\b/, /\btired\b/, /feel (dead|awful|exhausted)/]),
    answer: ({ p, q }) => {
      const sev = p.todaySoreness.length ? Math.max(...p.todaySoreness.map((s) => s.severity)) : null;
      const part = /shin/.test(q) ? "shins" : /knee/.test(q) ? "knee" : /achilles|heel/.test(q) ? "achilles" : /calf|calves/.test(q) ? "calves" : /hip|it band|itb/.test(q) ? "hip/IT band" : null;
      const sharp = /sharp|stabbing|one (leg|side)|point|spot|limp/.test(q);
      if (sharp || (sev !== null && sev >= 7)) {
        return `Stop — this one matters. Pain that's sharp, on one side, or focused on a single spot${part ? ` (your ${part})` : ""} is different from normal training soreness, and running through it is how a 3-day problem becomes a 6-week one. The screen I'd use: press on the spot with one finger — if there's one precise painful point, or it hurts to hop on that leg, you don't run today and you tell your coach or athletic trainer. Your data agrees: readiness is ${p.readiness}/100${p.risk.acwr !== null && p.risk.acwr > 1.3 ? ` and your load ratio is ${p.risk.acwr} — your tissue is already behind on repair` : ""}. One day off costs you nothing. Bone stress costs a season.`;
      }
      if (p.readiness < 40 || (sev !== null && sev >= 5)) {
        return `Today, go easy — or 20 minutes of genuine jogging at most. Here's why: your readiness is ${p.readiness}/100${p.risk.rampPct !== null && p.risk.rampPct > 30 ? `, your mileage just jumped ${Math.round(p.risk.rampPct)}%` : ""}${p.risk.recovery.hrvDeltaPct !== null && p.risk.recovery.hrvDeltaPct <= -12 ? `, and your HRV is ${Math.abs(p.risk.recovery.hrvDeltaPct)}% below baseline` : ""}. Fitness is built when your body absorbs training, and right now it's not absorbing — it's accumulating damage. The workout you skip today is the one that lets next week's workouts count. General muscle soreness both legs equally = fine to jog easy. Anything localized = rest.`;
      }
      if (p.readiness < 65 || (sev !== null && sev >= 3)) {
        return `Run, but make it honest-easy: 30–40 min at a pace where full sentences are comfortable, no strides, flat ground. Your readiness is ${p.readiness}/100 — you're carrying some fatigue but nothing structural is flagged. The rule for soreness: if it fades in the first 10 minutes of easy running, keep going. If it sharpens or changes your stride, stop and walk home — no hero points. Recheck tomorrow; easy days are what make your HRV bounce back fastest.`;
      }
      return `You're good to go — ${readinessLine(p)}, recovery signals at baseline. Normal post-workout soreness (both legs, dull, loosens up as you warm) is just adaptation talking. Do today's session as planned${p.plan.days.find((d) => d.isToday)?.type ? ` — that's "${p.plan.days.find((d) => d.isToday)!.type}"` : ""}. If anything feels sharp or one-sided mid-run, that's your cue to shut it down and tell me.`;
    },
  },

  /* ---------- what's my workout (plan-aware) ---------- */
  {
    id: "my-workout",
    score: (q) => {
      const supp = hit(q, [/supplement|core ?(workout|session|exercise)|strength (workout|session)|extra (workout|session)|lift(ing)? (session|workout)?|what.*(core|strength).*(do|workout)/], 3);
      const plan = hit(q, [
        /what('?s| is| should i (do|run)).*(today|tomorrow|this week|workout|session|plan|training)/,
        /what am i (doing|running|supposed)/,
        /(today|tomorrow)'?s (workout|run|session|training|plan)/,
        /what'?s (my|the|on the) (workout|plan|session|run|schedule)/,
        /my (workout|plan|session|schedule) (today|tomorrow|this week)/,
        /what should i do (today|tomorrow|this week|now)/,
      ], 3);
      return supp + plan;
    },
    answer: ({ p, q }) => {
      const days = p.plan.days;
      const todayIdx = days.findIndex((d) => d.isToday);
      const wantTomorrow = /tomorrow/.test(q);
      const wantWeek = /this week|whole week|my week/.test(q);
      const wantSupp = /supplement|core|strength|lift|extra (workout|session)|cross/.test(q);

      if (wantSupp) {
        const planned = (wantTomorrow ? days[todayIdx + 1] : days[todayIdx])?.supplemental;
        return `For a supplemental session — separate from your run — here's a runner-specific circuit you can do in ~20 min, 2×/week: eccentric calf drops 3×12 (shin & achilles armor), single-leg glute bridges 3×10 each side, single-leg step-downs 2×10 (knee/hip control), side planks 3×30s each (IT-band insurance), dead bugs 2×12, then 6×10s hill sprints if the legs are fresh. Heavy-and-slow beats endless reps. ${planned ? `Your plan actually has one queued: ${planned}. ` : ""}The point of this stuff isn't looks — it's that supervised strength work measurably lowers running-injury risk (youth S&C consensus). Skip it the day before a race.`;
      }

      if (wantWeek) {
        const line = days.map((d) => `${d.day.slice(0, 3)}: ${d.type}${d.distanceKm ? ` (${d.distanceKm}k)` : ""}`).join(" · ");
        return `Here's your week, ${firstName(p)}: ${line}. ${p.plan.taperMode ? "You're in taper mode, so it's lighter than usual on purpose — race is close. " : ""}It's auto-built from your load, fitness, and race schedule, and it re-adjusts every time you sync. Tap any day on the Training tab for the full workout and the "why."`;
      }

      const target = wantTomorrow ? days[todayIdx + 1] : days[todayIdx >= 0 ? todayIdx : 0];
      if (!target) return `I don't have a plan day loaded for that yet — check the Training tab for your full week.`;
      const label = wantTomorrow ? "Tomorrow" : "Today";
      if (target.type === "Rest") {
        return `${label} (${target.day}) is a REST day — and that's not a day off from training, it's part of it. ${target.why} If you're twitchy, a 15-min walk or easy mobility is fine, but resist the urge to "just add a few miles" — the rest is what turns this week's work into next week's fitness.`;
      }
      return `${label} (${target.day}): ${target.type}${target.distanceKm ? ` — ${target.distanceKm} km` : ""}${target.targetPace ? ` @ ${target.targetPace}` : ""}. ${target.details} The point: ${target.why}${target.supplemental ? ` If you've got extra time, add: ${target.supplemental}.` : ""} ${p.readiness < 55 ? `Heads up though — your readiness is ${p.readiness}/100 today, so if it's a hard session and your legs feel flat, it's smart to shift the intensity down; ask me and I'll help you adjust.` : `Your readiness (${p.readiness}/100) says you're clear to run it as written.`} Mark it done/modified/skipped on the Training tab so I keep your numbers honest.`;
    },
  },

  /* ---------- body-part injuries ---------- */
  {
    id: "shins",
    score: (q) => hit(q, [/shin/], 3),
    answer: ({ p }) => {
      const hist = p.injuries.find((i) => /shin/i.test(i.body_part));
      return `Shin pain is the one I take most seriously in runners your age — it lives on a spectrum from shin splints (annoying, manageable) to a stress fracture (season over). The difference: shin splints hurt in a diffuse strip along the inner shin, warm up as you run, and hit both legs; a stress reaction hurts at ONE point you can cover with a fingertip, gets worse as you run, and hurts hopping on one leg. ${hist ? `You've had shin trouble before (${hist.date.slice(0, 7)}), which makes your bones' stress history worse, not better — lower threshold for caution. ` : ""}Your load data ${p.risk.rampPct !== null && p.risk.rampPct > 30 ? `is a red flag here: mileage up ${Math.round(p.risk.rampPct)}% this week, and shin injuries are ramp injuries` : `looks ${p.risk.zone === "ready" ? "stable, which is in your favor" : "elevated, which fits the pattern"}`}. Do now: the one-finger test. Diffuse ache → cut volume ~30% for a week, run on soft surfaces, and do eccentric calf drops (3×12 daily — best shin insurance there is). One precise point or hop pain → stop running and get it looked at this week. Seriously.`;
    },
  },
  {
    id: "knee",
    score: (q) => hit(q, [/knee/], 3),
    answer: ({ p }) => `Runner's knee (pain around or under the kneecap) is usually a load + strength problem, not damage — it shows up when volume climbs faster than your hips can stabilize. Yours: ${p.risk.rampPct !== null && p.risk.rampPct > 20 ? `mileage is up ${Math.round(p.risk.rampPct)}% this week, which fits the classic cause` : `your ramp is controlled (${p.risk.rampPct ?? 0}%), so look at downhills, worn shoes, or all your runs being on the same cambered road`}. The plan: keep running if it's a dull ache that doesn't worsen mid-run, but cut downhills and add two things that fix most cases in 2–3 weeks — single-leg step-downs (2×10 each side, slow) and glute bridges. Sharp pain, swelling, clicking with pain, or pain going DOWN stairs that's getting worse → athletic trainer. Don't stretch the front of the knee and call it treatment; it's a strength issue.`,
  },
  {
    id: "achilles-calf",
    score: (q) => hit(q, [/achilles/, /\bheel\b/, /calf|calves/], 3),
    answer: ({ p }) => `Achilles and calf issues are speed-and-hills injuries — they flare when intensity or hill volume jumps, and they hate being ignored because tendon heals slower than muscle. The test: morning stiffness that loosens with walking = early tendinopathy, very fixable now; pain that's worse DURING running or a tender lump on the tendon = needs real attention. What works (evidence is strong): eccentric heel drops — stand on a step, rise on two feet, lower slowly on one, 3×12 each side, every day for weeks, even once it feels better. Meanwhile: no hill repeats, no spikes${p.races.upcoming[0] ? ` (flats are fine for ${p.races.upcoming[0].name})` : ""}, keep easy volume if pain stays ≤3/10 and doesn't worsen run-to-run. Your current load ratio is ${p.risk.acwr ?? "—"} — ${p.risk.acwr !== null && p.risk.acwr > 1.3 ? "trim intensity this week regardless; tendons are always the first to complain when the ratio spikes" : "stable, so this is likely mechanical rather than overload"}.`,
  },
  {
    id: "hip-itb",
    score: (q) => hit(q, [/it ?band|itb/, /\bhip\b/, /outside.*(knee|leg)/], 3),
    answer: ({ p }) => `Outside-of-knee or hip pain that shows up at the same distance every run is the IT band signature — it's not "tightness," it's your lateral hip strength failing at that fatigue point, and foam rolling the band itself won't fix it. What does: side planks (3×30s each), single-leg glute bridges, and lateral band walks, daily, plus temporarily running below the distance where it bites (if it starts at 6k, run 5k). Avoid cambered roads and tight track bends for a couple of weeks — vary direction if you're on the track. Your week is ${p.risk.weekKm} km${p.risk.rampPct !== null && p.risk.rampPct > 20 ? `, up ${Math.round(p.risk.rampPct)}% — that ramp is likely the trigger, so hold volume flat while you strengthen` : " at a steady ramp, so focus on the strength piece"}. This one resolves in 2–4 weeks if you respect the distance limit; it drags for months if you keep testing it.`,
  },

  /* ---------- get faster: events ---------- */
  {
    id: "faster-800",
    score: (q) => hit(q, [/800/], 2) + hit(q, [/faster|improve|better|drop time/]),
    answer: ({ p }) => {
      const pred = p.predictions["800m"];
      const pr = p.prs.find((x) => x.event === "800m");
      return `Your engine says ${pred.label} right now${pr?.timeS ? ` (PR ${pr.label})` : ""}. The 800 is 60–70% aerobic — most high schoolers think it's a long sprint and train it backwards. Three levers, in order of payoff for you: (1) Aerobic base — your ${p.risk.weekKm} km/week IS your 800 training; the last 200m is run on it. (2) Specific speed once a week: 6×200 at goal pace with full 3-min recoveries, focused on staying RELAXED at speed — jaw loose, shoulders down. Speed you can only hold while straining isn't race speed. (3) Race model: go out in ${fmtTime(pred.timeS / 2 - 1)}, hit 400 within a second of that, stay tall through 600 when everything screams, and commit at the 200 pole — the race is decided by who slows down least, not who kicks hardest. Add hill sprints (6×10s) after one easy run a week; they build the power that makes lane-1 speed feel cheap.`;
    },
  },
  {
    id: "faster-mile",
    score: (q) => hit(q, [/mile|1600/], 2) + hit(q, [/faster|improve|break|under|sub|5 ?min/]),
    answer: ({ p }) => {
      const pred = p.predictions["Mile"];
      const target = 300; // sub-5:00 mile in seconds
      const gap = pred.timeS - target;
      const goal = p.goals.find((g) => g.event === "Mile");
      return `Predicted mile right now: ${pred.label}${goal ? ` against your ${goal.targetLabel} goal` : ""}. ${gap <= 0 ? `You're already fit enough to break 5:00 — now it's execution. Even 400s (~${fmtTime(target / 4)}), no hero first lap, and pick a race with bodies to run with; a paced race is worth 3–4 seconds versus a solo one.` : gap <= 8 ? `You're ${Math.round(gap)}s off breaking 5:00 — that's one good block, not a dream. The math: hold your volume, add one threshold session (4–5×4 min at ${p.predictions["5K"] ? fmtTime((p.predictions["5K"].timeS / 5) * 1.05) + "/km" : "comfortably hard"}) and one speed session (8×400 at goal mile pace, 90s rest) per week, and race it every chance you get.` : `The gap to 5:00 is ${Math.round(gap)}s, which is a season of honest work, not a month. Build the aerobic base first — every extra consistent week at ${p.risk.weekKm}+ km moves the mile more than any workout.`} Lap discipline is the whole secret: the kid who runs ${fmtTime(pred.timeS / 4)}-${fmtTime(pred.timeS / 4)}-${fmtTime(pred.timeS / 4 + 2)}-${fmtTime(pred.timeS / 4 - 2)} beats the kid who opens 5 seconds too fast. Every time.`;
    },
  },
  {
    id: "faster-5k",
    score: (q) => hit(q, [/5k|5 k|xc|cross country|three mile|5000/], 2) + hit(q, [/faster|improve|better|drop/]),
    answer: ({ p }) => {
      const pred = p.predictions["5K"];
      return `Your predicted 5K is ${pred.label} (${fmtTime(pred.timeS / 5)}/km). The 5K is ~90% aerobic, so the recipe is unglamorous: volume, threshold, patience. What moves it for you specifically: (1) protect the long run — it's ${Math.round(p.risk.weekKm * 0.26)} km in your current week and it's the single biggest lever; (2) one real threshold day (5×4 min at ~${fmtTime((pred.timeS / 5) * 1.05)}/km — "comfortably hard," you could speak short sentences); (3) strides twice a week so 5K pace feels like a gear, not a strain. ${p.fitness.trend === "improving" ? `Your fitness trend is already climbing — don't change what's working, just stack weeks.` : p.fitness.trend === "plateau" ? `You're plateaued, which usually means the easy days are too hard and the hard days too soft — polarize: easier easy, harder threshold.` : `Fitness dipped recently — that's usually fatigue masking fitness, not lost fitness. Absorb, then push.`} In races: even splits, and make one decisive move at 2-to-go instead of surging every 400.`;
    },
  },

  /* ---------- race prep ---------- */
  {
    id: "day-before-race",
    score: (q) => hit(q, [/day before|night before|before (my|the) race|race tomorrow/], 3),
    answer: ({ p }) => {
      const race = p.races.upcoming[0];
      return `${race ? `${race.name} is in ${race.daysUntil} days — h` : "H"}ere's the day-before playbook: 15–20 min shakeout with 3 relaxed strides (keeps you springy without spending anything), normal familiar food with carbs at every meal — nothing new, nothing heavy — and water through the day, not chugged at night. Lay out kit, pin the bib, plan the morning timeline tonight so race morning has zero decisions. Then the most underrated performance enhancer in the sport: 8–9 hours of sleep. The night before matters, but the TWO nights before matter more, so protect tonight too. Nerves are normal and useful — your body is loading the spring. ${p.plan.taperMode ? "Your taper's been handled automatically all week, so trust it: the heaviness you might feel mid-taper lifts exactly when the gun goes." : ""}${race ? ` Your pacing plan is on the Race tab: predicted ${race.predicted}.` : ""}`;
    },
  },
  {
    id: "race-morning-food",
    score: (q) => hit(q, [/eat before|breakfast|race morning|morning of.*race|before racing|pre.?race (meal|food)|eat.*(before|morning).*race|race.*(eat|food)/], 4),
    answer: ({ p }) => `Race-morning rule: 2–3 hours before the gun, 300–500 calories of familiar carbs, low fat, low fiber — toast with honey, a bagel, oatmeal, banana. Nothing you haven't eaten before a hard workout at least once (race day is never the day to experiment). Sip water until ~45 min out. If you race in the afternoon, eat a normal breakfast, a carb lunch 3+ hours out, and a small snack (banana, granola bar) 90 min before if you're hungry. Caffeine: if you don't use it, race day isn't the day to start.${p.races.upcoming[0] ? ` For ${p.races.upcoming[0].name}, check the start time and count backwards — write the eating timeline into your phone tonight.` : ""} The goal is boring: arrive fueled, not full.`,
  },
  {
    id: "pacing",
    score: (q) => { const pw = hit(q, [/splits|go out|strateg|what pace|even split|negative split|how fast.*(start|open)/], 1); return pw ? pw * 3 + hit(q, [/\brace\b|\bmeet\b/], 1) : 0; },
    answer: ({ p }) => {
      const race = p.races.upcoming[0];
      if (race) {
        return `For ${race.name} (${race.event}), your fitness says ${race.predicted}. The plan: ${race.pacing.join(" ")} The physiology behind it: every second you go out too fast costs you two on the back half — it's not a fair trade, it's a loan shark. Negative or even splits win at every level of this sport, and your predicted time itself comes from the VDOT/Riegel model (race times predict equivalent performances across distances — Daniels), fed by your real VO₂max and paces.`;
      }
      const pred = p.predictions["5K"];
      return `General pacing law: even or slightly negative splits, always. For a 5K at your current fitness (${pred.label}), that's ${fmtTime(pred.timeS / 5)}/km held steady, first km deliberately 3–5s slower than it feels like it should be, then work the field in the middle, then empty it from 800 out. Banked time is borrowed time — going out fast doesn't save seconds, it borrows them at brutal interest.`;
    },
  },

  /* ---------- plateaus, load, why slower ---------- */
  {
    id: "slower-despite-training",
    score: (q) => hit(q, [/slower|getting worse|plateau|not improving/], 3) + hit(q, [/training (more|harder)|even though|but.*(worse|slower)/], 3),
    answer: ({ p }) => {
      const bits: string[] = [];
      const r = p.risk;
      if (r.acwr !== null && r.acwr > 1.3) bits.push(`your load ratio is ${r.acwr} — you're stacking work faster than you're absorbing it, so every run happens on tired legs`);
      if (p.patterns.monotony !== null && p.patterns.monotony > 2) bits.push(`your monotony is ${p.patterns.monotony}: every day is medium-hard, which means no day is high-quality and no day is recovery`);
      if (r.recovery.hrvDeltaPct !== null && r.recovery.hrvDeltaPct <= -12) bits.push(`HRV is ${Math.abs(r.recovery.hrvDeltaPct)}% under baseline — objective proof you're under-recovered`);
      if (p.patterns.sleepDebtH !== null && p.patterns.sleepDebtH > 4) bits.push(`you're carrying ${p.patterns.sleepDebtH}h of sleep debt`);
      const cause = bits.length ? bits.join("; ") : "your load data actually looks clean, so this is likely a normal plateau — they end for the athletes who keep showing up";
      return `This is the most important question in training, and your data answers it: ${cause}. Here's the physiology: training doesn't make you fitter — RECOVERING from training makes you fitter. Stress + rest = growth; stress + stress = a hole. The fix is a 5–7 day absorb block: easy days actually easy (embarrassingly easy), one short quality session to stay sharp, 8+ hours of sleep, then watch what happens — fitness that was hiding under fatigue shows up in about ten days. The athletes who get this are the ones still improving senior year.`;
    },
  },
  {
    id: "how-much-mileage",
    score: (q) => hit(q, [/mileage|volume|per week|a week|weekly/], 4) + hit(q, [/how (much|many|far)|miles|km|run more/], 2),
    answer: ({ p }) => `You're at ${p.risk.weekKm} km this week against a ${p.weeklyTargetKm} km target, with a 4-week base around ${Math.round(p.risk.chronic / Math.max(p.risk.acute, 1) * p.risk.weekKm) || p.risk.weekKm} km. The honest answer on "how much": more volume makes you faster at everything from 800m up, BUT only volume you absorb without breaking. Here's the science that should run your build: ${FACTS.acwrSpike} — so keep weekly jumps under ~10%, take a down-week every 4th week (cut ~25%), and never raise volume and intensity in the same week. And ${FACTS.fitProtects}, so the base you build now is what lets you handle the big weeks later. ${p.risk.rampPct !== null && p.risk.rampPct > 15 ? `You're up ${Math.round(p.risk.rampPct)}% right now, so the answer this week is: hold, don't add.` : `Your ramp is controlled right now, so if you want to build, add ~${Math.max(2, Math.round(p.risk.weekKm * 0.08))} km to next week's easy days — never to the workouts.`} The 100-mile week you survive beats the 60-mile week that breaks you — consistency over 12 weeks beats heroics over 2, every single time.`,
  },

  /* ---------- recovery science ---------- */
  {
    id: "sleep",
    score: (q) => hit(q, [/sleep|tired all|nap|bed ?time/], 4),
    answer: ({ p }) => {
      const s = p.risk.recovery.sleepAvg;
      return `${s !== null ? `You're averaging ${s}h right now${p.patterns.sleepDebtH !== null && p.patterns.sleepDebtH > 2 ? ` with ${p.patterns.sleepDebtH}h of debt this week` : ""}. ` : ""}Sleep is when training becomes fitness: growth hormone pulses in deep sleep repair the muscle and bone you stressed today, and the research on teen athletes is blunt — ${FACTS.sleepInjury} (Milewski, 2014). ${FACTS.sleepTeen}, and ${FACTS.sleepPerf}. What actually works: same bedtime every night (your body loves rhythm more than totals — your consistency score is ${p.patterns.sleepConsistency ?? "—"}/100), phone out of reach 30 min before bed, room cold and dark, and if you're stuck at 7h on school nights, a 20–30 min afternoon nap is legitimate recovery, not laziness. One number to remember: sleeping 8+ the two nights before a race is worth more than any workout you could do that week.`;
    },
  },
  {
    id: "hrv-rhr-meaning",
    score: (q) => hit(q, [/hrv|heart rate variability|resting (hr|heart)|vo2|what does.*(mean|score)/], 2),
    answer: ({ p }) => {
      const r = p.risk.recovery;
      return `Quick decoder for your numbers: RESTING HR (yours: ${r.restingHr ?? "—"} bpm vs your ${r.restingHrBaseline ?? "—"} baseline) is your body's idle speed — it drops as you get fitter, and it RISES 5+ bpm when you're under-recovered or getting sick; it's often the first alarm, days before you feel anything. HRV (yours: ${r.hrv ?? "—"} ms, ${r.hrvDeltaPct !== null ? `${r.hrvDeltaPct > 0 ? "+" : ""}${r.hrvDeltaPct}% vs baseline` : "building baseline"}) measures the variation between heartbeats — higher means your nervous system is in rest-and-recover mode, suppressed means it's still fighting yesterday's stress. Never judge one day; judge the trend against YOUR baseline — ${FACTS.hrvRead} — which is exactly what RunGuard does. In fact, ${FACTS.hrvGuided} (Vesterinen 2016). VO₂max (yours: ${p.fitness.vo2max ?? "—"}) is your aerobic engine size — it climbs slowly with consistent volume and is the best single predictor of your race times, which is how I compute your predictions. The skill isn't tracking the numbers — it's acting on them: green means push, suppressed means the easy day IS the training.`;
    },
  },

  /* ---------- fuel & conditions ---------- */
  {
    id: "nutrition",
    score: (q) => hit(q, [/eat|food|nutrition|diet|fuel|iron|protein|hydrat|drink|water/], 2),
    answer: ({ p }) => `Fueling for a distance runner your age, in priority order: (1) ENOUGH — this is the big one: ${FACTS.redsBone} (that's the IOC's RED-S consensus), and under-eating is the fastest road to injury and stalled times. You're burning ${Math.round((p.risk.weekKm * 62) / 7)}+ extra calories a day at your volume, so eating MORE is the goal — weight-loss talk has no place in a teenager's training. (2) Carbs around training — before (toast, banana) and within an hour after with some protein (chocolate milk is genuinely elite recovery food). (3) Iron — distance runners, especially female athletes, drain it; fatigue that sleep doesn't fix + rising RHR + falling times = ask for a ferritin test. Red meat, spinach, fortified cereal, vitamin C alongside. (4) Hydration is an all-day habit, not a practice-time event: pale-yellow urine is the check, and add electrolytes on hot days or before ${p.races.upcoming[0]?.name ?? "race day"}. Supplements you don't need; breakfast you do.`,
  },
  {
    id: "heat",
    score: (q) => hit(q, [/hot|heat|humid|summer|sun|weather/], 2),
    answer: ({ p }) => `Heat is a real physiological load — your heart works 10–20 bpm harder at the same pace, so PACE LIES IN HEAT; effort is the truth. Adjust: slow easy runs 15–30s/km in real heat and let HR be the guide, shift runs to morning, pre-hydrate with electrolytes not just water, and give yourself 10–14 days to acclimate to a heat wave (it's real adaptation, like altitude). The good news: heat training is a legit fitness stimulus — blood plasma expands and cool-weather racing feels easier after. Warning signs that mean STOP, walk, find shade: chills or goosebumps in the heat, confusion, wobbling. That's heat illness, not toughness territory. Your watch HR data flows into RunGuard, so hot-day runs won't unfairly ding your load scores — the effort is what's measured.`,
  },

  /* ---------- head game ---------- */
  {
    id: "mental",
    score: (q) => hit(q, [/nervous|anxiety|anxious|scared|pressure|confiden|mental|motivat|burn(ed|t)? ?out|don'?t (want|feel like)/], 2),
    answer: ({ p }) => {
      return `First: what you're feeling is normal and it's data, not weakness. ${p.mental30.length ? `Your check-ins show energy averaging ${Math.round((p.mental30.filter((m) => m.energy != null).reduce((s, m) => s + (m.energy ?? 0), 0) / Math.max(1, p.mental30.filter((m) => m.energy != null).length)) * 10) / 10}/10 lately${p.mental30.some((m) => m.stress) ? " with school stress flagged" : ""} — and mental load IS training load; your body doesn't separate exam stress from mileage stress. ` : ""}For race nerves: they're your body loading the spring — the goal isn't calm, it's channeled. Use a 3-breath reset (long exhales), a process cue ("tall and smooth"), and a written race plan so nerves have a job to do. For motivation dips: they're usually fatigue wearing a disguise — check whether you need rest more than you need "discipline." And if running has felt heavy for 2+ weeks straight, say it out loud to your coach or someone you trust; the athletes with the longest careers are the ones who treat their head like part of the training, because it is.`;
    },
  },

  /* ---------- training theory ---------- */
  {
    id: "why-easy",
    score: (q) => hit(q, [/easy (day|run|pace)|why.*(easy|slow)|tempo|threshold|interval|long run|workout.*(mean|why|point)/], 2),
    answer: ({ p }) => {
      const pace5k = p.predictions["5K"].timeS / 5;
      return `The system behind your week, decoded: EASY RUNS (~${fmtTime(pace5k * 1.3)}/km for you) build capillaries, mitochondria, and bone durability — they work BECAUSE they're easy; run them too fast and you get neither recovery nor stimulus, which is the #1 mistake in high school running. THRESHOLD/TEMPO (~${fmtTime(pace5k * 1.05)}/km, "comfortably hard") raises the pace you can hold without drowning in lactate — the biggest lever for 5K/XC. INTERVALS (~${fmtTime(pace5k * 0.96)}/km with recoveries) teach race pace and top-end power in doses you can absorb. LONG RUN = the aerobic foundation everything sits on. The elite ratio — and it holds from Olympians to high schoolers — is roughly 80% easy / 20% hard: ${FACTS.polarized} (Seiler; Stöggl 2014). ${p.patterns.monotony !== null && p.patterns.monotony > 2 ? `Your monotony score (${p.patterns.monotony}) says your days blur together — making the easy days truly easy is your single fastest path to improvement right now.` : `Your plan already polarizes properly — trust the slow days; they're where the speed comes from.`}`;
    },
  },
  {
    id: "strength-cross",
    score: (q) => hit(q, [/strength|weights|gym|core|lift|cross ?train|bike|swim|elliptical/], 2),
    answer: ({ p }) => `Yes — and here's what actually matters for a runner (not a bodybuilding plan): 2×/week, 20–30 min, focused on single-leg strength and stiffness where running injuries live. The short list with the biggest evidence: eccentric calf drops (shin/achilles armor), single-leg step-downs and glute bridges (knee/hip control), side planks (IT band insurance), and 6×10s hill sprints as "strength in disguise." Heavy-ish and slow beats endless reps of nothing, and to kill the myth directly: ${FACTS.strengthSafe}. Core work: planks and dead bugs, not 200 crunches. CROSS-TRAINING (bike, swim, elliptical) is how you add aerobic volume when your legs can't absorb more impact — ${p.readiness < 65 ? "and while your readiness is down, swapping one run for a 40-min bike keeps the engine building while your legs catch up" : "useful for down-weeks or niggle management, though right now your legs can handle the real thing"}. Your plan already threads supplemental work into the week — it's on each training card.`,
  },
  {
    id: "comeback",
    score: (q) => hit(q, [/(back|return).*(injury|break|time off)|coming back|missed.*(week|month)|out for/], 2),
    answer: ({ p }) => `The comeback is where most re-injuries happen, so here's the honest protocol: your heart and lungs return in ~2 weeks, but bone and tendon need 4–6+, and the gap between those two curves is exactly where athletes break twice. Rules: start at ~50% of your pre-break volume, add no more than 10–15% a week, keep everything easy for the first two weeks (no workouts, no strides in week one), and never increase volume and intensity in the same week. ${p.injuries.length ? `Given your history (${p.injuries[0].body_part}), the body part that broke gets a vote for a full year — daily eccentric/strength work for it isn't optional.` : ""}${p.risk.acwr !== null && p.risk.acwr < 0.8 ? ` Your ratio is ${p.risk.acwr} right now — your chronic base has drained, which means your engine will feel ready before your legs are. That feeling is the trap. Trust the plan's numbers, not the freshness.` : ""} The comeback done right takes 6 weeks. Done wrong, it takes 6 months. Boring wins.`,
  },
  {
    id: "cadence-form",
    score: (q) => hit(q, [/cadence|form|stride|technique|foot ?strike|posture/], 2),
    answer: ({ p }) => {
      return `Form advice that's actually evidence-based (most isn't): don't overhaul your natural stride — runners self-optimize remarkably well. The two things worth touching: (1) CADENCE — if you overstride (foot landing far ahead, braking every step), a 5% cadence bump fixes it gently; think "quicker, not bigger" steps, especially downhill. Most efficient high schoolers land around 170–180 at easy pace, but YOUR baseline matters more than the magic number. (2) POSTURE under fatigue — tall through the hips, eyes up, arms driving back not across; when you're dying in the last 400, form IS free speed because slumping costs you oxygen. Everything else (footstrike debates, arm angles) is noise. Strides twice a week are the best form practice that exists: 6×20s smooth accelerations where you practice being fast AND relaxed — that combination is the entire skill.`;
    },
  },
  {
    id: "side-stitch",
    score: (q) => hit(q, [/\bstitch\b|side (pain|cramp|ache)|\bcramp/], 2),
    answer: () => `Side stitches are a diaphragm/ligament irritation thing — annoying, harmless, and beatable. In the moment: exhale HARD when the foot on the opposite side of the stitch lands (right-side stitch → exhale on left foot), press two fingers into the spot and breathe deep into your belly, and if it's brutal, 20 seconds of walking with deep breaths resets it faster than gutting through. Prevention is mostly timing: no big food or fruit juice within ~2 hours of hard running, warm up progressively instead of going 0-to-workout, and train belly breathing on easy runs (belly rises before chest). They also fade with fitness — most runners basically outgrow them as volume builds. If it's not a classic under-the-ribs stitch but recurring gut trouble on runs, that's a fueling-timing problem — tell me what and when you eat pre-run and we'll fix the schedule.`,
  },

  /* ---------- taper ---------- */
  {
    id: "taper",
    score: (q) => hit(q, [/taper|peak|sharpen|before.*(big|championship)|feel (flat|heavy|sluggish).*(taper|race week)/], 3),
    answer: ({ p }) => {
      const race = p.races.upcoming[0];
      return `Tapering is the most scientifically settled thing in distance running, and most people do it scared: ${FACTS.taper} — a meta-analysis of dozens of studies. The key word is INTENSITY — you keep the fast stuff, you just do less of it; cutting the sharpness is what makes people feel flat. ${race ? `For ${race.name} in ${race.daysUntil} days, ${p.plan.taperMode ? "RunGuard has already flipped your plan into taper mode — trust it" : "your taper window opens soon and RunGuard will auto-adjust the plan"}. ` : ""}The heavy-legs feeling mid-taper is normal and it lifts right on time — that's your body super-compensating. Don't panic-train through it; the work is already in the bank. Two nights of 8+ hours sleep before the gun is the last 1% (Milewski/Mah).`;
    },
  },
  {
    id: "illness-sick",
    score: (q) => hit(q, [/sick|cold|flu|fever|sore throat|congest|run.*(sick|cold)|should i (run|train).*sick/], 3),
    answer: ({ p }) => `The honest rule of thumb: symptoms above the neck (runny nose, mild sore throat, no fever) — a short easy run is usually fine and sometimes helps. Anything BELOW the neck (chest, body aches, fever, stomach) — rest, no exceptions, because running with a fever can be genuinely dangerous for your heart. There's real science here: ${FACTS.jcurve} — which is exactly why your risk climbs during hard blocks. ${p.illness ? `Right now RunGuard is already flagging an illness pattern in your data — resting HR up ${p.risk.recovery.restingHrDelta} bpm, HRV down ${Math.abs(p.risk.recovery.hrvDeltaPct ?? 0)}% — so treat today as a rest or very-easy day and pour it into sleep and food. ` : ""}Getting back: once symptoms clear, ease in at ~50% for a few days — the fatigue lingers after the sniffles leave. When in doubt, the run will always be there tomorrow; your season won't if you push through a fever.`,
  },

  /* ---------- goals / status ---------- */
  {
    id: "goals",
    score: (q) => hit(q, [/goal|on track|target|\bwill i\b|can i (break|make|hit)/], 2),
    answer: ({ p }) => {
      if (p.goals.length) {
        const lines = p.goals.map((g) => `${g.event}: target ${g.targetLabel}, currently predicted ${g.predicted}${g.onTrack ? " — on track ✓" : " — still chasing"}`);
        return `Where you stand against your season goals:\n${lines.join("\n")}\nFitness is ${p.fitness.trend} (score ${p.fitness.score}/100, ${p.fitness.tier} tier). ${p.fitness.trend === "improving" ? "The trend is doing the work — protect the streak: consistency, sleep, and honest easy days." : "The move: one genuinely hard threshold day, one speed day, everything else easier than feels productive, 8h+ sleep. Predictions update after every sync, so you'll see the needle move within 2–3 weeks of clean training."} Goals get hit in the boring weeks, not the heroic ones.`;
      }
      return `You haven't set season goals yet — add PR targets in your Profile tab and I'll track your live predictions against them after every run. A good goal: 2–4% faster than your PR for the season, broken into a process goal you control (miles, sleep, strides) — outcome goals give direction, process goals give progress.`;
    },
  },
  {
    id: "risk-explain",
    score: (q) => hit(q, [/risk|injur|why.*(score|flag|red|yellow)|acwr|dangerous/], 2),
    answer: ({ p }) => {
      const drivers = p.risk.insights.slice(0, 3).join(" ");
      const spiked = p.recentRuns.find((r) => r.spike);
      return `RunGuard doesn't give you an injury-risk number any more, and that's deliberate — the ones apps show (including the one this used to show) don't predict injury well enough to be worth acting on. The workload ratio in particular was tested in a study of 5,205 runners and showed no association with getting hurt. So instead of a score, here's what your data actually says: ${drivers}${spiked ? ` Also worth noting — your ${spiked.km} km run was ${spiked.spike!.pctAbove}% longer than anything else in the month before it, and that single-session jump is the one load pattern the research does support.` : ""} Readiness (${p.readiness}/100) is the number to watch day to day, and it leans mostly on what you tell us in your check-in, because self-report turns out to track how you're coping better than any wrist sensor doeek bring it down. The point of the number isn't to scare you — it's that the injuries that end seasons announce themselves in this data 1–2 weeks early, and you're one of the few athletes who can see the announcement.`;
    },
  },

  /* ---------- warm-up / cool-down ---------- */
  {
    id: "warmup",
    score: (q) => hit(q, [/warm ?up|warmup|cool ?down|cooldown|before.*(workout|run|race)|dynamic (stretch|warm)/], 2),
    answer: () => `Warm-up done right is short and specific, not a stretching routine: 10–15 min easy jog, then leg swings and lunges (dynamic, moving — never long static holds before running, those briefly reduce power), then 4–6 strides building to race pace. Before a hard workout or race, add 2–3 of the first reps at goal effort so the first real one doesn't shock you. Cool-down: 5–10 min easy jog flushes the legs and genuinely speeds recovery — the day after a hard session tells you whether you did it. Skipping the cool-down is the most common "why am I so sore" answer.`,
  },
  /* ---------- shoes ---------- */
  {
    id: "shoes",
    score: (q) => hit(q, [/shoe|spikes|racing flat|super ?shoe|carbon|rotation|new kicks|footwear/], 2),
    answer: () => `Shoe basics that actually matter: (1) replace trainers around 500–800 km — worn midsoles are a quiet cause of shin and knee pain, so if a nagging ache started when your shoes got old, that's your answer. (2) Rotate two pairs if you can; it lets the foam recover and spreads the stress. (3) Racing flats or spikes only for workouts and races, not daily runs — they're less protective. (4) Don't chase "super shoes" as a teenager; a well-fit daily trainer that feels good beats a marketing story. Fit rule: thumbnail of space at the toe, locked heel, comfortable out of the box — a shoe you have to "break in" is the wrong shoe.`,
  },
  /* ---------- treadmill / weather ---------- */
  {
    id: "treadmill-weather",
    score: (q) => hit(q, [/treadmill|rain|snow|ice|storm|cold weather|freezing|indoor|wind/], 2),
    answer: ({ p }) => `Bad weather isn't a rest day by default — it's a "train smart" day. Treadmill running is 100% legitimate: set 1% incline to mimic outdoor effort, and it's the safe call for ice or lightning. Cold: layer, cover hands and ears, and warm up indoors first — cold muscles strain easier. Wind: effort over pace, and if it's a loop, save the tailwind for the way home. Rain alone is just wet — dress light, it won't hurt you. The only weather I'd actually pull you inside for is lightning, ice underfoot, or genuine heat illness territory. ${p.plan.days.find((d) => d.isToday)?.type ? `Today's "${p.plan.days.find((d) => d.isToday)!.type}" works fine on a treadmill if you need it.` : ""}`,
  },
  /* ---------- stretching / foam rolling ---------- */
  {
    id: "stretch-roll",
    score: (q) => hit(q, [/stretch|foam ?roll|mobility|flexib|tight (muscle|hamstring|calf|hip)|massage gun/], 2),
    answer: () => `Honest take from the research: static stretching doesn't prevent injuries the way people think, and stretching hard BEFORE a run can slightly dull your power — so save the long holds for after or separate sessions. What's actually worth your time: dynamic mobility before running (leg swings, lunges), and foam rolling, which won't "release" anything structurally but genuinely reduces the soreness feeling and helps you move better for the next run. If one muscle is always tight, that's usually a strength or overuse signal, not a flexibility problem — tight calves love eccentric heel drops more than they love stretching. Mobility is a supporting actor; sleep, easy days, and gradual load are the leads.`,
  },
  /* ---------- breathing / side / doubles ---------- */
  {
    id: "breathing",
    score: (q) => hit(q, [/breath|out of breath|can'?t breathe|breathing (hard|pattern)|winded/], 2),
    answer: () => `Being out of breath is mostly a fitness thing, not a technique thing — it improves as your aerobic base grows, which is the whole point of easy volume. Two things help now: (1) belly breathing — breathe into your stomach, not shallow into your chest; practice it on easy runs until it's automatic. (2) A rhythm like 3 steps in, 2 steps out on easy running, dropping to 2-in-1-out when it's hard. If you're gasping at EASY pace, you're running your easy days too fast — that's the #1 fix. But breathing that's genuinely wheezy, tight, or worse in cold/allergy season can be exercise-induced asthma, which is common and very treatable — worth mentioning to a doctor if that's you.`,
  },
  /* ---------- GI / bathroom ---------- */
  {
    id: "gi",
    score: (q) => hit(q, [/bathroom|poop|diarrhea|nausea|throw up|vomit|gut|stomach (problem|issue|hurt)|runner'?s (trots|stomach)/], 2),
    answer: () => `"Runner's stomach" is real and almost always fixable with timing, not toughness. The playbook: (1) don't eat a big or high-fiber/high-fat meal within ~2–3 hours of hard running; (2) figure out your trigger foods and cut them the day before races (dairy, lots of fiber, and greasy food are common culprits); (3) hydrate through the day, not a huge gulp right before; (4) go to the bathroom before you run when you can. Nerves make it worse, so it often spikes before races — a consistent pre-race routine calms both. If it's severe, bloody, or happens off running too, that's a see-a-doctor thing, not a training thing.`,
  },
  /* ---------- blisters / chafing ---------- */
  {
    id: "skin",
    score: (q) => hit(q, [/blister|chafe|chafing|black (toe ?)?nail|rub|raw|band ?aid/], 2),
    answer: () => `Small stuff, big annoyance, easy fixes. Blisters: usually friction from wet feet or bad-fit socks — try moisture-wicking (not cotton) socks, a little lube on hot spots, and make sure shoes aren't too small (feet swell on long runs). Chafing: lube the usual spots (inner thighs, under arms, and yes, guys — the chest) before long runs; wet cotton is the enemy. Black toenails come from shoes too short or toes jamming on downhills — size up a half. None of these are training-stoppers, but a blister that makes you change your stride can cause a real injury, so patch it and adjust the gear rather than limping through.`,
  },
  /* ---------- caffeine ---------- */
  {
    id: "caffeine",
    score: (q) => hit(q, [/caffeine|coffee|energy drink|pre ?workout|red bull|celsius/], 2),
    answer: () => `Straight answer for a high schooler: caffeine is a proven performance aid for adults, but race day is never the day to experiment, and energy drinks/pre-workouts are a bad idea at your age — the doses are high, unregulated, and mess with the sleep that's actually building your fitness. If you already drink coffee normally, keep your normal amount; don't add a big new dose before a race hoping for magic — you'll more likely get jittery, a racing gut, and wrecked sleep. The performance gains you want are sitting in sleep, fueling, and consistent training, not in a can. If you're reaching for caffeine to get through practice, that's a recovery flag worth looking at.`,
  },
  /* ---------- SAFETY: weight / body image ---------- */
  {
    id: "weight-body",
    score: (q) => hit(q, [/lose weight|weight (loss|to run)|too (fat|heavy)|body ?fat|skinnier|lighter.*faster|diet to|cutting weight|race weight|calorie (deficit|counting)/], 4),
    answer: () => `I want to be really straight with you here because it matters: chasing a lower weight is one of the most dangerous mistakes a young runner can make, and the science is clear — under-fueling is a leading cause of stress fractures, stalled times, hormone problems, and injuries that end careers (that's the IOC's RED-S consensus). Runners get faster by getting STRONGER and better fueled, not lighter — your body needs enough food to build the fitness you're training for. If thoughts about weight or food are taking up real space in your head, please talk to your coach, a parent, or your doctor — that's not weakness, it's exactly what the best athletes do. My job is to make you fast and healthy for years, and that road runs through eating enough. What can I help you actually get faster on?`,
  },
  /* ---------- menstrual (careful) ---------- */
  {
    id: "menstrual",
    score: (q) => hit(q, [/period|menstrual|missed.*period|cycle.*(run|train)|amenorr/], 3),
    answer: () => `Good and important question. Training with your period is fine — energy dips around it are normal, so listen to your body on the hard days and don't panic about a slower workout that week. The thing that genuinely matters for a runner: a period that becomes irregular or stops is NOT a normal "fit athlete" sign — it's usually a signal you're not eating enough for your training, and it directly weakens bones and raises stress-fracture risk (part of RED-S / the female athlete triad in the research). If that's happening, it's worth a real conversation with a parent and a doctor — it's common, it's fixable, and catching it early protects your bones and your career. Fueling enough is the fix far more often than "training less."`,
  },
  /* ---------- altitude / travel ---------- */
  {
    id: "altitude-travel",
    score: (q) => hit(q, [/altitude|elevation|travel|time ?zone|flight|racing (away|at)|thin air/], 2),
    answer: () => `Altitude: if you're racing somewhere noticeably higher than home, expect easy runs to feel harder and paces to be slower for the first few days — that's normal, run by effort, and either race within ~24h of arriving (before the dip hits) or give yourself a week to adjust. Travel for races: protect sleep above all (jet lag hurts more than the miles), hydrate on the plane, get a shakeout jog in when you land to loosen up, and keep your food familiar. None of this changes your fitness — you don't lose it in a few days — so trust your training and just manage the logistics. Championship season is 90% staying healthy and rested, 10% anything clever.`,
  },
];

/* ---------- dispatcher ---------- */

function classify(lower: string): { intent: Intent | null; score: number } {
  let best: Intent | null = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const s = intent.score(lower);
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }
  return { intent: best, score: bestScore };
}

/** The user message just before the current one (for follow-up continuity). */
function previousUserMessage(athleteId: number): string | null {
  const rows = getDb()
    .prepare("SELECT text FROM chat_messages WHERE athlete_id = ? AND role = 'user' ORDER BY id DESC LIMIT 2")
    .all(athleteId) as { text: string }[];
  return rows[1]?.text ?? null; // rows[0] is the current message
}

const ACK = /^(ok(ay)?|thanks|thank you|thx|got it|cool|nice|sounds good|will do|makes sense|k+|👍|great)\b/i;
const FOLLOWUP = /^(why|how (long|come|much|often|do i)|what (do|about|else|now|next)|and\b|so\b|then\b|really|are you sure|explain|elaborate|tell me more|more|but\b|ok(ay)? (so|but|what|how|and))/i;

function ruleAnswer(q: string, p: CoreProfile): string {
  const lower = q.toLowerCase().trim();
  const words = lower.split(/\s+/).length;
  const { intent, score } = classify(lower);

  // Strong direct match wins immediately.
  if (intent && score >= 2) return intent.answer({ p, q: lower });

  // Pure acknowledgement — keep it human and short.
  if (ACK.test(lower) && words <= 5) {
    return `Anytime. I'm here whenever you want to dig into today's run, your race plan, a niggle, sleep, fueling — whatever's on your mind. 👊`;
  }

  // Thin follow-up ("how long?", "why?", "what do I do") — continue the last topic.
  if ((FOLLOWUP.test(lower) || words <= 4) && score < 2) {
    const prev = previousUserMessage(p.athlete.id);
    if (prev) {
      const prevMatch = classify(prev.toLowerCase());
      if (prevMatch.intent && prevMatch.score > 0) {
        return prevMatch.intent.answer({ p, q: `${prev.toLowerCase()} ${lower}` });
      }
    }
  }

  // Weak-but-present match.
  if (intent && score > 0) return intent.answer({ p, q: lower });

  // Smart fallback: reason with any number they gave, else warm clarifier.
  const numMatch = lower.match(/(\d{2,3})\s*(mile|mi|km|k)\b/);
  if (numMatch) {
    const val = parseInt(numMatch[1]);
    const km = /mi|mile/.test(numMatch[2]) ? Math.round(val * 1.609) : val;
    const vs = km > p.risk.weekKm * 1.15 ? "well above" : km < p.risk.weekKm * 0.85 ? "below" : "right around";
    return `You mentioned ${val} ${numMatch[2]} — that's ${vs} your current ${p.risk.weekKm} km/week. Whether it's "too much" is about the jump, not the number: big weekly increases (past ~10%) are what drive injuries, and your load ratio right now is ${p.risk.acwr ?? "still building"}. If you want to build toward it, add a couple km to your easy days each week and let your body catch up. Want me to map a safe path from where you are to there?`;
  }

  const race = nextRaceLine(p);
  return `Good question — let me make sure I give you the right answer. Right now you're at ${readinessLine(p)}, fitness ${p.fitness.score}/100${race ? `, with ${race}` : ""}. I can go deep on any of these: today's run or a specific pain, your race plan and pacing, getting faster in the 800/mile/5K, sleep and recovery, fueling, or why your numbers look the way they do. What's the real thing you want to figure out? I'm reading your actual data, so I'll make it about you — not runners in general.`;
}

/* ---------- Claude path (when ANTHROPIC_API_KEY is set) ---------- */

function dataContext(p: CoreProfile): string {
  const r = p.risk;
  return [
    `Athlete: ${p.athlete.name}, grade ${p.athlete.grade}, ${p.athlete.school}. Events: ${p.athlete.events.join(", ")}.`,
    `Readiness ${p.readiness}/100 (shown to the athlete; mostly self-report). Internal-only diagnostics, NOT shown and not to be quoted as a risk score: legacy risk ${r.score}, ACWR ${r.acwr ?? "n/a"}, week ${r.weekKm} km (ramp ${r.rampPct ?? 0}%), monotony ${r.monotony ?? "n/a"}, days since rest ${r.daysSinceRest}.`,
    `Recovery: resting HR ${r.recovery.restingHr ?? "n/a"} (baseline ${r.recovery.restingHrBaseline ?? "n/a"}, Δ${r.recovery.restingHrDelta ?? 0}), HRV ${r.recovery.hrv ?? "n/a"} ms (${r.recovery.hrvDeltaPct ?? 0}% vs baseline), sleep ${r.recovery.sleepAvg ?? "n/a"}h avg, sleep debt ${p.patterns.sleepDebtH ?? 0}h, VO2max ${p.fitness.vo2max ?? "n/a"}.`,
    `Fitness ${p.fitness.score}/100 (${p.fitness.trend}), tier ${p.fitness.tier}, freshness ${p.fitness.freshness}. Patterns: monotony ${p.patterns.monotony}, high-effort streak ${p.patterns.highEffortStreak}, overreaching ${p.patterns.overreaching}, illness flag ${p.illness}.`,
    `Predictions: 800m ${p.predictions["800m"].label}, Mile ${p.predictions["Mile"].label}, 5K ${p.predictions["5K"].label}, XC ${p.predictions["XC 5K"].label}. PRs: ${p.prs.map((x) => `${x.event} ${x.label}`).join(", ")}.`,
    `Goals: ${p.goals.map((g) => `${g.event} ${g.targetLabel} (${g.onTrack ? "on track" : "chasing"})`).join(", ") || "none set"}.`,
    p.races.upcoming[0] ? `Next race: ${p.races.upcoming[0].name} (${p.races.upcoming[0].event}) in ${p.races.upcoming[0].daysUntil} days.${p.plan.taperMode ? " Taper mode active." : ""}` : "No upcoming race.",
    `Today's plan: ${p.plan.days.find((d) => d.isToday)?.type ?? "rest"}. Injury history: ${p.injuries.map((i) => `${i.body_part} (${i.date.slice(0, 7)})`).join(", ") || "none"}.`,
    p.todayCheckin
      ? `Today's check-in: soreness ${p.todaySoreness.length ? p.todaySoreness.map((s) => `${s.part} ${s.severity}/10`).join(", ") : "none reported"}, energy ${p.todayCheckin.energy ?? "—"}/10.`
      : "No check-in today.",
  ].join("\n");
}

const COACH_SYSTEM = `You are RunGuard AI, the training brain inside RunGuard — and you are this athlete's coach, not a generic assistant. You know exercise science cold: ACWR research (sweet spot 0.8–1.3, risk doubling past 1.5), 80/20 polarized training, supercompensation (stress + rest = growth), taper science, teen sleep needs (8–10h; <8h roughly doubles injury risk), RED-S/under-fueling risks, and injury red-flag screening (focal bone pain, hop test, one-sided sharp pain → refer to athletic trainer, no diagnosis).

Voice: a sharp, warm coach who has seen a thousand high school seasons. Direct, specific, encouraging without being soft. 3-6 sentences usually; short paragraphs, no bullet lists unless asked. ALWAYS ground answers in the athlete's actual data provided below — quote their real numbers. Prefer process over outcome. Never body-shame or discuss weight loss with a minor; if under-fueling signs appear, flag them kindly and suggest talking to a trusted adult. For pain that is sharp, localized, one-sided, or worsening: stop-running advice + see the athletic trainer, always. You may reference their coach ("loop in your coach").
${KNOWLEDGE_FOR_PROMPT}
STYLE EXAMPLES (match this voice — specific, warm, data-grounded, never a lecture):
Q: "should I run today my legs are dead"
A: "Your readiness is 41 and your HRV's sitting 14% under baseline, so your legs aren't lying — that's real fatigue, not laziness. Do the easy 30 min on the plan but keep it truly easy, no strides. If it's sharp or one-sided anywhere, that's a different conversation — tell me where."
Q: "how do I get faster"
A: "For your 5K (predicted 18:40), the fastest lever isn't more hard days — it's protecting the easy ones. Your monotony's at 2.1, which means everything's blurring into medium. Make your easy days genuinely easy and your one threshold day genuinely hard, and hold your ~50k. That polarization is exactly how the fast kids train."
Never invent numbers — only use the data below. If a value is n/a, don't cite it.

Athlete data (live, from their synced wearables and check-ins):
`;

export async function answer(q: string, p: CoreProfile): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const history = chatHistory(p.athlete.id, 10)
        .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.text }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: 500,
          temperature: 0.6,
          system: COACH_SYSTEM + dataContext(p),
          messages: [...history, { role: "user", content: q }],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { content: { type: string; text?: string }[] };
        const text = data.content?.find((c) => c.type === "text")?.text;
        if (text) return text;
      }
    } catch {
      // fall through to the built-in coach
    }
  }
  return ruleAnswer(q, p);
}

export function eventFromText(t: string): EventName | null {
  const s = t.toLowerCase();
  for (const ev of EVENTS) if (s.includes(ev.toLowerCase())) return ev;
  return null;
}
