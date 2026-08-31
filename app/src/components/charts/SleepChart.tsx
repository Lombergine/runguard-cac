/**
 * Sleep — the last 30 nights, against the 8 h target.
 *
 * Mirrors the website's Recovery panel "Sleep — last 30 days" with its
 * "dashed line = 8h target" note (`website/src/components/athlete/
 * tabs.tsx:621-623`), drawn on this app's chart primitives.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE ONE THING NOT PORTED FROM THE WEBSITE
 *
 * `website/src/components/charts.tsx:343` is:
 *
 *     const pts = data.map((d) => ({ ...d, hours: d.hours ?? 0 }));
 *
 * That coerces a night the watch never recorded into a ZERO, and Recharts then
 * draws it as a bar at the floor of the axis. Read off the glass, a fortnight
 * the athlete simply did not wear the watch becomes a fortnight of "you slept
 * almost nothing" — a blank rendering as a value, which is the single failure
 * visual-spec non-negotiable #4 exists to prevent. `sleep30` is genuinely
 * sparse (`lib/types.ts:540`) and `SleepDay.hours` is independently nullable,
 * so this is the common case here, not an edge one.
 *
 * It is not ported, in two places, and neither should be "fixed" later:
 *
 *   1. `sleepSeries()` (`lib/chartData.ts:241`) keeps an unmeasured night as
 *      `value: null` and says so in its own comment.
 *   2. Here, at the marks below: `<Bars>` draws NOTHING for a null, and
 *      `<AbsentMarks>` draws the 12px dashed hollow rectangle in its place.
 *
 * So on a month with six recorded nights this is six bars and twenty-four
 * dashed marks — not thirty bars of which twenty-four sit on the floor.
 *
 * A MEASURED ZERO still draws: `<Bars>` floors a real reading at a solid 1.5px
 * stub in the series fill (`chart/marks.tsx:97`), so "recorded, and it was
 * nothing" and "never recorded" are two different objects in greyscale —
 * solid/filled/short versus dashed/hollow/tall.
 *
 * The readout follows the same rule: `sleepSeries().readout` returns
 * "Not recorded" for a null night, never "0 h" and never a bare dash.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── This component renders its own labelled group ──────────────────────────
 * Label and caption included, because the caption is a LEGEND for marks this
 * file draws and nothing else on the screen knows they exist. A caller drops it
 * in bare — `<SleepChart sleep30={profile.sleep30} />` — and must not wrap it
 * in a `Section` of its own.
 *
 * The head used to be a local panel title at `text.title` (19 display). It is
 * now the shared `Section`, which is what the design draws here and what every
 * other group on this screen already uses — a label above the card, not a title
 * inside it. Its rank is `text.micro`, not the design's 13px sans: see
 * docs/design-port.md, type 1.
 */
import { StyleSheet, Text } from "react-native";

import { Card } from "../Card";
import { Section } from "../Section";
import { AbsentMarks, Bars, RefLine } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import { ChartAbsent, Plot } from "../chart/Plot";
import { SLEEP_TARGET_H, sleepSeries } from "../../lib/chartData";
import type { SleepDay } from "../../lib/types";
import { space } from "../../theme/space";
import { color, staticColor } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/** The design's wording for this group. */
const LABEL = "Sleep · last 30 nights";

export type SleepChartProps = {
  /**
   * The last 30 metric ROWS, oldest first — **not** the last 30 nights.
   * `lib/types.ts:622-628`: `sleepTrend` is `metrics.slice(-30)`, so the span is
   * however long it took to accumulate 30 rows and the newest entry is the last
   * night RECORDED, not last night. Measured 2026-08-11: 2026-06-29 →
   * 2026-07-28.
   *
   * The panel title above IS honest about "last 30 nights" even so, and only
   * because of what happens next: `sleepSeries` densifies whatever arrives onto
   * a continuous local-day axis anchored on today, so the x axis really is the
   * last 30 nights and every night the array does not reach draws as a dashed
   * unknown. Take that densify away and the title becomes the exact label
   * `types.ts` forbids. Nothing here re-derives a day or a label.
   *
   * Optional on `Profile`, so `undefined` is an ordinary state and renders the
   * not-enough-data slot rather than throwing.
   */
  sleep30?: SleepDay[];
};

