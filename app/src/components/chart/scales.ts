/**
 * Chart scales. Pure arithmetic — no React, no react-native, no tokens.
 *
 * This is the leaf of the chart system. `lib/chartData.ts` imports the
 * `ChartPoint` contract from here rather than from a component file precisely
 * because nothing in this module touches the UI layer: a data module must not
 * have to pull in React Native to know what shape it produces.
 *
 * ── The one thing to understand ────────────────────────────────────────────
 * There is no `reversed` flag anywhere in this system, and there must never be
 * one. A "reversed" axis is just a scale whose output runs the other way, and
 * `linearScale` already does that if you hand it a domain or a range in the
 * other order. `Plot` fixes the RANGE (top and bottom of the frame in pixels)
 * and takes its `domain` as `[value at the bottom, value at the top]`, so the
 * pace chart and the PR chart flip by passing `[max, min]` and nothing else in
 * the system needs to know they are unusual.
 */

/** A value on some axis → a pixel coordinate. */
export type Scale = (v: number) => number;

/**
 * One point in a series.
 *
 * `label` is a PRE-FORMATTED LOCAL STRING — "Tue 14 Oct", "Week of Mar 3".
 * Visual-spec non-negotiable #2 says a component displaying a date never
 * derives one, and this type is how that is enforced rather than remembered: a
 * primitive is never given an ISO date, so it *cannot* derive a label even by
 * accident. Labels are produced in `lib/chartData.ts` via `lib/dates.ts`.
 *
 * `value` distinguishes the two kinds of nothing that can occur inside a
 * series, and the distinction is the entire missing-point contract:
 *
 *   null → UNKNOWN. Nothing was recorded. Draws as a dashed hollow mark and
 *          breaks any line running through it.
 *   0    → a MEASURED ZERO. A fact. Draws as a solid stub on the baseline, in
 *          the same fill as every other bar.
 *
 * Collapsing those two is the single failure the visual spec exists to
 * prevent. Never write `value ?? 0`.
 */
export type ChartPoint = { label: string; value: number | null };

/**
 * Is this value unknown? THE single absence predicate for the whole chart
 * system — marks, gates and readouts all call this one function.
 *
 * It lives here, in the leaf, for the same reason `ChartPoint` does: this is
 * the module that defines what a point IS, so it is the module that defines
 * what a missing one is. `marks.tsx` decides whether to draw a bar or a dashed
 * mark with it, and `lib/chartData.ts` decides both whether there is enough
 * data to draw at all and what the readout says. If those ever used different
 * tests, a point could fall between them and get neither a bar nor a dashed
 * mark — a silent hole — or a chart could pass its "enough data" gate on rows
 * that every mark then draws as unknown. One predicate, no exceptions.
 *
 * It is deliberately wider than `=== null`, because the type is not a fence
 * across HTTP. `ChartPoint.value` is typed `number | null`, so `undefined`
 * should be impossible — but the type describes what the payload CLAIMS, and
 * `/api/mobile/me` ships a trimmed `series` whose rows are missing fields
 * `DailyPoint` declares. A point built from one arrives holding `undefined`
 * with nothing complaining, and `frame.y(undefined)` is `NaN`: a broken
 * picture rather than an honest gap. `NaN` itself is caught for the same
 * reason. All three mean the same thing to a reader — we don't know.
 *
 * NOTE: a MEASURED ZERO is not absent. `isAbsent(0) === false`, always. That
 * is the whole point — see the `ChartPoint` doc above. Never write `value ?? 0`.
 */
export function isAbsent(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(value);
}

/**
 * `domain[0]` → `range[0]`, `domain[1]` → `range[1]`, linearly, unclamped.
 *
 * A zero-width domain (every value identical) would divide by zero, so it
 * pins to the middle of the range — one flat line through the centre of the
 * frame, which is what a constant series honestly looks like.
 */
export function linearScale({
  domain,
  range,
}: {
  domain: [number, number];
  range: [number, number];
}): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (!Number.isFinite(span) || span === 0) {
    const mid = (r0 + r1) / 2;
    return () => mid;
  }
  const m = (r1 - r0) / span;
  return (v) => r0 + (v - d0) * m;
}

/** The 1 / 2 / 5 / 10 step at or above `span / count`. */
function niceStep(span: number, count: number): number {
  const raw = Math.abs(span) / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const mult = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return mult * mag;
}

/** Decimal places `step` needs, so ticks print as "0.8" and not "0.8000000001". */
function stepDecimals(step: number): number {
  return Math.max(0, Math.min(10, -Math.floor(Math.log10(step))));
}

/**
 * Round tick values inside `[min, max]`, roughly `count` of them.
 *
 * Order of `min` and `max` does not matter — ticks come back ascending, and it
 * is the scale, not the tick list, that knows which way up the axis is.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) return [lo];
  const step = niceStep(hi - lo, count);
  const dec = stepDecimals(step);
  const out: number[] = [];
  const first = Math.ceil(lo / step) * step;
  // The epsilon keeps the last tick from being dropped by float drift.
  for (let v = first; v <= hi + step * 1e-9; v += step) {
    out.push(Number(v.toFixed(dec)));
  }
  return out;
}

/**
 * A domain with breathing room above and below the data.
 *
 * Mirrors the website's `Math.max(8, (max - min) * 0.25)`
 * (`website/src/components/charts.tsx:274`, and `:375` at `(5, 0.3)` for PRs):
 * a percentage pad alone collapses to nothing when a series barely moves, and
 * a flat line pinned to the frame edge reads as an axis rather than as data.
 *
 * Returns ASCENDING `[low, high]`. A chart that wants small-is-up hands
 * `Plot` the pair reversed.
 */
export function paddedDomain(
  values: number[],
  pct = 0.25,
  floor = 8,
): [number, number] {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return [0, 1];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const pad = Math.max(floor, (max - min) * pct);
  return [min - pad, max + pad];
}

/**
 * `[0, top]` for a bar chart, `top` rounded up to a round number.
 *
 * Bars are read as areas, so their axis starts at zero — always, and not as a
 * per-chart decision. A truncated bar axis exaggerates every difference on it.
 */
export function zeroBasedDomain(values: number[], count = 4): [number, number] {
  const nums = values.filter((v) => Number.isFinite(v) && v > 0);
  if (nums.length === 0) return [0, 1];
  const max = Math.max(...nums);
  const step = niceStep(max, count);
  const dec = stepDecimals(step);
  return [0, Number((Math.ceil(max / step) * step).toFixed(dec))];
}
