import type { ColorValue } from "react-native";
/**
 * The marks. Stateless, all of them — they take a `Frame` and a `ChartPoint[]`
 * and return SVG. Every one of the eight charts is some combination of these
 * six, which is why there are no eight bespoke chart components.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE MISSING-POINT TREATMENT
 *
 * This is visual-spec non-negotiable #4 — "absent, zero and no-run are three
 * different visual objects, never collapse them" — carried inside a series,
 * and it is the highest-risk part of the whole chart system.
 *
 *   A MEASURED ZERO in a bar chart draws a SOLID 1.5px STUB on the baseline,
 *   in the bar's own fill. A zero-height bar renders as nothing at all, and
 *   "nothing at all" is what an unknown looks like. A fact must look like
 *   every other fact — same colour, same solidity — just short.
 *
 *   AN UNKNOWN draws NO BAR, and instead a 12px-tall DASHED OPEN RECTANGLE,
 *   no fill, 1.5px stroke in `color.unknown`, sitting on the baseline. Not a
 *   full-height dashed column: with half-empty sleep data that would be
 *   fifteen full-height dashes and the plot would be more hole than data.
 *   Twelve pixels is enough to be unmistakably an object and small enough to
 *   stay subordinate to the real readings.
 *
 *   A LINE BREAKS. `LinePath` splits the series into contiguous non-null runs
 *   and draws one polyline per run. It NEVER interpolates across a hole — a
 *   line drawn through a gap is the app inventing a reading. The same 12px
 *   dashed mark goes at each absent x, so "absent" is one recognisable object
 *   everywhere in the app rather than one thing in bars and another in lines.
 *
 * THE GREYSCALE TEST — the two states differ on three axes at once, exactly as
 * `Nothing.tsx` argues for its three components:
 *
 *   Zero    solid stroke · filled · SHORT, on the baseline · series colour
 *   Absent  dashed       · hollow · TALL (12px)            · `unknown` grey
 *
 * Desaturate and they are still two different objects. No colour is doing any
 * of that work.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY ONLY TWO OF THE THREE NOTHINGS APPEAR HERE
 *
 * There is no `NoRun` mark, and adding one later would be a mistake. A day
 * with no run is present in the payload with `load: 0` (`lib/types.ts:313`) —
 * that is a MEASURED zero and draws as the stub. Rest-day information (which
 * days were *scheduled* off) only exists for the current week in `plan.days`,
 * so across a 30-day window there is no way to tell a rest day from a day the
 * athlete skipped. Drawing "rest" where we only know "zero" would be the
 * inverse of the usual failure: an inference dressed as a record.
 * ══════════════════════════════════════════════════════════════════════════
 */
import { Circle, Line, Polyline, Rect } from "react-native-svg";

import { Frame } from "./Plot";
import { ChartPoint, isAbsent } from "./scales";
import { ruleWidth, space } from "../../theme/space";
import { color } from "../../theme/tokens";

/** Widest a bar ever gets, regardless of how few there are. */
const BAR_MAX = space.xl;
/** A measured zero. `ruleWidth` — the app's one line weight. */
const ZERO_STUB = ruleWidth;
/** Height of the dashed unknown mark. Subordinate to the data, not hidden. */
const ABSENT_HEIGHT = space.md;
/** The website's dash pattern for reference lines (`charts.tsx:100`). */
const DASH = "5 4";

/** Bar (and unknown-mark) width for a given category step. */
export function barWidth(step: number): number {
  return Math.max(2, Math.min(BAR_MAX, step * 0.7));
}

/* ------------------------------------------------------------------ *
 * Bars
 * ------------------------------------------------------------------ */