export function SleepChart({ sleep30 }: SleepChartProps) {
  /*
   * Deliberately NOT memoised, for the reason `MentalChart` states at its own
   * call: `sleepSeries(sleep30, now = new Date())` anchors BOTH the 30-night
   * window and every `dayLabel()` on the clock inside the call. A memo keyed on
   * `[sleep30]` would go on naming yesterday's nights — and go on ending the
   * window a day short — for as long as the app stayed mounted across midnight,
   * which breaks non-negotiable #2 in the one component whose whole subject is
   * which nights are missing. Thirty iterations is not a cost worth that; every
   * other chart in the app calls its series builder bare for the same reason.
   */
  const series = sleepSeries(sleep30);

  // Counted off the densified series, not off `sleep30`, so "not recorded"
  // means "no row on that day" as well as "a row with no hours in it".
  const missing = series.points.filter((p) => isAbsent(p.value)).length;
  const recorded = series.points.length - missing;

  if (!series.enough) {
    return (
      <Section label={LABEL} style={styles.section}>
        <Card>
          <ChartAbsent label={series.absentLabel} />
        </Card>
      </Section>
    );
  }

  return (
    <Section label={LABEL} style={styles.section}>
      <Card>
        <Plot
          data={series.points}
          domain={series.domain}
          ticks={series.ticks}
          tickFormat={series.tickFormat}
          unitLabel={series.unitLabel}
          readout={series.readout}
          accessibilityLabel={`Sleep over the last 30 nights, against an 8 hour target. ${recorded} nights recorded, ${missing} not recorded. Tap a night for its hours.`}
        >
          {(frame) => (
            <>
              {/* Behind the data — and in `muted`, NOT `RefLine`'s default.
                  That default is `color.ok` (`chart/marks.tsx:254`), the green
                  verdict token, which is what the website strokes its own 8 h
                  line with (the `<ReferenceLine y={8}>` in `charts.tsx`'s own
                  `SleepChart`). It does not survive the port, for the reason
                  `AcwrChart` spells out at length for the same mark:
                  tokens.ts carries the website's own rule for `ok` /
                  `watch` / `unusual` — "verdicts only, never chrome" — and the
                  visual spec says status colour is "semantic only, never
                  decorative, never on non-status elements". A green rule at 8 h
                  is a verdict painted on furniture: it says "8 h is good" in
                  the one colour the spec refuses the accent slot precisely
                  because "green reads 'good', and a blank must never read as
                  fine". On this chart of all charts — where most of the axis is
                  dashed unknowns — a green line is the thing those unknowns get
                  measured against. `muted` clears 4.5:1 on card, so the rule is
                  unmistakably a drawn line, and quieter than the bars. */}
              <RefLine
                frame={frame}
                value={SLEEP_TARGET_H}
                stroke={staticColor.muted}
              />
              {/* Real readings only. A null night draws no bar at all — see
                  the header: this is where the website's `hours ?? 0` would
                  have put a floor-height bar under a night nobody measured. */}
              <Bars frame={frame} data={series.points} />
              {/* And the night says so, in the app's one absence shape. */}
              <AbsentMarks frame={frame} data={series.points} />
            </>
          )}
        </Plot>
      </Card>
      {/*
        The design's caption, under the plot it describes.

        Its first sentence is CONDITIONAL, where the design prints both
        unconditionally. A legend for a mark that is not on screen is the
        inverse of the mistake this chart exists to avoid: it claims absence
        where there is none. On a fully recorded month the caption is the
        target sentence alone.

        The 8 h figure is a nested mono node, not a substring: every numeral in
        this app is mono and tabular with its unit welded on (non-negotiable
        #3), and a figure inside a body sentence is the easiest place to break
        that, because the sentence is a string until someone looks.

        The rule is dashed because it sits behind the data, not because it is
        unknown — a horizontal line spanning the frame at a value we chose,
        never the closed 12pt box an absence draws (chart/marks.tsx:236-242).
        The columns are the other way round, and the caption names both so the
        two dashes cannot be read as one thing.
      */}
      <Text style={styles.caption}>
        {missing > 0
          ? "Dashed columns are nights with no reading. The line is the "
          : "The line is the "}
        <Text style={styles.figure}>8 h</Text>
        {" target."}
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  /** `recovery.tsx`'s `styles.section` — the gap between label and content. */
  section: { gap: space.md },
  caption: { ...text.meta, color: color.muted },
  /**
   * A numeral nested in prose. Contributes ONLY the mono face and tabular
   * figures — size and colour are inherited from the caption around it.
   */
  figure: { fontFamily: font.mono, ...tabular },
});

export default SleepChart;
