/**
 * Workload ratio — the product's central claim, drawn.
 *
 * This is the one chart the whole monitoring idea rests on, so it carries more
 * explanatory weight than any other panel on the stats screen: a title anyone
 * can read, one sentence saying what is being compared, and a note saying what
 * the marks on the picture mean. Everything numeric comes from
 * `lib/chartData.acwrSeries` — the domain, the ticks that label the band edges,
 * the readout and the "is there enough history" gate are all decided there and
 * only rendered here.
 *
 * ── The word "ACWR" appears nowhere on screen ──────────────────────────────
 * It is an epidemiologist's abbreviation, and the audience is fifteen. The
 * website's own tooltip already calls it "Workload ratio"
 * (`website/src/components/charts.tsx:112`), so that is the panel title on both
 * surfaces. The identifiers in this file are still `Acwr…` because the export
 * contract and `chartData` use that name; a code identifier is not a label.
 *
 * ── Non-negotiable #3: a ratio has no unit ─────────────────────────────────
 * A bare "1.24" next to a chart looks like it might be miles, or hours, or a
 * score out of something. It is a quotient of two loads and the units cancel,
 * so the panel note says so in words, `Plot` prints RATIO at the head of the y
 * axis, and `chartData`'s readout welds "workload ratio" onto the figure. Three
 * places, because this is the number most likely to be quoted out of context.
 *
 * ── Non-negotiable #5: the band describes, it does not instruct ────────────
 * The band and the 1.5 line are the interpretation. In prose they are past
 * tense and about the training, never second person imperative — no "reduce
 * your load", no "back off". There is no red fill, no warning triangle, and no
 * verdict token anywhere on the picture (see the colour note below).
 *
 * ── Why the caveat is not optional ─────────────────────────────────────────
 * `website/src/lib/risk.ts` gives the model (Williams et al. 2017 EWMA, sweet
 * spot 0.8–1.3, "risk rises sharply above 1.5") and, thirty lines further down,
 * the evidence against it: the Garmin-RUNSAFE cohort — 5,205 runners, 588,071
 * sessions, 1,311 overuse injuries — "found no association between injury and
 * either the acute:chronic workload ratio or week-to-week volume ratios", and
 * that cohort's mean age was 45.8, with "nothing equivalent shown in
 * adolescents". Drawing a threshold from a contested model without saying it is
 * contested would turn a monitoring signal into a diagnosis, which the root
 * CLAUDE.md forbids outright. So the caveat ships with the chart, in the panel,
 * not in a help screen nobody opens.
 */
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, Band, LinePath, RefLine } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import {
  ACWR_BAND,
  ACWR_DANGER,
  DAILY_DAYS,
  acwrSeries,
} from "../../lib/chartData";
import type { DailyPoint } from "../../lib/types";
import { layout, radius, ruleWidth, space } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/* ------------------------------------------------------------------ *
 * COLOUR — and the deliberate refusal of the status tokens
 *
 * The website fills the band with GOOD (green) and draws the 1.5 line in
 * CRITICAL (red). Neither survives the port, and not on taste grounds:
 *
 *   `ok` / `watch` / `unusual` are VERDICTS. tokens.ts quotes the website's own
 *   rule for them — "verdicts only, never chrome" — and the visual spec says
 *   status colour is "semantic only, never decorative, never on non-status
 *   elements". A band is a region of an axis, not a judgement about the
 *   athlete, and painting it `ok` would say "you are fine" in the one place the
 *   spec insists nothing may imply that. The spec is explicit that the accent
 *   is deliberately not green because "green reads 'good', and a blank must
 *   never read as fine"; a green band is that mistake with extra steps.
 *
 *   Red on 1.5 is worse. Non-negotiable #5 bans red fill outright, and a red
 *   threshold on a contested model is an alarm attached to a number that a
 *   5,205-runner cohort could not link to injury at all.
 *
 * So the band is neutral ink at a wash, and the reference line is `muted` — the
 * marks are furniture that says "here is where the band edges are", and the
 * words underneath do the interpreting. The data line keeps `LinePath`'s
 * default ember, which is the app's one accent and belongs on the thing the
 * panel is actually about.
 * ------------------------------------------------------------------ */

/**
 * Neutral ink at a wash. Lighter than `ruleSoft` (0.09) so the gridlines and
 * the data line both stay legible through it, dark enough to read as a shaded
 * region rather than a printing artefact.
 */
