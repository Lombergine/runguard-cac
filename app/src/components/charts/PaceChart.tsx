/**
 * Weekly average pace — a line on an INVERTED axis, so up = faster.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TWO THINGS THIS CHART EXISTS TO GET RIGHT
 *
 * 1. THE AXIS IS UPSIDE DOWN, AND THE PANEL SAYS SO.
 *
 *    Pace is a duration: a SMALLER number is a BETTER run. Plotted the ordinary
 *    way, a season of improvement draws as a line falling off a cliff. So the
 *    axis is flipped — and it is flipped by ORDER, not by a flag: `paceSeries`
 *    hands over `domain: [slowest, fastest]` and `Plot` maps `domain[0]` to the
 *    bottom of the frame. There is no `reversed` prop in this system and there
 *    must never be one (`components/chart/scales.ts`).
 *
 *    An inverted axis is a genuine comprehension hazard — it is the one chart
 *    in the app where reading the picture the obvious way gives you the
 *    opposite of the truth. So the caption is not optional and it is not a
 *    legend: the panel note reads "up = faster", welded to the title, in the
 *    same slot every other panel puts its caveat. The website says the same
 *    three words in the same place (`athlete/tabs.tsx:477`), and the assistive
 *    description below spells the inversion out in a sentence, because a
 *    screen-reader user never sees the note or the axis.
 *
 * 2. A MISSING WEEK IS NOT A SLOW WEEK.
 *
 *    `pace` is null for a week with no qualifying run — the server only
 *    computes one from runs of 2 km or more totalling over 3 km
 *    (`website/src/lib/athleteView.ts:32`). The website drops those weeks from
 *    the array entirely (`charts.tsx:268`), which silently closes the gap and
 *    draws a twelve-week season across however many weeks were actually run.
 *    Here they survive as nulls: `LinePath` splits at each one and draws no
 *    segment across it, and `AbsentMarks` puts the app's dashed hollow mark on
 *    the axis where the week was. A line drawn through a hole is the app
 *    inventing a pace the athlete never ran; a hole drawn as nothing at all is
 *    a week the reader never learns is missing.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── The readout spelling ───────────────────────────────────────────────────
 * Pace is spelled "8:51/mi" with no space, everywhere, matching `fmtPaceMi` on
 * the server (`lib/units.ts` says why: some paces on a screen are formatted by
 * the server and printed verbatim, and one screen must not show two spellings).
 * So the readout is formatted here with `fmtPaceMiFromKm`, from the SECONDS PER
 * KILOMETRE this component was handed, rather than taken from the prep's own
 * phrase. The y ticks stay bare "8:51": `Plot` prints the unit once at the head
 * of the axis (non-negotiable #3 is satisfied by `unitLabel` plus the welded
 * readout), and repeating "/mi" down the axis would cost three mono characters
 * of plot width on a 360pt screen without telling the reader anything the note
 * has not already told them.
 */

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, Dots, LinePath } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import { paceSeries } from "../../lib/chartData";
import type { Profile } from "../../lib/types";
import { fmtPaceMiFromKm } from "../../lib/units";
import { Panel } from "../Panel";


/** The caption for the inverted axis. Not optional — see the header. */
const UP_IS_FASTER = "up = faster";

/**
 * `paceSeason` is optional on `Profile` like every other `/me` leg, and the
 * type is taken from there rather than restated. An undefined leg renders the
 * not-enough-data state, never an empty axis — a flat line is a claim.
 */
export function PaceChart({ paceSeason }: { paceSeason?: Profile["paceSeason"] }) {
  const s = paceSeries(paceSeason);

  if (!s.enough) {
    return (
      <Panel title="Pace trend — season">
        {/* No "up = faster" here: with no plot drawn there is no axis for it to
            describe, and a reading instruction for a picture that is not on the
            screen is just noise. */}
        <ChartAbsent label={s.absentLabel} />
      </Panel>
    );
  }

  const n = s.points.length;
  const missing = s.points.filter((p) => isAbsent(p.value)).length;

  /**
   * The value phrase, unit welded in. Formatted from the SOURCE row's sec/km
   * rather than from the plotted sec/mi, so `fmtPaceMiFromKm` gets the unit it
   * documents and the arithmetic happens once. `points` is built one-to-one
   * from these rows in `paceSeries`, so index `i` is the same week in both.
   *
   * A week with no qualifying run falls through to the prep's own phrase —
   * "Not recorded" — the same words every other chart in the app uses for a
   * hole. It is deliberately NOT "slow week" or a dash next to a number: what
   * is known is that there is nothing to average, not that the athlete was
   * slow. `Plot` prints the week itself underneath, from `points[i].label`, so
   * a mis-tap reads as the wrong week rather than as the right one.
   */
  const readout = (i: number) => {
    const secPerKm = paceSeason?.[i]?.pace;
    const pace =
      secPerKm === null || secPerKm === undefined
        ? null
        : fmtPaceMiFromKm(secPerKm);
    return pace ?? s.readout(i);
  };

  return (
    <Panel title="Pace trend — season" note={UP_IS_FASTER}>
      <Plot
        data={s.points}
        /* `[slowest, fastest]` — the inversion, by order. See the header. */
        domain={s.domain}
        ticks={s.ticks}
        tickFormat={s.tickFormat}
        unitLabel={s.unitLabel}
        readout={readout}
        accessibilityLabel={
          `Line chart of weekly average pace in minutes per mile. ${n} weeks, ` +
          `${s.points[0].label} to ${s.points[n - 1].label}. ` +
          `The axis is inverted, so a faster pace is higher.` +
          (missing > 0
            ? ` ${missing} ${missing === 1 ? "week has" : "weeks have"} no ` +
              `qualifying run and no pace is plotted for ${missing === 1 ? "it" : "them"}.`
            : "")
        }
      >
        {(frame) => (
          <>
            {/* Breaks at every null rather than interpolating across it. */}
            <LinePath frame={frame} data={s.points} />
            {/* One dot per recorded week, as on the web (`charts.tsx:307`).
                Twelve weeks is few enough that each reading can carry its own
                mark, which is what makes the break at a missing week visible as
                a gap between two dots rather than as a slightly longer segment. */}
            <Dots frame={frame} data={s.points} />
            {/* And the dashed hollow mark on the axis under each of those
                gaps, so the missing week is an object the reader can see and
                tap, not an absence they have to notice. */}
            <AbsentMarks frame={frame} data={s.points} />
          </>
        )}
      </Plot>
    </Panel>
  );
}


export default PaceChart;
