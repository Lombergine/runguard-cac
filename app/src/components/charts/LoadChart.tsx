/**
 * Training load — one bar per day, with the two averages the workload ratio is
 * actually made of drawn over them.
 *
 * Everything numeric comes from `lib/chartData.loadSeries`: the bars, both EWMA
 * series, the shared zero-based domain, the readout and the "is there enough"
 * gate. This file draws them and says what they are.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE SERIES TRAP
 *
 * `series` here is `profile.risk.series` and it CANNOT be the top-level
 * `profile.series`. `/api/mobile/me` ships the top-level copy as
 * `.slice(-60).map(({date, load, km, acwr}) => …)` — `acute` and `chronic` are
 * dropped on the floor. Fed that, `loadSeries` still typechecks and still
 * returns `acute` and `chronic` arrays; every value in them is `undefined`.
 *
 * WHAT THAT USED TO DO, AND WHAT IT DOES NOW. This block previously described
 * a NaN failure — `undefined` is not `null`, so `runs()` treated those days as
 * present and `frame.y(undefined)` produced `NaN,NaN` polylines. That is no
 * longer true, in two places: `chartData.ts:386,390` coalesce with `?? null`,
 * and `marks.tsx:131` splits on `isAbsent`, which catches `undefined` and `NaN`
 * as well as `null` (`scales.ts:69-71`). Both layers were hardened; do not go
 * hunting for NaN polylines, there are none.
 *
 * THE HAZARD IS NOT GONE, IT CHANGED SHAPE, AND THIS PANEL DOES NOT YET GUARD
 * THE NEW ONE. Fed the trimmed copy today: the bars draw correctly, and both
 * `LinePath`s render NOTHING AT ALL — every value is null, so `runs()` returns
 * `[]` and emits no polyline. Nothing on screen says so. `AbsentMarks` below is
 * drawn on `s.points` alone, and those are all present, so not one dashed mark
 * appears; meanwhile the key still lists "acute · 7 days" and "chronic · 28
 * days", the sentence under it still says "When the 7-day line sits above the
 * 28-day one…", and the assistive label still promises "the 7-day and 28-day
 * averages drawn over it". Two lines silently missing underneath a legend, a
 * sentence and a spoken description that all assert they are there — an absence
 * that draws nothing, which is what `marks.tsx:280` warns is the absence a
 * reader mistakes for a zero. It is unreachable from the current call site
 * (`(tabs)/stats.tsx` passes `risk.series`), which is the only reason this is a
 * note and not a guard. If this component ever grows a second call site, gate
 * each key item and the sentence on its series having at least one non-absent
 * point — `isAbsent` is already imported below.
 *
 * `lib/types.ts` says the same thing on `risk.series` ("this one rides inside
 * `risk` at full width"), and `chartData`'s `loadSeries` docblock says it a
 * third time. Verified against the live payload rather than taken on trust: for
 * every athlete in the roster `risk.series` is 120 days long with `acute` and
 * `chronic` populated on all 120, and the trimmed top-level copy carries the
 * keys `date, load, km, acwr` and nothing else.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── A ZERO-LOAD DAY IS A FACT ──────────────────────────────────────────────
 * `lib/types.ts` is explicit that a day with no run is present in the payload
 * with `load: 0`, and that only a day genuinely MISSING from the array is
 * unknown. So a rest day draws as the solid stub on the baseline that `Bars`
 * gives every measured zero, in the bars' own fill — never as the dashed
 * hollow mark, and never as nothing at all. On a real 30-day window that is
 * roughly half the picture, which is why the panel says so in words as well as
 * in shape.
 */
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, Bars, LinePath } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import { DAILY_DAYS, loadSeries } from "../../lib/chartData";
import type { DailyPoint } from "../../lib/types";
import { layout, radius, ruleWidth, space } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/* ------------------------------------------------------------------ *
 * COLOUR
 *
 * Three objects, three fills, and none of them a status token: `ok` / `watch` /
 * `unusual` are verdicts, and a daily record is not a verdict.
 * ------------------------------------------------------------------ */

/** The 7-day average. The ember signature, because it is the line about now. */
const ACUTE = color.brand;
/** The 28-day average. The website's own second series colour. */
const CHRONIC = color.series1;
/**
 * The daily bars.
 *
 * NOT `Bars`' default `series1` — that is the chronic line's colour here, and
 * NOT the website's `rgba(34,29,21,0.30)` translucent ink either, for a reason
 * specific to the zero rule above. That value lands around #BEBBB8 on a white
 * card; a MEASURED ZERO draws as a 1.5px stub sitting directly on a baseline
 * already drawn in #D8D0C0, so at that lightness a real recorded rest day
 * would visually merge into the axis and read as nothing at all — a fact
 * disappearing, which is the one failure the whole spec exists to prevent.
 *
 * `ink2` is the app's secondary ink for real content. It is unambiguously
 * darker than the baseline AND darker than `unknown` (#6F675C), so a measured
 * zero can be mistaken for neither the axis nor an absence. The two averages
 * are drawn after the bars and in saturated colour, so they still read as the
 * layer on top.
 */
const BAR = color.ok;

