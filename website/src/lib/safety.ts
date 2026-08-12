/**
 * Deterministic safety intercepts and the fixed replies they return.
 *
 * ZERO IMPORTS, deliberately. `chat.ts` imports the reply constants, and
 * `src/app/dashboard/athlete/[id]/page.tsx` imports `coachWhy` from `chat.ts` —
 * so anything `chat.ts` reaches into lands in that server component's module
 * graph. A leaf of strings and regexes keeps that harmless rather than merely
 * accidental.
 *
 * TWO TIERS, and the split matters.
 *
 * Tier 1 (`safetyIntercept`) runs in the route BEFORE the intent engine, before
 * `buildProfile`, before anything. Pure regex, no I/O, so it fires identically
 * whether the rest of the system is healthy, broken, or absent. Only categories
 * whose false-positive cost is near zero belong here.
 *
 * Tier 2 (the exported pattern arrays) stay inside `INTENTS` in `chat.ts`, where
 * `hit()` scoring still protects the innocent cases. Promoting them to tier 1
 * would regress real answers: "my chest feels tight when i run in the cold" is
 * cold-air bronchospasm and currently gets the illness rule, but a pre-scoring
 * cardiac intercept would send that athlete to urgent care. Same for "how many
 * calories should i eat before a race" and "how many miles a week should i run
 * when i'm on my period".
 *
 * PATTERN RULES, non-negotiable — this code runs before any rate limiter, on
 * attacker-controlled input capped at 1000 chars:
 *   - No /g flag on anything used with .test(). A global RegExp is stateful, so
 *     the net would fire only every other call.
 *   - At most one unbounded quantifier per pattern; prefer bounded .{0,40} to .*.
 *     The naive three-.* forms of two of these cost 5.5ms on inputs that repeat
 *     the literals between them; the bounded forms cost 0.06ms.
 */

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const ZERO_WIDTH = /[​-‍⁠﻿­]/g;
const APOSTROPHE = /[‘’ʼ‛′＇]/g;
const QUOTE = /[“”″＂]/g;
const DASH = /[‐-―−]/g;
/**
 * Combining marks, stripped so the Spanish patterns below actually fire.
 *
 * They are all written unaccented — `hacerme dano`, `provocarme el vomito`,
 * `vomitar despues de comer` — but the CORRECT spellings are `daño`, `vómito`,
 * `después`, and that is what a Spanish keyboard and Spanish autocorrect
 * produce. NFKC composes rather than decomposes, so `ñ` stayed `ñ` and every
 * accented Spanish crisis and purge phrase passed the whole tier-1 net
 * untouched — the exact "English-only net routes these straight past every
 * control" failure the Spanish block was added to prevent, reintroduced by
 * spelling. Decomposing and dropping the marks makes the unaccented patterns
 * match both spellings. English input has no marks, so this is a no-op there.
 */
const COMBINING = /\p{M}+/gu;

