/**
 * Display units — the API ships KILOMETRES, the athlete reads MILES.
 *
 * Ported from `website/src/lib/units.ts` (plus `fmtTime`/`fmtPaceMi`, which live
 * in `website/src/lib/engine.ts`) so the two sides round identically.
 *
 * Visual-spec non-negotiable #3: units are welded to their numbers in a single
 * text node. Every distance and pace the UI shows comes out of this module with
 * the unit already attached — there is no supported way to get a bare numeral
 * and render "mi" somewhere else in the layout.
 *
 * PACE IS SPELLED "8:51/mi", WITH NO SPACE, to match `fmtPaceMi` in
 * website/src/lib/engine.ts:55. Some paces are formatted by the server and
 * printed verbatim (`PlanDay.targetPace`, the race pacing sentences) while
 * others are derived here from a duration and a distance, and the two land on
 * the same screen — the training tab shows both. One spelling, or the tab looks
 * like two apps.
 */

export const MI_PER_KM = 0.621371;
export const KM_PER_MI = 1.609344;
export const M_PER_MI = 1609.344;
/**
 * Exact by definition — the international foot is 0.3048 m exactly, so this is
 * not an approximation and does not need to agree with anything by luck.
 */
export const M_PER_FT = 0.3048;

/** Kilometres → miles (number). */
export function kmToMi(km: number): number {
  return km * MI_PER_KM;
}

/**
 * Metres → a rounded feet number. Elevation is the one figure the API sends in
 * metres and the interface shows in feet, and feet are whole: nobody climbs
 * 412.7 ft. The caller welds the "ft" on (activity/[id]'s `Metric`), so a
 * non-finite metre reading must be screened out there as `Absent` — this
 * returns a number and cannot express "not recorded".
 */
export function ftNumFromMeters(m: number): number {
  return Math.round(m / M_PER_FT);
}

/** Kilometres → a rounded miles number. */
export function miNum(km: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(km * MI_PER_KM * f) / f;
}

/** Metres → a rounded miles number. */
export function miNumFromMeters(m: number, digits = 1): number {
  return miNum(m / 1000, digits);
}

/** Kilometres → "3.4 mi". */
export function fmtMiles(km: number, digits = 1): string {
  return `${miNum(km, digits)} mi`;
}

/** Seconds → "38:12", or "1:04:30" past the hour. The run card's Time stat. */
export function fmtDuration(totalS: number): string {
  const s = Math.round(totalS);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * A run's duration and distance → "8:51/mi".
 *
 * Returns `null` when the pace does not exist (no distance, no duration, or a
 * non-finite input). A pace that was never run is ABSENT, and absent is its own
 * visual object — render `<Absent />`, never a fabricated "0:00/mi".
 */
export function fmtPaceMi(durationS: number, km: number): string | null {
  const mi = kmToMi(km);
  if (!Number.isFinite(mi) || !Number.isFinite(durationS) || mi <= 0 || durationS <= 0) {
    return null;
  }
  return `${fmtDuration(durationS / mi)}/mi`;
}

/**
 * A pace already expressed in seconds per KILOMETRE → "8:12/mi".
 *
 * The server's weekly pace trend (`paceSeason`) ships sec/km, and the website
 * converts it at the point of display with `pace * KM_PER_MI`
 * (`website/src/components/charts.tsx:300`). Same arithmetic here, so the two
 * surfaces never print different paces for the same week.
 *
 * Distinct from `fmtPaceMi`, which derives a pace from a run's duration and
 * distance. Null on a non-pace, for the same reason: a pace that does not
 * exist is ABSENT, and absent is its own visual object.
 */
export function fmtPaceMiFromKm(secPerKm: number): string | null {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  return `${fmtDuration(secPerKm * KM_PER_MI)}/mi`;
}

/* ------------------------------------------------------------------ *
 * Aliases for the component layer
 *
 * The `fmt*` names above are the ones the website uses, kept so the two sides
 * stay greppable together. The components import the spelled-out names; both
 * point at the same function so there is only ever one implementation.
 * ------------------------------------------------------------------ */

export const formatDistance = fmtMiles;
export const formatDuration = fmtDuration;
/** Nullable — see `fmtPaceMi`. Render `<Absent />` on null, never a stand-in. */
export const formatPace = fmtPaceMi;
/** Nullable — see `fmtPaceMiFromKm`. */
export const formatPaceFromKmPace = fmtPaceMiFromKm;
