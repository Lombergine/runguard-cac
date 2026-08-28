/**
 * Weekly mileage — bars, one per week, on a zero-based axis.
 *
 * The website's `WeeklyKmChart` (`website/src/components/charts.tsx:222`) in the
 * app's chart system: a `Panel` around a `Plot` around two marks. Everything
 * that involves judgement — the kilometre→mile conversion, the label, the
 * zero-based domain, the "three weeks of running or don't draw at all"
 * threshold — already lives in `lib/chartData.ts`. This file decides nothing
 * numeric; it renders.
 *
 * ── Why the axis starts at zero and is not a per-chart decision ─────────────
 * Bars are read as areas. `zeroBasedDomain` is what `weeklyKmSeries` hands over
 * and there is no prop here to override it: a truncated bar axis turns a 4-mile
 * difference between two 30-mile weeks into a doubling, and this is a chart a
 * teenager reads about their own training volume.
 *
 * ── The two states are the same height ─────────────────────────────────────
 * With fewer than three weeks of running behind it the panel renders
 * `<ChartAbsent>` — the app's ordinary `Absent`, dashed and sunken, at the
 * plot's exact height. "Not enough data yet" IS the unknown case here, so it
 * looks identical to every other unknown in the app, and the card does not
 * change size when the athlete's third week lands.
 */

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, Bars } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import { weeklyKmSeries } from "../../lib/chartData";
import type { Profile } from "../../lib/types";
import { Panel } from "../Panel";


/**
 * `weeks` is optional on `Profile` like every other `/me` leg, and the type is
 * taken from there rather than restated — a locally redefined payload shape is
 * what stops independently-built pieces recombining. An undefined leg is not a
 * crash and not an empty axis: `weeklyKmSeries` returns `enough: false` for it
 * and the panel goes Absent.
 */
export function WeeklyKmChart({ weeks }: { weeks?: Profile["weeks"] }) {
  const s = weeklyKmSeries(weeks);

  if (!s.enough) {
    return (
      <Panel title="Weekly mileage">
        <ChartAbsent label={s.absentLabel} />
      </Panel>
    );
  }

  const n = s.points.length;
  const missing = s.points.filter((p) => isAbsent(p.value)).length;

  return (
    <Panel title="Weekly mileage" note={`last ${n} ${n === 1 ? "week" : "weeks"}`}>
      <Plot
        data={s.points}
        domain={s.domain}
        ticks={s.ticks}
        tickFormat={s.tickFormat}
        unitLabel={s.unitLabel}
        /* The value phrase with "mi" welded in (non-negotiable #3). `Plot`
           prints the week itself, from `points[i].label`, so a mis-tap shows
           the wrong week rather than reading as the right one. */
        readout={s.readout}
        accessibilityLabel={
          `Bar chart of weekly mileage in miles. ${n} weeks, ` +
          `${s.points[0].label} to ${s.points[n - 1].label}.` +
          (missing > 0 ? ` ${missing} not recorded.` : "")
        }
      >
        {(frame) => (
          <>
            <Bars frame={frame} data={s.points} />
            {/* A week that recorded no distance is a MEASURED ZERO and keeps a
                solid stub from `Bars`. `AbsentMarks` is for the other case — a
                week whose figure is not a number at all — and it must be here
                even when the payload never produces one, or the day it does the
                hole would read as a zero. */}
            <AbsentMarks frame={frame} data={s.points} />
          </>
        )}
      </Plot>
    </Panel>
  );
}


export default WeeklyKmChart;