const BAND_FILL = color.ink;
const BAND_OPACITY = 0.06;

/**
 * The 1.5 rule. `muted` clears 4.5:1 on every surface here, so the dash is
 * unmistakably a drawn line, and it is quieter than the 2px ember data line —
 * which is the hierarchy `RefLine`'s own docblock asks for.
 */
const REF_STROKE = color.muted;

/* ------------------------------------------------------------------ *
 * Panel — the stats screen's information unit (`(tabs)/stats.tsx:107`): title
 * left, the caveat or the unit as a muted note right, then the content.
 *
 * Local, exactly as it is on that screen and for the reason stated there:
 * components/ is not this pass's to add to, and every value comes from a token,
 * so the panels cannot drift apart even though the code is not shared.
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

/**
 * `series` is `profile.risk.series` — the full-width copy that rides inside
 * `risk`, not the top-level `series` that `/api/mobile/me` trims. This chart
 * only reads `acwr`, which survives both, but taking the same leg as its
 * sibling `LoadChart` keeps one answer to "which series is the series".
 */
export function AcwrChart({ series }: { series?: DailyPoint[] }) {
  const s = acwrSeries(series);
  const recorded = s.points.filter((p) => !isAbsent(p.value)).length;

  return (
    <Panel
      title="Workload ratio"
      note={`last ${DAILY_DAYS} days · a ratio, so no unit`}
    >
      <Text style={styles.lede}>
        This compares how much you ran in the last week with how much you have
        been running over the last month, so 1.0 means the week looked like your
        normal.
      </Text>

      {s.enough ? (
        <>
          <Plot
            data={s.points}
            domain={s.domain}
            ticks={s.ticks}
            tickFormat={s.tickFormat}
            unitLabel={s.unitLabel}
            /* Names the explicit local day itself, from `points[i].label`. */
            readout={s.readout}
            accessibilityLabel={
              `Workload ratio over the last ${DAILY_DAYS} days. ` +
              `${recorded} days have a ratio and ${DAILY_DAYS - recorded} are ` +
              `not recorded. A shaded band runs from ${ACWR_BAND[0]} to ` +
              `${ACWR_BAND[1]}, and a dashed line marks ${ACWR_DANGER}.`
            }
          >
            {(frame) => (
              <>
                {/* Band and rule first, so they sit behind the reading. */}
                <Band
                  frame={frame}
                  from={ACWR_BAND[0]}
                  to={ACWR_BAND[1]}
                  fill={BAND_FILL}
                  opacity={BAND_OPACITY}
                />
                <RefLine
                  frame={frame}
                  value={ACWR_DANGER}
                  stroke={REF_STROKE}
                />
                {/* Breaks at every null rather than interpolating: a line drawn
                    through a day the engine could not compute would be the app
                    inventing a ratio. */}
                <LinePath frame={frame} data={s.points} />
                <AbsentMarks frame={frame} data={s.points} />
              </>
            )}
          </Plot>

          <Text style={styles.read}>
            Inside the shaded band — {ACWR_BAND[0]} to {ACWR_BAND[1]} — the
            training is ramping at its ordinary rate. Above the band, and above
            the dashed line at {ACWR_DANGER}, the last week was a bigger jump on
            the month behind it. Days with no ratio yet are dashed, and the line
            breaks across them.
          </Text>

          <Text style={styles.caveat}>
            The band and the {ACWR_DANGER} line come from one training-load
            model. A study of 5,205 runners found no link between this ratio and
            injury, and nothing like it has been tested on teenagers. RunGuard
            is describing your training here, not your health.
          </Text>
        </>
      ) : (
        /* The app's ordinary Absent, at the plot's exact height — "not enough
           data yet" is the unknown case, and looks like every other unknown. */
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

  /** What the picture is, before the picture. `ink2`, 6.4:1 on card. */
  lede: { ...text.meta, color: color.ink2, marginBottom: space.md },
  /** How to read the marks. Same weight as the lede — both are description. */
  read: { ...text.meta, color: color.ink2, marginTop: space.lg },
  /** The provenance caveat, one step quieter but still 4.5:1 on card. */
  caveat: { ...text.meta, color: color.muted, marginTop: space.sm },
});

export default AcwrChart;
