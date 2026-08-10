/**
 * Display units — RunGuard shows imperial (miles + min/mile).
 *
 * All internal math stays metric (kilometres, metres, seconds-per-km); these
 * helpers convert only at the display layer so the training science underneath
 * is untouched. (Pace formatting lives in engine.ts alongside fmtTime.)
 */

export const MI_PER_KM = 0.621371;
export const KM_PER_MI = 1.609344;
export const M_PER_MI = 1609.344;

/** Kilometres → miles (number). */
export function kmToMi(km: number): number {
  return km * MI_PER_KM;
}

/** Metres → miles (number). */
export function miFromMeters(m: number): number {
  return m / M_PER_MI;
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

/** Metres → "3.4 mi". */
export function fmtMilesFromMeters(m: number, digits = 1): string {
  return fmtMiles(m / 1000, digits);
}
