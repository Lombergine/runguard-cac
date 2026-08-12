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
 * ── This component renders its own panel head ──────────────────────────────
 * Title and note included, because the note is a LEGEND for marks this file
 * draws and nothing else on the screen knows they exist. A caller drops it in
 * bare — `<SleepChart sleep30={profile.sleep30} />` — and must not add a
 * heading of its own.
 */
import { StyleSheet, Text, View } from "react-native";

import { Card } from "../Card";
import { AbsentMarks, Bars, RefLine } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import { ChartAbsent, Plot } from "../chart/Plot";
import { SLEEP_TARGET_H, sleepSeries } from "../../lib/chartData";
import type { SleepDay } from "../../lib/types";
import { space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

export type SleepChartProps = {
  /**
   * Last 30 nights, oldest first and SPARSE — optional on `Profile`, so
   * `undefined` is an ordinary state and renders the not-enough-data slot
   * rather than throwing. `sleepSeries` densifies whatever arrives onto a
   * continuous local-day axis; nothing here re-derives a day or a label.
   */
  sleep30?: SleepDay[];
};

/** Panel head, matching `recovery.tsx`'s local `SectionHeading` exactly. */
function Head({ note }: { note?: string }) {
  return (
    <View style={styles.head}>
      <Text style={styles.title}>Sleep — last 30 nights</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

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
      <View style={styles.section}>
        <Head />
        <Card>
          <ChartAbsent label={series.absentLabel} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* The website's note, with "8 h" welded (non-negotiable #3). The rule is
          dashed because it sits behind the data, not because it is unknown —
          it is a horizontal line spanning the frame at a value we chose, never
          the closed 12px box an absence draws (`chart/marks.tsx:236-242`). */}
      <Head note="dashed rule = 8 h target" />
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
              {/* Behind the data. */}
              <RefLine frame={frame} value={SLEEP_TARGET_H} />
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
      {/* Named only when there is something to name. A legend for a mark that
          is not on screen would be the inverse mistake: claiming absence where
          there is none. */}
      {missing > 0 ? (
        <Text style={styles.legend}>
          The dashed boxes are nights nothing was recorded — not nights of no
          sleep.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** `recovery.tsx`'s `styles.section` — the gap between head and content. */
  section: { gap: space.md },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted, flexShrink: 1 },
  legend: { ...text.meta, color: color.muted },
});

export default SleepChart;
