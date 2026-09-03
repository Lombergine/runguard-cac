/**
 * The gate that stops a blank reading as a healthy value.
 *
 * `readinessScore()` in `website/src/lib/engine.ts` ALWAYS returns a number, and
 * with no check-in and no wearable data it returns **100** — a maximally
 * reassuring figure computed from nothing at all. `prePracticeFlag()` has the
 * same shape of problem: its no-data default is `"clear"`, so on the wire
 * "nothing stands out" and "we have not heard from this athlete" are the same
 * value.
 *
 * Everything derived from "has today been reported?" reads the ONE gate below,
 * so no two surfaces can disagree about whether today is known. Per the spec the
 * check-in is the gate, not wearable data: sensors alone are not the athlete
 * telling us how they are.
 *
 * `prePracticeFlag` is not surfaced in this app at all — it is a coach-facing
 * reading (see the header of `app/(tabs)/index.tsx`). If a screen ever does show
 * it, gate it on `checkedInToday` here rather than reading `prePractice.flag`
 * directly, or "we have not heard from this athlete" ships as "clear".
 *
 * Visual-spec non-negotiable #6: readiness with no check-in renders as `—` and
 * the word "unknown". Never `profile.readiness` directly, anywhere.
 *
 * ── WHY THE GATE IS NOT `todayCheckin !== null` ────────────────────────────
 * It was, and that was not enough. A `checkins` ROW EXISTING is not the same as
 * the athlete having said anything.
 *
 * `POST /api/checkin` upserts a checkins row on EVERY call, including a call
 * that only records soreness — and the website's own soreness picker
 * (`widgets.tsx:169`) posts `{sorenessPart, sorenessSeverity}` with no `energy`.
 * So an athlete who scores a sore knee in the browser creates a row whose `rpe`,
 * `energy` and `motivation` are all NULL, and this gate opened on it.
 *
 * Observed on the simulator, 2026-08-11: check-in row present with every
 * self-report column NULL, no wearable metrics, no runs in seven days — and the
 * home screen read **"Readiness 100/100 · Good to go"** above three tiles that
 * all said "Not recorded". `readinessScore()` starts `objective` at 100 and only
 * decrements on data it has, so with nothing to decrement it returns a perfect
 * score, and an empty row was enough to print it.
 *
 * The gate now asks whether the row CONTAINS a self-report. A soreness-only
 * write no longer unlocks the number, which is right on its own terms too: a
 * sore knee is not a report that you are ready.
 *
 * This narrows the symptom, not the cause. The cause is that readiness is not
 * nullable in the engine — see the vault note `readiness-is-100-from-nothing`,
 * still live on the web portal, which gates only on `hasActivityHistory`.
 */
import type { Profile, ReadinessState } from "./types";

/**
 * The one gate. Everything derived from "has today been reported?" starts here.
 *
 * `academic_stress` is deliberately NOT counted. It is a circumstance rather
 * than a report of how the athlete is, and a row carrying nothing but it is not
 * an answer to "how did you sleep?". Note that `readinessScore` DOES read it
 * (`website/src/lib/engine.ts:545`, −8 when set), so this gate is strictly
 * narrower than the score's own idea of "the athlete said something" — which is
 * the safe direction: it can withhold a number, never invent one.
 */
export function checkedInToday(p: Profile): boolean {
  const c = p.todayCheckin;
  if (c === null) return false;
  // `!= null`, NOT `!== null`: a declared field the route does not send arrives
  // `undefined` and typechecks clean, and `undefined !== null` is TRUE — which
  // would reopen this gate on exactly the empty row it exists to catch. The
  // shape is real on this wire: /api/mobile/home is cast to `Profile` and
  // already omits fields `Profile` declares required. Loose `!=` is false for
  // both null and undefined and still true for 0, so a genuine 0 counts.
  return c.energy != null || c.rpe != null || c.motivation != null;
}

