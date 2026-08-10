/**
 * The body-part vocabulary. MIRRORS website/src/lib/bodyParts.ts.
 *
 * The two files must stay identical in their keys — `npm run check:bodyparts`
 * fails the build if they drift. They are duplicated rather than imported
 * because website/ and app/ are independent packages with no workspace between
 * them.
 *
 * WHY THIS EXISTS. Before it, the vocabulary was re-listed in three places:
 * AthleteModel's 19 regex regions, InjuryManager's 12-item PARTS, and
 * widgets' 10-item SORE_PARTS — the latter two carrying the same copy-pasted
 * "these match AthleteModel" comment while actually disagreeing (SORE_PARTS was
 * missing heel and groin). The body map lit up or stayed dark depending on
 * which form an entry came through.
 *
 * TWO STRING FORMATS, DELIBERATELY. Soreness rows are stored as "left shin"
 * and injury rows as "shin (left)". Both already exist in the database and
 * AthleteModel's regexes parse both, so this module preserves each rather than
 * migrating live data to one form. Use the formatter that matches the surface
 * you are writing to.
 */

export type BodyPart = {
  /** Stable key. Also the bare form used for non-lateral parts. */
  key: string;
  /** Human label for a picker. */
  label: string;
  /** Whether a side must be chosen before the entry is valid. */
  lateral: boolean;
};

export type Side = "left" | "right" | "both";

/**
 * The union of every part the two web pickers offered, ordered roughly
 * head-down the way a runner would scan for it.
 */
export const BODY_PARTS: readonly BodyPart[] = [
  { key: "shoulder", label: "Shoulder", lateral: true },
  { key: "lower back", label: "Lower back", lateral: false },
  { key: "hip", label: "Hip / IT band", lateral: true },
  { key: "groin", label: "Groin", lateral: false },
  { key: "quad", label: "Quad", lateral: true },
  { key: "hamstring", label: "Hamstring", lateral: true },
  { key: "knee", label: "Knee", lateral: true },
  { key: "calf", label: "Calf", lateral: true },
  { key: "shin", label: "Shin", lateral: true },
  { key: "achilles", label: "Achilles", lateral: true },
  { key: "heel", label: "Heel / plantar", lateral: true },
  { key: "foot", label: "Foot", lateral: true },
] as const;

/** Keys only — this is what the drift check compares. */
export const BODY_PART_KEYS: readonly string[] = BODY_PARTS.map((p) => p.key);

export function getBodyPart(key: string): BodyPart | undefined {
  return BODY_PARTS.find((p) => p.key === key);
}

/** Soreness storage format: "left shin", "both calf", "lower back". */
export function sorenessLabel(key: string, side: Side | null): string {
  const part = getBodyPart(key);
  if (!part?.lateral) return key;
  return side ? `${side} ${key}` : key;
}

/** Injury storage format: "shin (left)", "lower back". */
export function injuryLabel(key: string, side: Side | null): string {
  const part = getBodyPart(key);
  if (!part?.lateral) return key;
  return side ? `${key} (${side})` : key;
}
