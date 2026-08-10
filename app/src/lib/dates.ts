/**
 * The only place a date is turned into words.
 *
 * Visual-spec non-negotiable #2: every date is explicit and local, and any
 * component displaying one takes a PRE-FORMATTED string as a prop — it never
 * derives one. Screens call this module; components do not.
 *
 * Two traps this module exists to avoid:
 *
 *  1. UTC drift. `new Date("2026-10-14")` parses as MIDNIGHT UTC, which is the
 *     13th in every US timezone, and `toISOString().slice(0,10)` files an
 *     evening run under tomorrow. The server had exactly this bug (see
 *     `website/src/lib/day.ts`). Everything here is local-calendar arithmetic.
 *  2. Bare relative labels. Nothing here returns "Today" on its own; the day is
 *     always spelled out.
 *
 * Month and weekday names are hardcoded English rather than
 * `toLocaleDateString`, because Hermes ships without full ICU on some builds and
 * a silently different string is worse than an explicit one.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** YYYY-MM-DD for the LOCAL calendar day containing `d`. Never UTC. */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for `n` days before the local day containing `d`. */
export function localDayOffset(n: number, d: Date = new Date()): string {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - n);
  return localDay(copy);
}

/**
 * "2026-10-14" → a Date at LOCAL midnight on that day.
 * Exported because a screen occasionally needs to compare or offset a server
 * day; do not use it to format — use the formatters below.
 */
export function parseLocalDay(iso: string): Date {
  const parts = iso.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** "2026-10-14" → "Tue 14 Oct". */
export function dayLabel(iso: string): string {
  const d = parseLocalDay(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "2026-10-14" → "TUE 14 OCT · BEFORE PRACTICE". The check-in card eyebrow. */
export function checkinHeader(iso: string): string {
  return `${dayLabel(iso).toUpperCase()} · BEFORE PRACTICE`;
}

/** A Date → "6:12am". Lowercase, no leading zero on the hour. */
export function timeLabel(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}${h24 < 12 ? "am" : "pm"}`;
}

/**
 * A Date → "Checked in 6:12am · Tue 14 Oct".
 * The one-line receipt the check-in card collapses into.
 */
export function receiptLabel(d: Date): string {
  return `Checked in ${timeLabel(d)} · ${dayLabel(localDay(d))}`;
}