export function Bars({
  frame,
  data,
  fill = color.series1,
}: {
  frame: Frame;
  data: ChartPoint[];
  fill?: ColorValue;
}) {
  const w = barWidth(frame.step);
  return (
    <>
      {data.map((p, i) => {
        // Unknown: no bar. `AbsentMarks` draws the dashed mark instead.
        if (isAbsent(p.value)) return null;
        const yTop = frame.y(p.value as number);
        // A measured zero (or any value too small to see) keeps the stub. This
        // is the one place a bar's height is not proportional, and it is
        // deliberate: below 1.5px a fact would be indistinguishable from a
        // missing one, which is the failure the whole spec is about.
        const h = Math.max(ZERO_STUB, frame.bottom - yTop);
        return (
          <Rect
            key={i}
            x={frame.x(i) - w / 2}
            y={frame.bottom - h}
            width={w}
            height={h}
            fill={fill}
            rx={Math.min(3, w / 2)}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Line
 * ------------------------------------------------------------------ */

/*
 * `isAbsent` is imported from `./scales`, not defined here. It is the one
 * absence predicate for the whole chart system — `lib/chartData.ts` gates its
 * charts and writes its readouts with the same function these marks draw with,
 * so a gate can never say "enough data" about rows every mark then draws as
 * unknown. See its doc comment in scales.ts for why it is wider than `=== null`.
 */

/** Index ranges of contiguous known values. */
function runs(data: ChartPoint[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  data.forEach((p, i) => {
    if (isAbsent(p.value)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else {
      cur.push(i);
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

export function LinePath({
  frame,
  data,
  stroke = color.brand,
  width = 2,
}: {
  frame: Frame;
  data: ChartPoint[];
  stroke?: ColorValue;
  width?: number;
}) {
  return (
    <>
      {runs(data).map((run, k) =>
        run.length === 1 ? (
          // A lone reading between two holes has no segment to belong to. A
          // polyline of one point draws nothing at all, so the day would
          // silently vanish — it gets a dot instead.
          <Circle
            key={k}
            cx={frame.x(run[0])}
            cy={frame.y(data[run[0]].value as number)}
            r={2.5}
            fill={stroke}
          />
        ) : (
          <Polyline
            key={k}
            points={run
              .map((i) => `${frame.x(i)},${frame.y(data[i].value as number)}`)
              .join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth={width}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Dots — for a sparse series where each reading is itself the point
 * ------------------------------------------------------------------ */

export function Dots({
  frame,
  data,
  fill = color.brand,
  r = 3,
}: {
  frame: Frame;
  data: ChartPoint[];
  fill?: ColorValue;
  r?: number;
}) {
  return (
    <>
      {data.map((p, i) =>
        isAbsent(p.value) ? null : (
          <Circle key={i} cx={frame.x(i)} cy={frame.y(p.value as number)} r={r} fill={fill} />
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Band and reference line
 * ------------------------------------------------------------------ */

/** A shaded horizontal range — the workload chart's 0.8–1.3 sweet spot. */
export function Band({
  frame,
  from,
  to,
  fill = color.ok,
  opacity = 0.08,
}: {
  frame: Frame;
  from: number;
  to: number;
  fill?: ColorValue;
  opacity?: number;
}) {
  const a = frame.y(from);
  const b = frame.y(to);
  return (
    <Rect
      x={frame.left}
      y={Math.min(a, b)}
      width={Math.max(0, frame.right - frame.left)}
      height={Math.abs(b - a)}
      fill={fill}
      fillOpacity={opacity}
    />
  );
}

/**
 * A dashed horizontal reference — the 8h sleep target, the 1.5 danger line.
 *
 * Dashed here is not the "we don't know" dash: this is a line at a KNOWN
 * value, and it is dashed only to sit behind the data rather than compete with
 * it. The two never share a shape — the unknown mark is a closed 12px
 * rectangle on the baseline, never a rule spanning the frame.
 */
export function RefLine({
  frame,
  value,
  stroke = color.ok,
}: {
  frame: Frame;
  value: number;
  stroke?: ColorValue;
}) {
  const y = frame.y(value);
  return (
    <Line
      x1={frame.left}
      x2={frame.right}
      y1={y}
      y2={y}
      stroke={stroke}
      strokeWidth={ruleWidth}
      strokeDasharray={DASH}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Absent
 * ------------------------------------------------------------------ */

/**
 * The dashed hollow mark at every unknown x. Add this to EVERY series, bars or
 * line — an absence that draws nothing is an absence the reader mistakes for a
 * zero.
 */
export function AbsentMarks({
  frame,
  data,
}: {
  frame: Frame;
  data: ChartPoint[];
}) {
  const w = barWidth(frame.step);
  return (
    <>
      {/*
        `isAbsent`, not `p.value !== null` — the exact complement of the test
        `Bars` uses. If the two ever disagree, a point falls between them and
        gets NEITHER a bar nor a dashed mark: a silent hole in the plot, which
        is the one outcome worse than drawing the wrong thing. One predicate.
      */}
      {data.map((p, i) =>
        !isAbsent(p.value) ? null : (
          <Rect
            key={i}
            x={frame.x(i) - w / 2}
            y={frame.bottom - ABSENT_HEIGHT}
            width={w}
            height={ABSENT_HEIGHT}
            // No fill. Hollow is half the greyscale distinction; the other
            // half is the dash.
            fill="none"
            stroke={color.unknown}
            strokeWidth={ruleWidth}
            strokeDasharray={DASH}
          />
        ),
      )}
    </>
  );
}
