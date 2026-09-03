/**
 * PR progression — one block per event, on the races screen.
 *
 * Renders `profile.races.prProgression` (`lib/types.ts:579`), a
 * `Record<event, PrPoint[]>` whose lists are improvements only, oldest first.
 * The series preparation is `prSeries` in `lib/chartData.ts`; nothing is
 * re-derived here.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THE X AXIS IS NOT A TIME AXIS
 *
 * PRs happen at irregular intervals, so a true time axis is the honest picture
 * in principle. It is not reachable from here, and that is a property of
 * `Plot`, not a preference:
 *
 *   `Plot` owns x. It computes `x(i) = padLeft + (i + 0.5) * step` and INVERTS
 *   that same arithmetic in `onPress` to turn a tap into an index
 *   (`Plot.tsx:190` and `:205`). It also draws the selection cursor at
 *   `frame.x(active)` and the two end labels at `padLeft` and `right`. There is
 *   no prop for an x scale.
 *
 * So positioning marks with a timestamp `linearScale` — which `scales.ts` is
 * general enough for — would move the dots and leave the tap mapping, the
 * cursor and the axis labels behind: you would tap a PR and the readout would
 * name a different day. That is a worse failure than even spacing, because it
 * breaks non-negotiable #2 at the exact moment the reader is trying to check a
 * date. A real time axis needs `Plot` to accept an `x` scale, which is a change
 * to a file four other charts share.
 *
 * With index spacing the elapsed time between PRs is NOT in the picture, so it
 * is put in words instead: every point's explicit local day is one tap away in
 * the readout, both ends of the axis are labelled, and the block's note says
 * outright that the spacing is not by date. A caption that states what the
 * geometry omits beats geometry that quietly implies the wrong thing.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY MOST EVENTS ARE A LIST, NOT A CHART
 *
 * The website draws a `PRChart` per event in a two-column grid
 * (`athlete/tabs.tsx:716`). On a phone those stack, and the seeded roster shows
 * what that costs: all 14 athletes have progression on all four events, but of
 * the 56 athlete-event pairs, 34 hold a single PR and 15 hold two. Four stacked
 * ~250pt panels, three of which are one dot or one diagonal, is a screen of
 * chrome wrapped around six numbers.
 *
 * A one-point line is not a progression, and a two-point line is two numbers
 * with a step between them — both are read faster as text. So a block becomes a
 * chart only at `MIN_PR_CHART_POINTS`, and below it the same PRs are listed in
 * the races screen's own result idiom: explicit local day, mono finishing time.
 * Nothing is dropped — every PR the payload carries is on screen either way,
 * which is the parity that matters.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * STEPS, NOT SLOPES
 *
 * `type="stepAfter"` on the website (`charts.tsx:389`), preserved here. A PR
 * HOLDS until it is beaten; a sloping segment would draw the athlete getting
 * steadily faster through months in which nothing was measured. `marks.tsx` has
 * no step mark and is owned by another agent, so `StepPath` is local. If a
 * second chart ever needs it, that is when it moves.
 *
 * This component owns its own `Card` — it renders a whole multi-event block,
 * not one plot. Do not wrap it in another.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ColorValue } from "react-native";
import { Polyline } from "react-native-svg";

import { Card } from "../Card";
import { Absent } from "../Nothing";
import { AbsentMarks, Dots } from "../chart/marks";
import { ChartAbsent, Frame, Plot } from "../chart/Plot";
import { ChartPoint, isAbsent } from "../chart/scales";
import { prSeries } from "../../lib/chartData";
import type { PrPoint } from "../../lib/types";
import { fmtDuration } from "../../lib/units";
import { layout, ruleWidth, space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

/**
 * PRs on an event before it is drawn rather than listed. Two points are two
 * numbers and a step between them; three is the first count at which the shape
 * of a progression exists. Deliberately NOT `MIN_PR_POINTS` from
 * `chartData.ts` — that one answers "is there anything to show at all" (one PR
 * is), and this one answers "is a picture the better way to show it".
 */
const MIN_PR_CHART_POINTS = 3;

/**
 * The comprehension hazard, stated. Same class of note as the pace chart's: a
 * reader who assumes up-is-more will read this chart exactly backwards.
 *
 * The second sentence is the x axis owning up to itself — see the header.
 */
const AXIS_NOTE =
  "Faster is higher — this axis runs backwards, from slowest at the bottom to fastest at the top. PRs sit evenly spaced, not by date; tap one for its day.";

/** The whole block has nothing in it. The website's label, minus the event. */
const NO_PRS = "No PRs logged yet.";

/** "4 PRs" — the numeral and its noun in ONE node, never a bare count. */
function countLabel(n: number): string {
  return `${n} ${n === 1 ? "PR" : "PRs"}`;
}

/* ------------------------------------------------------------------ *
 * The step mark
 * ------------------------------------------------------------------ */

/**
 * `stepAfter`: hold the value across to the next x, then jump to it.
 *
 * One polyline per adjacent pair, which breaks the line at any null exactly as
 * `LinePath` does — a step drawn through a hole would be the app asserting a PR
 * stood during a stretch it knows nothing about. A point with no neighbour to
 * step to still shows, because `Dots` draws every non-null point regardless.
 */
