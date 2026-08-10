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
 * Both functions below read the SAME gate — `todayCheckin === null` — so
 * readiness and the flag can never disagree about whether today is known.
 * Per the spec the check-in is the gate, not wearable data: sensors alone are
 * not the athlete telling us how they are.
 *
 * Visual-spec non-negotiable #6: readiness with no check-in renders as `—` and
 * the word "unknown". Never `profile.readiness` directly, anywhere.
 */
import type { Flag, Profile, ReadinessState } from "./types";

/** The one gate. Everything derived from "has today been reported?" starts here. */
function checkedInToday(p: Profile): boolean {
  return p.todayCheckin !== null;
}

export function readinessState(p: Profile): ReadinessState {
  return checkedInToday(p) ? { known: true, value: p.readiness } : { known: false };
}

/** `"unknown"` until the athlete has checked in; the server's flag after that. */
export function displayFlag(p: Profile): Flag {
  return checkedInToday(p) ? p.prePractice.flag : "unknown";
}