/**
 * Did the sensors say anything the score could be built from?
 *
 * Mirrors `readinessScore`'s own `sensed` condition in the engine exactly —
 * the same three fields, the same OR:
 *
 *     const sensed =
 *       r.hrvDeltaPct !== null || r.restingHrDelta !== null || r.sleepAvg !== null;
 *
 * Deliberately NOT `recovery.hasData`: that is `metrics.length > 0` over a long
 * window, so it stays true for a watch that stopped syncing months ago — the
 * same never-goes-false shape as `hasActivityHistory`. Any ONE live reading is
 * enough for a partial objective score; none of them is no score.
 */
export function hasSensorData(p: Profile): boolean {
  const r = p.risk.recovery;
  return r.hrvDeltaPct !== null || r.restingHrDelta !== null || r.sleepAvg !== null;
}

/**
 * ── WHY THIS IS NOT `checkedInToday` ALONE ─────────────────────────────────
 * It was, and that was too strict in the other direction.
 *
 * `readinessScore` has two independent halves and each falls back to the other:
 *
 *     subjective === null ? objective ?? 100
 *                         : objective === null ? subjective : weighted(both)
 *
 * A number derived from NOTHING is exactly the `?? 100` branch — reached only
 * when the athlete has not self-reported AND no sensor read anything. An
 * athlete who skipped the check-in but whose watch synced has a real objective
 * score, and withholding it printed "Readiness — unknown until you check in"
 * directly above a Recovery block reading 7.9 h of sleep, 94 ms of HRV and a
 * resting heart rate of 48. Observed on the simulator, athlete 1. That is the
 * same contradiction this gate exists to prevent, pointed the other way.
 *
 * The empty case is unaffected: no check-in and no readings is still unknown.
 * `website/src/lib/readiness.ts` carries the identical condition — the two
 * surfaces read the same API and must not disagree about the same athlete.
 */
export function readinessState(p: Profile): ReadinessState {
  // The second half of the same guard. `readiness` is typed `number`, but if it
  // ever arrives missing or non-numeric, `readinessBand` compares with `<` —
  // and every comparison against NaN/undefined is false, so it falls through to
  // "recovered" and prints "Good to go" in green beside a numeral that is not a
  // number. Withholding is the only safe direction: the `known: false` arm
  // already renders "— unknown".
  const derivable = checkedInToday(p) || hasSensorData(p);
  return derivable && Number.isFinite(p.readiness)
    ? { known: true, value: p.readiness }
    : { known: false };
}

/**
 * Is the fitness model standing on anything?
 *
 * `risk.hasActivityHistory` looks like the right gate and is not. It is
 * `activities.length > 0` over a 400-day query (`website/src/lib/risk.ts:650`),
 * so for anyone who has ever run once it is permanently true — it never goes
 * false again. Ten call sites across this app trusted it to mean "these numbers
 * are founded".
 *
 * Meanwhile `computeFitness` (`website/src/lib/engine.ts:251`) falls back to a
 * bare `score = 50` whenever no week holds enough running and no VO2max exists.
 * 50 buckets to the tier **"Intermediate"**, and `trend` compares that score
 * against itself and reports **"plateau"**. `predictRaces` then takes the same
 * fabricated 50, so predicted times and race pacing inherit it.
 *
 * So one short run a year ago opens `hasActivityHistory` while the fallback is
 * still firing, and the athlete is told their tier, their trend and their
 * predicted 5K as plain labelled facts.
 *
 * `fitness.weekly` is the honest test: it is the season trend line, and it is
 * empty exactly when there was nothing to compute a score from. Use this for
 * anything derived from `fitness` — the score, the tier, the trend, the
 * predictions and the pacing that quotes them.
 *
 * This narrows the symptom. The cure is the engine saying whether it computed
 * or guessed, the way `hrmax.ts` already does with `{value, source, label}`.
 */
export function fitnessKnown(p: Profile): boolean {
  return (p.fitness?.weekly?.length ?? 0) > 0;
}
