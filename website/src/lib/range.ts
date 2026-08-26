/**
 * The dashboard time window, defined once.
 *
 * Both the server page and the client picker need this list, and they need it
 * to agree — an unrecognised `?range=` must land on the same default in both or
 * the select renders one thing while the numbers show another. Parsing lives
 * here for the same reason: a query string is user input, and `days` is used to
 * size a database window, so it is never read off the URL directly.
 */
export const RANGES = [
  { key: "1d", days: 1, label: "Last 24 hours", short: "24h" },
  { key: "3d", days: 3, label: "Last 3 days", short: "3d" },
  { key: "7d", days: 7, label: "Last 7 days", short: "7d" },
  { key: "1mo", days: 30, label: "Last month", short: "30d" },
  { key: "6mo", days: 182, label: "Last 6 months", short: "6mo" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];
export type Range = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeKey = "7d";

/** Never throws, never widens: anything unrecognised becomes the 7-day default. */
export function parseRange(raw: string | string[] | undefined): Range {
  const key = Array.isArray(raw) ? raw[0] : raw;
  return RANGES.find((r) => r.key === key) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;
}

/**
 * How far back to actually read.
 *
 * Two windows sit on top of each other: the range the coach picked, and the
 * equally long window before it that the "vs previous" delta compares against.
 * The extra 35 days cover the 28-day chronic baseline the risk engine builds
 * from the same array, so a short range never starves it — picking "Last 24
 * hours" must not silently make every ACWR blank.
 */
export function fetchDays(range: Range): number {
  return Math.max(130, range.days * 2 + 35);
}
