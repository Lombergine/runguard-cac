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

/**
 * A STORED body-part string, back to the part it names and the side it carries.
 *
 * The database stores what `sorenessLabel` and `injuryLabel` produce — "left
 * shin", "shin (left)" — not the bare `key`. So a screen holding a stored
 * string has no way to reach the display name without undoing one of those
 * formats, and two screens doing that separately is how they came apart:
 * Profile's injury list showed `hip (left)` while the Stats body scan showed
 * `Hip / IT band (left)`, for the same injury on the same day.
 *
 * The code meant to prevent that could not: `getBodyPart()` takes a `key` and a
 * stored string is not one, and `injuryLabel(key, null)` returns `key`
 * unchanged by construction, so the call looked like a conversion and was a
 * no-op. `npm run check:bodyparts` compares key lists between the app and the
 * website and cannot see a formatting disagreement inside the app at all.
 *
 * Rather than parse, this regenerates: every label the two formatters can
 * produce is compared against the stored string. That way the reader can never
 * drift from the writer — if a format changes, this follows it automatically.
 *
 * Returns null for a string outside the vocabulary. Free-text rows predate the
 * 12-part list and still exist; a caller must show them rather than drop them,
 * because a flagged injury that vanishes is worse than one shown plainly.
 */
export function parseStoredPart(
  raw: string,
): { part: BodyPart; side: Side | null } | null {
  const want = raw.trim().toLowerCase();
  const sides: readonly (Side | null)[] = ["left", "right", "both", null];
  for (const part of BODY_PARTS) {
    for (const side of sides) {
      if (
        sorenessLabel(part.key, side).toLowerCase() === want ||
        injuryLabel(part.key, side).toLowerCase() === want
      ) {
        // A side on a part that has none is noise; drop it.
        return { part, side: part.lateral ? side : null };
      }
    }
  }
  return null;
}

/** The display name for a stored string, or the string itself if unrecognised. */
export function storedPartLabel(raw: string): string {
  const hit = parseStoredPart(raw);
  if (!hit) return raw;
  return hit.side && hit.part.lateral
    ? `${hit.part.label} (${hit.side})`
    : hit.part.label;
}