function StepPath({
  frame,
  data,
  stroke = color.brand,
}: {
  frame: Frame;
  data: ChartPoint[];
  stroke?: ColorValue;
}) {
  return (
    <>
      {data.map((p, i) => {
        const next = data[i + 1];
        if (isAbsent(p.value) || !next || isAbsent(next.value)) return null;
        const x0 = frame.x(i);
        const x1 = frame.x(i + 1);
        const y0 = frame.y(p.value as number);
        const y1 = frame.y(next.value as number);
        return (
          <Polyline
            key={i}
            points={`${x0},${y0} ${x1},${y0} ${x1},${y1}`}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * One event
 * ------------------------------------------------------------------ */

function EventBlock({ event, points }: { event: string; points: PrPoint[] }) {
  const s = prSeries(points, event);
  const n = s.points.length;

  const head = (
    <View style={styles.head}>
      <Text style={styles.event}>{event}</Text>
      {n > 0 ? <Text style={styles.count}>{countLabel(n)}</Text> : null}
    </View>
  );

  // No PRs on this event. The app's one dashed object, carrying `prSeries`'s
  // own sentence. Plain `Absent` rather than `ChartAbsent`: this block is never
  // going to become a chart, and reserving a plot's height for it would put a
  // 192pt hole beside two-line list rows. Same object either way — `ChartAbsent`
  // is this component in a height wrapper (Plot.tsx:349).
  if (!s.enough) {
    return (
      <View style={styles.block}>
        {head}
        <View style={styles.prRow}>
          <Absent label={s.absentLabel} />
        </View>
      </View>
    );
  }

  if (n < MIN_PR_CHART_POINTS) {
    return (
      <View style={styles.block}>
        {head}
        {s.points.map((p, i) =>
          // A PR with no usable time is ABSENT, and absent is the dashed
          // object — never a mono figure in a grey, which would still read as
          // a value. The day rides along as the eyebrow, exactly as the races
          // screen does for a prediction it cannot stand behind.
          isAbsent(p.value) ? (
            <View key={i} style={styles.prRow}>
              <Absent eyebrow={p.label} label="Time not recorded." />
            </View>
          ) : (
            <View key={i} style={styles.prRow}>
              {/* The explicit local day, pre-formatted by `chartData` — this
                  component never derives one. Non-negotiable #2. */}
              <Text style={styles.day}>{p.label}</Text>
              {/* Seconds are never rendered bare; `fmtDuration` makes m:ss. */}
              <Text style={styles.time}>{fmtDuration(p.value as number)}</Text>
            </View>
          ),
        )}
      </View>
    );
  }

  /** The value at `i` as words, for the assistive-tech sentence. */
  const say = (i: number) => {
    const v = s.points[i]?.value;
    return isAbsent(v) ? "a time that was not recorded" : fmtDuration(v as number);
  };

  return (
    <View style={styles.block}>
      {head}
      <Text style={styles.note}>{AXIS_NOTE}</Text>
      <Plot
        data={s.points}
        // `[slowest, fastest]`. The flip is the ORDER of this pair and nothing
        // else — there is no `reversed` flag in this system. See scales.ts.
        domain={s.domain}
        tickFormat={s.tickFormat}
        unitLabel={s.unitLabel}
        readout={s.readout}
        accessibilityLabel={`${event} PR progression. ${countLabel(n)}, from ${say(0)} on ${s.points[0].label} to ${say(n - 1)} on ${s.points[n - 1].label}. Faster times are higher — the time axis is inverted.`}
      >
        {(frame) => (
          <>
            <StepPath frame={frame} data={s.points} />
            <Dots frame={frame} data={s.points} />
            <AbsentMarks frame={frame} data={s.points} />
          </>
        )}
      </Plot>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The block
 * ------------------------------------------------------------------ */

export function PrChart({
  progression,
}: {
  /** Keyed by event, improvements only, oldest first. Optional on `Profile`. */
  progression?: Record<string, PrPoint[]>;
}) {
  const events = Object.entries(progression ?? {});

  // Undefined payload, or an athlete who has never raced. The chart system's
  // own absence, so this panel looks like every other chart panel with nothing
  // in it yet.
  if (events.length === 0) return <ChartAbsent label={NO_PRS} />;

  return (
    // One card holding every event, hairline-divided — the same shape the
    // races screen already uses for its history. Four separate cards would be
    // four separate shadows for one idea.
    <Card padded={false}>
      {events.map(([event, points], i) => (
        <View key={event} style={i > 0 ? styles.divided : undefined}>
          <EventBlock event={event} points={points} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { padding: layout.cardPadding },
  divided: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },

  /** The Panel row, one step down from the screen's section heading. */
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
  },
  event: { ...text.baseSemi, color: color.ink, flexShrink: 1 },
  /** Mono and tabular, because it is a numeral. */
  count: { ...text.micro, color: color.muted },
  note: { ...text.meta, color: color.muted, marginTop: space.xs, marginBottom: space.md },

  /** The races screen's result row: day above, mono time below. */
  prRow: { marginTop: space.md, gap: space.xs },
  day: { ...text.micro, color: color.muted },
  time: { ...text.stat, color: color.ink },
});
