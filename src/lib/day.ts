/**
 * Calendar-day handling, in the athlete's local timezone.
 *
 * Everything in RunGuard is keyed on a YYYY-MM-DD calendar day: check-ins,
 * soreness reports, injuries, daily load, the weekly plan. Deriving those with
 * `toISOString().slice(0, 10)` gives the *UTC* day, which for a team on US
 * Pacific time rolls over at 5pm local. An athlete checking in after evening
 * practice would have their soreness filed under tomorrow, and the risk engine
 * would look for "today" on a date the athlete never experienced.
 *
 * `localDay()` uses the local calendar date instead, so what the engine calls
 * today is the same day the coach and athlete see on the page.
 */

/** YYYY-MM-DD for the local calendar day containing `d`. */
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
