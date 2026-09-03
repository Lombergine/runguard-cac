/**
 * The gate that stops a blank reading as a healthy value — server side.
 *
 * This is the web port of `app/src/lib/readiness.ts`, which `engine.ts` already
 * names as "the reference" and which the app has enforced for some time. The
 * app's own header says the cure was still outstanding here:
 *
 *     "This narrows the symptom, not the cause. The cause is that readiness is
 *      not nullable in the engine — see the vault note
 *      `readiness-is-100-from-nothing`, still live on the web portal, which
 *      gates only on `hasActivityHistory`."
 *
 * ── WHAT GOES WRONG WITHOUT IT ─────────────────────────────────────────────
 * `readinessScore()` (engine.ts) always returns a number. Its own comment is
 * explicit that the no-data answer is meaningless and that callers must gate:
 *
 *     const combined = subjective === null ? objective ?? 100 : …
 *     // "With neither, the caller is holding a figure derived from nothing at
 *     //  all — every surface gates on `todayCheckin` before printing this"
 *
 * Observed on the seeded dev database, athlete 1: no check-in for 11 days, no
 * wearable readings, and the coach's athlete page drew a green **100** gauge
 * beside a subtitle that itself read "No data yet". The roster one click away
 * listed the same athlete as "no check-in · 11d". Two screens, same request,
 * opposite claims.
 *
 * ── WHY THE GATE IS NOT `todayCheckin !== null` ────────────────────────────
 * Carried over verbatim from the app, because the trap is identical here: a row
 * EXISTING is not the athlete having said anything. `POST /api/checkin` upserts
 * a row on every call, including a soreness-only write from the web picker,
 * which leaves `rpe`, `energy` and `motivation` all NULL. Gating on the row
 * would reopen the hole on exactly the empty row this exists to catch.
 *
 * `academic_stress` is deliberately NOT counted, matching the app: it is a
 * circumstance rather than a report of how the athlete is. `readinessScore`
 * does read it, so this gate is strictly NARROWER than the score's own idea of
 * "the athlete said something" — the safe direction, since it can only withhold
 * a number, never invent one.
 */
import type { CheckinRow } from "./db";

/** Only the fields the gate reads, so any caller shape can pass through. */
type Gated = {
  todayCheckin: CheckinRow | null;
  readiness: number;
  /** The three readings `readinessScore` actually consumes. */
  risk: {
    recovery: {
      hrvDeltaPct: number | null;
      restingHrDelta: number | null;
      sleepAvg: number | null;
    };
  };
};

/**
 * Did the sensors say anything the score could be built from?
 *
 * Mirrors `readinessScore`'s own `sensed` condition in engine.ts exactly —
 * the same three fields, the same OR:
 *
 *     const sensed =
 *       r.hrvDeltaPct !== null || r.restingHrDelta !== null || r.sleepAvg !== null;
 *
 * It is deliberately NOT `recovery.hasData`. That is `metrics.length > 0` over
 * a long window, so it stays true for a watch that stopped syncing months ago —
 * the same never-goes-false shape as `hasActivityHistory`. Any one live reading
 * is enough to compute a partial objective score; none of them is no score.
 */
export function hasSensorData(p: Gated): boolean {
  const r = p.risk.recovery;
  return r.hrvDeltaPct !== null || r.restingHrDelta !== null || r.sleepAvg !== null;
}

/**
 * Does this row contain an actual self-report?
 *
 * The single definition of "the athlete said something", so the roster, the
 * tiles and the detail page cannot disagree about it. A row EXISTING is not a
 * report — `POST /api/checkin` upserts one for a soreness-only write, leaving
 * all three of these NULL.
 *
 * `!= null`, NOT `!== null`: a field a route declares but does not send arrives
 * `undefined`, and `undefined !== null` is TRUE, which would open the gate on
 * exactly the empty row it exists to catch. Loose `!=` is false for both null
 * and undefined, and still true for a genuine 0.
 */
export function hasSelfReport(c: CheckinRow | null | undefined): boolean {
  if (c == null) return false;
  return c.energy != null || c.rpe != null || c.motivation != null;
}

/** The one gate. Everything derived from "has today been reported?" starts here. */
export function checkedInToday(p: Gated): boolean {
  return hasSelfReport(p.todayCheckin);
}

/**
 * Readiness, or an explicit absence. Never a number the athlete did not earn.
 *
 * `Number.isFinite` is the second half of the same guard: `readiness` is typed
 * `number`, but if it ever arrives NaN or missing, the band comparisons below
 * it are all `<`, every comparison against NaN is false, and it would fall
 * through to the healthiest band and print "Good to go" beside a non-number.
 */
export type ReadinessState = { known: true; value: number } | { known: false };

/**
 * ── WHY THIS IS NOT `checkedInToday` ALONE ─────────────────────────────────
 * It was, and that was too strict in the other direction.
 *
 * `readinessScore` has two independent halves and each falls back to the other:
 *
 *     subjective === null ? objective ?? 100
 *                         : objective === null ? subjective : weighted(both)
 *
 * So a number derived from NOTHING is exactly the `?? 100` branch — reached
 * only when the athlete has not self-reported AND no sensor read anything. An
 * athlete who skipped the check-in but whose watch synced sleep, HRV and
 * resting HR has a real objective score, and withholding it printed "Nothing
 * to go on yet" on a screen that was simultaneously displaying 7.9 h of sleep,
 * 94 ms of HRV and a resting heart rate of 48. That is the same contradiction
 * this gate exists to prevent, pointed the other way.
 *
 * Measured on the dev database, athlete 1: 298 activities, 34 check-ins, none
 * today, all three sensor readings present. Gated on `checkedInToday` the hero
 * said "Nothing to go on yet"; gated on the engine's own condition it reports
 * the objective score, which is what the tiles beside it were already showing.
 *
 * The empty case is unaffected — no check-in and no readings is still unknown.
 */
export function readinessState(p: Gated): ReadinessState {
  const derivable = checkedInToday(p) || hasSensorData(p);
  return derivable && Number.isFinite(p.readiness)
    ? { known: true, value: p.readiness }
    : { known: false };
}

/**
 * The band a readiness falls in, or "unknown" when there is nothing to band.
 *
 * Lives here rather than at the two call sites because it was duplicated as an
 * inline ternary on both the athlete portal and the coach's athlete page:
 *
 *     zone={p.readiness < 40 ? "high" : p.readiness < 65 ? "caution" : "ready"}
 *
 * Written that way it reads the raw engine number, so no-data (100) landed in
 * "ready" and tinted the body scan green. Two copies also meant the thresholds
 * could drift apart silently — one definition, one place to change them.
 *
 * The bounds match `verdictFor` below and the gauge bands in `tabs.tsx`: under
 * 40 is "high", under 65 is "caution".
 */
export type ReadinessZone = "ready" | "caution" | "high" | "unknown";

export function readinessZone(s: ReadinessState): ReadinessZone {
  if (!s.known) return "unknown";
  return s.value < 40 ? "high" : s.value < 65 ? "caution" : "ready";
}

/**
 * The sentence a reader sees beside the number, or null when unknown.
 *
 * Returns null rather than a fourth string so a caller cannot accidentally
 * print a verdict for an athlete who has not reported: there is no phrasing of
 * "we don't know" that belongs in the same slot as "Good to go", because that
 * slot is styled as a verdict — bold, coloured, and read as a decision.
 */
export function verdictFor(s: ReadinessState): string | null {
  if (!s.known) return null;
  return s.value >= 65 ? "Good to go" : s.value >= 40 ? "Train with care" : "Take it easy today";
}
