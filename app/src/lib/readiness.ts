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
 * Both functions below read the SAME gate, so readiness and the flag can never
 * disagree about whether today is known. Per the spec the check-in is the gate,
 * not wearable data: sensors alone are not the athlete telling us how they are.
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
import type { Flag, Profile, ReadinessState } from "./types";

/**
 * The one gate. Everything derived from "has today been reported?" starts here.
 *
 * `academic_stress` is deliberately NOT counted: it is a circumstance, not a
 * report of how the athlete is, and readiness does not read it.
 */
export function checkedInToday(p: Profile): boolean {
  const c = p.todayCheckin;
  if (c === null) return false;
  return c.energy !== null || c.rpe !== null || c.motivation !== null;
}

export function readinessState(p: Profile): ReadinessState {
  return checkedInToday(p) ? { known: true, value: p.readiness } : { known: false };
}

/** `"unknown"` until the athlete has checked in; the server's flag after that. */
export function displayFlag(p: Profile): Flag {
  return checkedInToday(p) ? p.prePractice.flag : "unknown";
}
