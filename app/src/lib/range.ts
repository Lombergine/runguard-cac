/**
 * The coach's time window, defined once for the app.
 *
 * A DELIBERATE MIRROR of `website/src/lib/range.ts`, keys and all. The roster
 * endpoint takes `?range=` and parses it with the website's copy, so a key this
 * file invents that that file does not know would silently fall back to the
 * 7-day default — the picker would show one window and the numbers another.
 * Keeping the keys identical is what makes the two agree.
 *
 * WHY IT IS DUPLICATED RATHER THAN IMPORTED. `app/` never imports from
 * `website/`: they are separate packages with separate builds, and the app is
 * a plain HTTP client by design (see app/README.md). So the list is copied and
 * this comment is the link. If the website adds a range, add it here too.
 */

export const RANGES = [
  { key: "1d", days: 1, label: "24 hours", short: "24h" },
  { key: "3d", days: 3, label: "3 days", short: "3d" },
  { key: "7d", days: 7, label: "7 days", short: "7d" },
  { key: "1mo", days: 30, label: "1 month", short: "30d" },
  { key: "6mo", days: 182, label: "6 months", short: "6mo" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];
export type Range = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeKey = "7d";

/** Never throws, never widens: anything unrecognised becomes the default. */
export function parseRange(key: string | undefined): Range {
  return RANGES.find((r) => r.key === key) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;
}