/* ------------------------------------------------------------------ *
 * Panel — the stats screen's information unit (`(tabs)/stats.tsx:107`). Local
 * for the reason given there; every value is a token, so the panels cannot
 * drift apart even though the code is not shared.
 * ------------------------------------------------------------------ */

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {note ? <Text style={styles.panelNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function LoadChart({
  series,
  windowDays,
}: {
  series?: DailyPoint[];
  /** Optional. Omitted, the chart keeps its own fixed window — see chartData. */
  windowDays?: number;
}) {
  // See AcwrChart: the note must describe the window actually plotted.
  const shownDays = windowDays ?? DAILY_DAYS;
  const s = loadSeries(series, new Date(), windowDays);
  const recorded = s.points.filter((p) => !isAbsent(p.value)).length;

  return (
    <Panel title="Training load" note={`last ${shownDays} days`}>
      <Text style={styles.lede}>
        Each bar is one day&apos;s training load — how long you ran multiplied by
        how hard it was, with the effort estimated from your heart rate, or from
        your pace on a run that has none.
      </Text>

      {s.enough ? (
        <>
          <Plot
            data={s.points}
            domain={s.domain}
            tickFormat={s.tickFormat}
            unitLabel={s.unitLabel}
            /* Prints all three figures for the tapped day — "412 load · 380
               acute · 121 chronic" — and `Plot` names the explicit local day
               beneath it. The two jargon words are what the key below decodes. */
            readout={s.readout}
            accessibilityLabel={
              `Daily training load over the last ${shownDays} days, with the ` +
              `7-day and 28-day averages drawn over it. ${recorded} days are ` +
              `recorded and ${DAILY_DAYS - recorded} are not.`
            }
          >
            {(frame) => (
              <>
                <Bars frame={frame} data={s.points} fill={BAR} />
                {/* Chronic under acute: the slow line is the reference the
                    fast one is read against. Both break at nulls rather than
                    interpolating. */}
                <LinePath frame={frame} data={s.chronic} stroke={CHRONIC} />
                <LinePath frame={frame} data={s.acute} stroke={ACUTE} />
                {/* ONCE, not three times. All three series are built from the
                    same `d.row` in `loadSeries`, so they are null on exactly
                    the same days; drawing absent marks per series would stack
                    three identical dashed rectangles on each hole. */}
                <AbsentMarks frame={frame} data={s.points} />
              </>
            )}
          </Plot>

          {/*
            THE LEGEND, AND WHY THERE IS ONE AT ALL

            The website carries three items (`charts.tsx:200-216`). Two of them
            are gone and one had to stay.

            "Daily load" is dropped: the bars are the subject of the panel's own
            title and first sentence, so a swatch repeating it is pure chrome on
            a 360pt screen.

            The two lines could NOT be left to the readout. The readout does
            print both figures, and on a day where they differ you can match
            them to the axis — but where the lines cross, the two numbers are
            nearly equal and the match is ambiguous in exactly the moment the
            picture is making its claim, so a reader could take "the week is
            heavier than the month" for its inverse. Worse, the readout string
            comes from `chartData` and uses the words "acute" and "chronic":
            without this key those two words appear on screen defined by
            nothing. Two items, short enough to sit on one line inside the 288pt
            of card content a 360pt screen leaves (and `flexWrap` takes them to
            two rows under Dynamic Type rather than clipping), decoding the
            readout rather than restating the picture.
          */}
          <View style={styles.key}>
            <View style={styles.keyItem}>
              <View style={[styles.keyLine, { backgroundColor: ACUTE }]} />
              <Text style={styles.keyLabel}>acute · 7 days</Text>
            </View>
            <View style={styles.keyItem}>
              <View style={[styles.keyLine, { backgroundColor: CHRONIC }]} />
              <Text style={styles.keyLabel}>chronic · 28 days</Text>
            </View>
          </View>

          <Text style={styles.read}>
            When the 7-day line sits above the 28-day one, the last week has
            been heavier than the month behind it.
          </Text>

          <Text style={styles.caveat}>
            A day you did not run is a real zero and draws as a flat stub on the
            baseline. A day with nothing recorded at all draws dashed instead,
            and both lines break across it.
          </Text>
        </>
      ) : (
        <ChartAbsent label={s.absentLabel} />
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.md,
  },
  panelTitle: { ...text.baseSemi, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },

  lede: { ...text.meta, color: color.ink2, marginBottom: space.md },
  read: { ...text.meta, color: color.ink2, marginTop: space.md },
  caveat: { ...text.meta, color: color.muted, marginTop: space.sm },

  /* ── The two-line key ──────────────────────────────────────────────
     Same construction as the HR-zone legend on the stats screen: a coloured
     swatch carrying the colour, and the label in ink2. The word never wears
     the series colour — `brand` is 2.01:1 and takes no glyph, and rationing
     colour to the shape is what keeps the panel from looking decorated. */
  key: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: space.lg,
  },
  keyItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  /** A line, not a square: it stands for a stroke. */
  keyLine: { width: space.xl, height: ruleWidth },
  /** Body, not mono: it is a phrase that happens to contain a numeral. */
  keyLabel: { ...text.meta, color: color.ink2 },
});

export default LoadChart;