function fold(input: string, zeroWidthAs: "" | " "): string {
  return input
    .slice(0, 1000)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(COMBINING, "")
    .replace(ZERO_WIDTH, zeroWidthAs)
    .replace(APOSTROPHE, "'")
    .replace(QUOTE, '"')
    .replace(DASH, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The forms to match against. Two only when zero-width characters are present.
 *
 * The apostrophe fold is not cosmetic. `chat.ts`'s `mental` intent matches
 * `don'?t`, which accepts a straight apostrophe or none — so with the curly
 * apostrophe every Apple keyboard produces by autocorrect, "i don't want to be
 * here anymore" scores ZERO across all 39 intents and falls through to the
 * generic clarifier. NFKC does not fold U+2019.
 *
 * The two variants exist because stripping zero-width handles the common evasion
 * (d<ZWSP>on't -> dont) but breaks when one is used INSTEAD of a space
 * (i<ZWSP>don't -> idont, killing the \b). On clean input this returns one
 * variant and costs nothing.
 */
export function normalise(input: string): string[] {
  if (typeof input !== "string") return [];
  const stripped = fold(input, "");
  const spaced = fold(input, " ");
  return stripped === spaced ? [stripped] : [stripped, spaced];
}

/* ------------------------------------------------------------------ */
/* Tier 1 — intercepted before the intent engine                       */
/* ------------------------------------------------------------------ */

const CRISIS: RegExp[] = [
  /\b(kill|killing|killed) my ?self\b/,
  /\b(wanna|want to|gonna|going to|might|finna) kms\b/,
  /\bsuicid(e|al)\b/,
  /\bunalive\b/,
  /\b(hurt|hurting|harm|harming|cut|cutting) my ?self\b/,
  /\bself[ -]?harm/,
  /\bend (it all|my life)\b/,
  /\b(to|just|gonna|wanna|going to) end it\b/,
  /\b(want|wanna|wanted|wish|wishing) (to )?(disappear|vanish|not exist|not be here|not wake up|be dead|be gone)\b/,
  /\b(want|wanna|wanted) (to )?die\b(?! (after|on|during|from|in|every) )/,
  /\b(don'?t|dont|do not) (wanna|want to|feel like) (be here|being here|be alive|live|living|exist|wake up|waking up)\b/,
  /\bbetter off without me\b/,
  /\b(everyone|everybody|they|my (team|family|parents|mom|dad)) (would|'?d|will) be better off\b/,
  /\bno (reason|point) (to|in) (be|being|live|living|exist)/,
  /\b(not|isn'?t|ain'?t) worth living\b/,
  /\bnothing (matters|is worth it|to live for)\b/,
  /\b(can'?t|cant|cannot) (do|take|handle) (this|it) any ?more\b/,
  /\b(a|like a|such a|just a) burden (to|on)\b/,
  /\bhate my life\b/,
  /\bhate my ?self\b(?! for )/,
  // Spanish — this is a San Jose high school, and an English-only net routes
  // these straight past every control in the system.
  /\bquiero morir/,
  /\bme quiero morir\b/,
  /\bno quiero (estar aqui|vivir|seguir)\b/,
  /\bmatarme\b/,
  /\bsuicid(arme|io|a)\b/,
  /\bhacerme dano\b/,
];

const PURGE: RegExp[] = [
  /\b(made|make|makes|making) my ?self (throw ?up|throwup|puke|vomit|sick|barf)\b/,
  /\b(threw up|throw up|throwing up|throwup|puked?|vomit(ed)?|barfed?)\b.{0,24}\bafter (eating|i ate|meals?|dinner|lunch|breakfast|food|every meal)\b/,
  /\bafter (i )?(eat|ate|eating|every meal)\b.{0,24}\b(throw ?up|threw up|puked?|vomit(ed)?|barfed?)\b/,
  /\b(eat|ate|eating)\b.{0,16}\bthen (i )?(throw ?up|puke|vomit|barf)/,
  /\b(throw|threw|throwing) ?up on purpose\b/,
  /\b(throw|threw) up (my|the) (food|dinner|lunch|meal|calories)\b/,
  /\bpurg(e|ed|es|ing)\b/,
  /\bbulimi(a|c)\b/,
  /\blaxative/,
  /\bdiet pills?\b/,
  /\bappetite suppress/,
  /\bfasting\b/,
  /\b(spit|spat|spitting) (it|my food|the food|food) (back )?out\b/,
  /\bchew(ing)? and spit/,
  /\bget(ting)? rid of (the |what i |it )?(food|calories|ate|eat)/,
  /\bmake it come back up\b/,
  // Spanish
  /\bme hago vomitar\b/,
  /\bvomitar despues de comer\b/,
  /\bprovocarme el vomito\b/,
];

/**
 * Medication, dosing and supplements. Tier 1 because there is no innocent
 * reading of "how much ibuprofen can i take before a long run" that this app
 * should answer — NSAIDs before endurance exercise in a minor carry real
 * hyponatremia and renal risk — and because none of these scored above zero on
 * any of the 39 intents, so today they reach the generic clarifier.
 */
const DRUGS: RegExp[] = [
  /\b(ibuprofen|advil|motrin|aleve|naproxen|nsaids?|tylenol|acetaminophen|paracetamol|aspirin)\b/,
  /\bhow (much|many)\b.{0,30}\b(take|dose|pills?|mg)\b/,
  /\b(inhaler|albuterol|epipen|prednisone|adderall|antibiotics?)\b/,
  /\bcaffeine (pills?|tablets?|gum)\b/,
  /\b(pre ?workout|creatine|steroids?|sarms?|testosterone|hgh)\b/,
  /\b(pain ?killers?|pain ?meds?|meds? before)\b/,
  /\b(run|race|train)\b.{0,30}\b(on|through) (a|my|this) (stress fracture|fracture|sprain|broken)\b/,
  /\b(tape|brace|wrap) it and (run|race|keep)/,
  /\bhide (an? )?(injury|pain|it) from\b/,
  /\bnot tell (my )?(coach|trainer|parents?|mom|dad)\b.{0,20}\b(hurt|pain|injur)/,
];

/* ------------------------------------------------------------------ */
/* Tier 2 — exported for chat.ts's INTENTS, still scored by hit()      */
/* ------------------------------------------------------------------ */

/**
 * Broadened weight/body-image patterns. Verified gaps closed here that the
 * original single regex missed: the misspelling "loose weight" (the commonest
 * teenage spelling of the most-intercepted phrase, which defeated the entire
 * net), "haven't eaten", "only had an apple", and "race day weight" — the last
 * because the original required `race weight` to be adjacent, so one inserted
 * word defeated it.
 */
export const WEIGHT_PATTERNS: RegExp[] = [
  /\b(lose|loose|losing|loosing|lost|drop|dropping|cut|cutting|shed) (some |a little |more )?(weight|wieght)\b/,
  /\b(weight|wieght) (loss|to run)\b/,
  /\brace ?(day )?weight\b/,
  /\bcut\b.{0,20}\bweight\b/,
  /\btoo (fat|heavy|big)\b/,
  /\bbody ?fat\b/,
  /\bskinn(y|ier|iest)\b/,
  /\b(if i|i was|i were|being|be|get) (a lot |much |a bit )?lighter\b/,
  /\blighter\b(?! (shoes?|spikes?|trainers?|kicks|gear|pair)).{0,24}\b(faster|quicker)\b/,
  /\bdiet to\b/,
  /\bcalorie (deficit|counting|count)\b/,
  /\bhow many calories\b/,
  /\bcalories (should|do|can) i (eat|need|have)\b/,
  /\blean(ing)? out\b/,
  /\b(what|how much) should i weigh\b/,
  /\bideal (race |running )?weight\b/,
  /\bwhat.{0,14}weigh for\b/,
  /\bskipp?(ed|ing) (breakfast|lunch|dinner|a meal|meals?|eating)\b/,
  /\bdidn'?t eat (today|dinner|lunch|breakfast|anything|much)\b/,
  /\bhaven'?t eaten\b/,
  /\bonly (had|ate)\b.{0,24}\b(today|all day|since)\b/,
  /\bnothing (to eat|since)\b/,
  /\bguilty\b.{0,24}\b(eat|eating|ate|food|meal|calories)\b/,
  /\b(eating|ate|food|meal)\b.{0,20}\bguilty\b/,
  /\bburn(ing)? (off )?.{0,20}calorie/,
  /\bhow many (miles|km|k)\b.{0,24}\bburn\b/,
  /\banorexi(a|c)\b/,
  /\bbulimi(a|c)\b/,
  /\brestrict(ing|ed|ion|ive)?\b(?! (my |the )?(mileage|volume|miles|training))/,
  /\bthin ?spo\b|\bpro ?ana\b/,
  /\beat(ing)? less\b/,
  /\bunder ?eat/,
  /\bnot eating enough\b/,
  /\bstarv(e|ing) my ?self\b/,
  /\bbmi\b/,
  /\bweigh(ed|ing) my ?self\b/,
  /\bfeel fat\b/,
  /\bbajar de peso\b/,
];

/**
 * Menstrual patterns. Note the original already caught any message containing
 * the bare word "period", so the common phrasings fired — the real gaps were
 * euphemism ("haven't gotten it in three months") and the clinical terms. The
 * bare word is narrowed to `(my|her) period` here, which also fixes the
 * pre-existing false positive on "for a period of time".
 */
export const MENSTRUAL_PATTERNS: RegExp[] = [
  /\bmenstrua/,
  /\bmenses\b/,
  /\bamenorr/,
  /\b(my|her) period\b(?! tracker)/,
  /\bperiods?\b.{0,20}\b(stopped|stop|late|irregular|missing|missed|gone|disappeared|came back)\b/,
  /\b(missed|missing|skipped|skipping|lost|late) (my |a |her )?periods?\b/,
  /\bno period (since|for|in|yet)\b/,
  /\bhaven'?t (gotten|had|got) (it|mine|my period|a period)\b.{0,24}\b(month|week|since|while)/,
  /\bmy cycle\b.{0,20}\b(stopped|irregular|late|missing|off|weird|changed|messed)\b/,
  /\bcycle (stopped|is irregular|is late|is gone)\b/,
  /\bred-s\b/,
  /\brelative energy deficiency\b/,
  /\bfemale athlete triad\b/,
  /\bnever (had|gotten) (my |a )?period\b/,
  /\bno me viene la regla\b/,
];

/**
 * Cardiac. Deliberately NOT tier 1: "my chest feels tight when i run in the
 * cold" is exercise-induced bronchospasm, the most common chest complaint in
 * high-school cross country, and scoring lets `breathing` and `illness-sick`
 * win that one. Note `breathing` is only reachable at all after the /eat/
 * anchoring fix in chat.ts — `nutrition` was shadowing it.
 */
export const CARDIAC_PATTERNS: RegExp[] = [
  /\bchest (pain|pains|tightness|pressure|hurts?|hurting|heavy|heaviness|squeezing|discomfort)\b/,
  /\bchest (felt|feels|got|was|is|gets|went) (really |so |super |kinda |all )?(tight|heavy|weird|tighter)\b/,
  /\b(pain|tightness|pressure|hurting|squeezing|crushing) in (my|the) chest\b/,
  /\bheart (palpitations?|flutter|fluttering|skips? beats?|skipping beats?|skipped beats?)\b/,
  /\bpalpitation/,
  /\bheart attack\b/,
  /\bheart (is |was |keeps |kept )?(racing|pounding|beating (really |so |super )?(fast|hard))\b.{0,30}\b(at rest|resting|sitting|lying|laying|in bed|doing nothing|for no reason|randomly|out of nowhere|not running|hours after|in class|after i stopped|once i stopped|after i finished)\b/,
  /\b(at rest|resting|sitting still|lying in bed|doing nothing|just sitting)\b.{0,30}\bheart (is |was |keeps )?(racing|pounding)\b/,
  /\bracing heart\b(?! rate)/,
  /\bfaint(ed|ing)?\b/,
  /\b(almost|nearly|about to|gonna|going to|thought i was gonna|felt like i was gonna) (faint|pass out|black out|passed out|blacked out)\b/,
  /\b(passed|blacked) out (during|after|at|on|in the middle of) (the |my |a |that )?(run|running|race|practice|workout|meet|track|mile|lap|rep|repeat|warm ?up|cool ?down|800|400|5k|interval)/,
  /\b(passed|blacked) out (while|when) (running|racing|warming|training)\b/,
  /\bvision (went|goes) (black|dark|gray|grey)\b/,
  /\bsaw stars\b/,
];

/* ------------------------------------------------------------------ */
/* Replies                                                             */
/* ------------------------------------------------------------------ */

/**
 * Names 988 (call OR text — their own copy says the line is for anyone who
 * "just needs someone to talk to") and Crisis Text Line. Both verified from the
 * organisations' own sites.
 *
 * No 911: police contact is a documented deterrent to disclosure by minors, and
 * 988 escalates when it needs to. No question mark — a question implies this app
 * is going to handle it. The limit is stated as a fact about the problem, not as
 * a disclaimer about the speaker.
 */
export const CRISIS_REPLY = `I'm really glad you told me that, and I'm not going to pretend I'm the right thing for it. This needs a person, not an app.

Please tell someone today — a parent, a teacher, an older sibling, any adult you trust. If saying it out loud is too much right now, you can call or text 988 any time, or text HOME to 741741. Both are free, both are open all night, and you can text instead of talking.

One thing worth saying plainly: "I'm not bad enough for this." There is no bar to clear. Wanting to talk is enough.`;

/**
 * Refuses the training question out loud and says why — a silent refusal reads
 * as either broken or judging. Adults are ranked by ease rather than authority,
 * and the coach is deliberately absent. Uses HOME to 741741: "text NEDA to
 * 741741" could not be verified and must not ship — NEDA shut its helpline in
 * June 2023, and Crisis Text Line's own eating-disorders page says CONNECT.
 */
export const PURGE_REPLY = `Thank you for telling me. I'm not going to give you training advice on top of that, because it wouldn't be the thing you actually need right now.

What you're describing is a medical thing, not a training thing, and it's one that gets harder to deal with the longer it goes on. Please tell someone — whoever is easiest, not whoever seems most official. A parent, your doctor, a school counselor, an older sibling. You do not need to have the right words ready. "Something's going on with eating and I need help" is enough.

If starting with a stranger is easier, you can text HOME to 741741 and there's a real person on the other end, free, any time.

Getting help early makes the biggest difference, and nobody is in trouble for this. I'm here for the running whenever you want it.`;

/**
 * Opens with the instruction rather than acknowledgement, so the shape itself
 * signals the tier. Hands over the exact phrase "chest symptoms during
 * exercise" — "exertional" is the word that separates "probably reflux" from a
 * real screen, and a 15-year-old will otherwise say "my chest felt weird".
 * Concedes the likely benign causes both before and after the escalation,
 * because anti-hiding is load-bearing here.
 */
export const CARDIAC_REPLY = `Stop running until an adult has heard about this. Not this week — today.

It is probably something ordinary. Asthma, dehydration, a chest cold and nerves all do this, and that is genuinely the most likely answer. But chest symptoms and fainting during exercise are the two things nobody in running gets to wait on, because the rare cause is the one you only get to catch once.

Tell a parent and your athletic trainer today, and use these words: "I've been having chest symptoms during exercise." That exact phrase matters — it's what tells a doctor to look at your heart rather than your stomach. If it's happening right now, or you fainted, that's an urgent care or emergency room today rather than an appointment next week.

Say it even if it has stopped and you feel fine now. Especially then.`;

export const DRUGS_REPLY = `I don't do medication, dosing, or supplements — not because it's a bad question, but because getting it wrong genuinely hurts people your age, and I can't see enough to answer it safely.

For anything you'd swallow, inhale, or rub on: a parent, your doctor, or the pharmacist at any drugstore. Pharmacists answer this exact question all day for free and you don't need an appointment. Never use someone else's prescription, including a sibling's inhaler.

One thing I will say straight: painkillers before a long run are not a neutral choice — they change how your kidneys handle a hard effort, and they hide the pain that tells you to stop. If you're reaching for them to get through a session, that's worth telling your trainer about instead.

Happy to help with the training side any time.`;

/**
 * Moved from chat.ts's `weight-body` intent, with three fixes. It no longer
 * opens by calling the athlete's own question one of the most dangerous
 * mistakes a young runner can make — the danger is relocated from asking to
 * under-fuelling. The referral no longer leads with the coach, who is a likely
 * source of the pressure. And the closing question mark is gone.
 */
export const WEIGHT_REPLY = `That's a fair question, and a really common one, so let me give you a straight answer.

Runners get faster by getting stronger and better fueled, not lighter. The dangerous part isn't asking — it's the under-fueling, and the evidence there is not subtle: it's a leading cause of stress fractures, stalled times, hormone problems and injuries that end careers. That's the IOC's RED-S consensus, not one coach's opinion. Your body cannot build the fitness you're training for out of a deficit.

If thoughts about food or weight are taking up real space in your head — or if this came from something somebody said to you — talk to a parent or your doctor first. Someone outside of running, who isn't scoring you. A coach can be a good person to tell too, but they're also the person whose expectations are already in your head, so they don't have to be first.

My job is to make you fast and healthy for years, and that road runs through eating enough. Tell me what you actually want to get faster at and let's work on that.`;

/**
 * Moved from chat.ts's `menstrual` intent, with three fixes. Low energy
 * availability stays the most likely explanation, but the uncertainty is now the
 * REASON to go rather than a hedge — amenorrhoea is a diagnosis of exclusion.
 * "It's fixable" is gone; nobody can promise that. And primary amenorrhoea — a
 * runner whose period never started — is now covered, which it wasn't.
 */
export const MENSTRUAL_REPLY = `Good question, and an important one.

Training on your period is fine. Energy dips around it are normal, so run those days by feel and don't read anything into one slower workout.

The part that genuinely matters for a runner: a period that gets irregular or stops is not a normal "fit athlete" sign. The most likely explanation is that you're not eating enough for your training — but it isn't the only one, and that's exactly why it's worth a real appointment rather than a guess. A doctor rules several other things out before landing on it. What isn't in doubt is that it weakens bone while it's happening, which is why it shows up in the research as part of RED-S and the female athlete triad, and why catching it early protects your skeleton and your seasons.

And if you've never had a period at all — you're 15 or older and it just hasn't started — that's the same conversation, not a different one. Worth raising even if nobody has ever asked you about it.

Talk to a parent and a doctor. Fueling enough is far more often the answer than training less.`;

/**
 * Shared escalation copy for symptom-shaped messages the intent engine doesn't
 * match. Names no condition, rules nothing out, and grants no permission to run
 * — the system may withhold permission, never grant it.
 */
export const SYMPTOM_ESCALATION = `I'd rather not guess at this one, because the questions that matter here are ones I can't ask you.

Today, treat it as a rest day. That costs you almost nothing at this point in a season, and it's the only call I can make that can't be wrong in a way that hurts you.

Tell your athletic trainer and a parent, and go sooner than "if it doesn't get better" if any of these are true: the pain is sharp, in one specific spot you can cover with a fingertip, on one side only, getting worse week to week, or waking you up at night or hurting when you're just sitting still. Same for swelling, numbness, a limp, or not being able to put weight on it.

When you tell them, say when it started, what makes it worse, and whether it warms up or worsens in the first ten minutes of a run. Those three things are most of what they need.

I'm still here for pacing, fueling, sleep and race plans in the meantime.`;

/* ------------------------------------------------------------------ */
/* The intercept                                                       */
/* ------------------------------------------------------------------ */

/**
 * Contexts that make a chest complaint a breathing problem rather than a heart
 * one. Cold-air bronchospasm is the single most common cause of "my chest gets
 * tight when I run" in high-school cross country, and sending that athlete to
 * urgent care is a regression, not a safety win — the `breathing` intent already
 * answers it correctly and names exercise-induced asthma.
 */
export const CARDIAC_EXCLUSIONS: RegExp[] = [
  /\b(cold|freezing|winter|frosty|chilly) (air|weather|out|outside|morning|day)\b/,
  /\bin the cold\b/,
  /\bwhen it'?s cold\b/,
  /\basthma|inhaler|wheez|allergies|pollen|hay fever\b/,
];

/**
 * Fuelling contexts where a calorie question is a fuelling question. "How many
 * calories should I eat before a race" must keep returning race-morning food,
 * not the eating-disorder referral.
 */
export const FUELLING_CONTEXT: RegExp[] = [
  /\b(before|pre-?)\s*(a |an |the |my )?(race|run|running|workout|practice|meet|long run|hard session)\b/,
  /\brace (morning|day)\b/,
  /\b(during|after)\s*(a |an |the |my )?(race|run|workout|long run)\b/,
  /\b(refuel|recovery meal|carb ?load|carbo.?load|fuel(ing)? for)\b/,
  /\bhow many calories (do i|am i) (burn|burning|using)\b/,
];

export type SafetyId = "crisis" | "purge" | "drugs";
export type SafetyHit = { id: SafetyId; reply: string };

const TIER_ONE: [SafetyId, RegExp[], string][] = [
  ["crisis", CRISIS, CRISIS_REPLY],
  ["purge", PURGE, PURGE_REPLY],
  ["drugs", DRUGS, DRUGS_REPLY],
];

export function anyMatch(text: string, patterns: RegExp[]): boolean {
  for (const re of patterns) if (re.test(text)) return true;
  return false;
}

/**
 * Ordered, first hit wins. Crisis before purge because a message can be both.
 *
 * Ordering is also the whole fix for the second live bug: "i made myself throw
 * up after practice" currently reaches `treadmill-weather` — whose unanchored
 * /ice/ matches "practICE" — and gets bad-weather advice. Running before
 * classify() removes that class of accident entirely for tier 1.
 */
export function safetyIntercept(q: string): SafetyHit | null {
  for (const form of normalise(q)) {
    for (const [id, patterns, reply] of TIER_ONE) {
      if (anyMatch(form, patterns)) return { id, reply };
    }
  }
  return null;
}

/** The reply for a tier-1 id, for re-emitting on a follow-up turn. */
export function replyFor(id: string): string | null {
  const found = TIER_ONE.find(([tierId]) => tierId === id);
  return found ? found[2] : null;
}
