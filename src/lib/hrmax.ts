import { ActivityRow } from "./db";

/**
 * Maximum heart rate, per athlete.
 *
 * Intensity for every run is scored as a fraction of HRmax, so this single
 * number sits upstream of session load → ACWR, monotony, strain, freshness and
 * TRIMP. Assuming one value for a whole roster is the largest single source of
 * error in the engine: the same 170 bpm is comfortable for a runner with a
 * 205 max and near-threshold for one with a 185 max.
 *
 * There is no way to know it automatically for certain, so the athlete gets
 * several ways to set it and the app falls back sensibly:
 *
 *   manual      the athlete entered a figure they know          most trusted
 *   calibrated  measured from a guided maximal effort
 *   detected    read off their own workout history
 *   age         208 − 0.7 × age (Tanaka), from school grade
 *   default     200 bpm                                         last resort
 *
 * A stored choice (manual or calibrated) always wins. Otherwise resolution runs
 * detected → age → default. 200 is deliberately NOT the primary fallback: an
 * age estimate is defensible for any athlete whose grade we know, whereas 200
 * is just a number.
 */

export type HrMaxSource = "manual" | "calibrated" | "detected" | "age" | "default";

export type HrMaxResolution = {
  value: number;
  source: HrMaxSource;
  /** short human-readable explanation of where the number came from */
  label: string;
  /** how many sessions backed a "detected" value (0 otherwise) */
  sessions: number;
};

/** Absolute last resort, used only when there is no grade and no usable history. */
export const HR_MAX_DEFAULT = 200;

/** Plausible bounds for a high-school distance runner. Anything outside is a
 *  sensor artefact or a typo, not a heart rate. */
export const HR_MAX_MIN = 150;
export const HR_MAX_MAX = 225;

/** Sessions with a recorded max_hr needed before history is trusted. */
const MIN_SESSIONS_FOR_DETECTION = 10;

export const clampHrMax = (n: number) => Math.max(HR_MAX_MIN, Math.min(HR_MAX_MAX, Math.round(n)));

/** US high school: 9th grade ≈ 14, 12th ≈ 17. */
export function ageFromGrade(grade: number | null | undefined): number | null {
  if (grade == null || grade < 1 || grade > 12) return null;
  return grade + 5;
}

/** Tanaka et al. — better behaved than 220 − age, especially for the young. */
export function ageEstimatedHrMax(age: number): number {
  return clampHrMax(208 - 0.7 * age);
}

/**
 * Highest *credible* heart rate in the athlete's own history.
 *
 * Uses the 95th percentile of per-session peaks rather than the single highest
 * reading: wrist optical sensors throw occasional spikes tens of beats above
 * the truth, and one of those would permanently inflate HRmax — which would
 * quietly understate the intensity of every run the athlete ever does.
 * Returns null when there isn't enough history to be credible.
 */
export function detectHrMax(activities: ActivityRow[]): { value: number; sessions: number } | null {
  const peaks = activities
    .map((a) => a.max_hr)
    .filter((h): h is number => typeof h === "number" && h >= HR_MAX_MIN && h <= HR_MAX_MAX)
    .sort((a, b) => a - b);

  if (peaks.length < MIN_SESSIONS_FOR_DETECTION) return null;

  const idx = Math.min(peaks.length - 1, Math.floor(peaks.length * 0.95));
  return { value: clampHrMax(peaks[idx]), sessions: peaks.length };
}

export type HrMaxAthlete = {
  hr_max?: number | null;
  hr_max_source?: string | null;
  grade?: number | null;
};

/**
 * Resolve the HRmax to actually use, and say where it came from so the UI can
 * be honest about how much to trust it.
 */
export function resolveHrMax(
  athlete: HrMaxAthlete | null | undefined,
  activities: ActivityRow[] = []
): HrMaxResolution {
  // an explicit choice by the athlete beats anything we can infer
  const stored = athlete?.hr_max;
  const storedSource = athlete?.hr_max_source;
  if (
    typeof stored === "number" &&
    stored >= HR_MAX_MIN &&
    stored <= HR_MAX_MAX &&
    (storedSource === "manual" || storedSource === "calibrated")
  ) {
    return {
      value: clampHrMax(stored),
      source: storedSource,
      label:
        storedSource === "manual"
          ? "entered by the athlete"
          : "measured in a calibration effort",
      sessions: 0,
    };
  }

  const detected = detectHrMax(activities);
  if (detected) {
    return {
      value: detected.value,
      source: "detected",
      label: `read from ${detected.sessions} recorded workouts`,
      sessions: detected.sessions,
    };
  }

  const age = ageFromGrade(athlete?.grade ?? null);
  if (age !== null) {
    return {
      value: ageEstimatedHrMax(age),
      source: "age",
      label: `estimated from age ${age} (208 − 0.7 × age)`,
      sessions: 0,
    };
  }

  return {
    value: HR_MAX_DEFAULT,
    source: "default",
    label: "generic fallback — set a real value for better numbers",
    sessions: 0,
  };
}
