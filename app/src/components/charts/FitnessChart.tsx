/**
 * The 0–100 fitness score across the season, one point per week.
 *
 * ── What this number is, and why the panel says so ─────────────────────────
 * `docs/visual-spec.md` says there is no composite score anywhere in the app —
 * "if a component would render a single number that summarises the athlete,
 * it's the wrong component". That line has been overruled on instruction for
 * this build and the score ships. Overruled is not the same as forgotten, so
 * the caveat is carried in the panel note rather than dropped: `fitness.score`
 * is a MODEL OUTPUT, not a measurement (`lib/types.ts:282` — "0–100 model
 * outputs, not measurements"), and the note says exactly that in the slot the
 * app already reserves for caveats.
 *
 * So this panel deliberately has NO trend arrow, NO tier badge, and NO colour
 * verdict. The website's own version strokes the line in GOOD green with a
 * glow filter (`charts.tsx:334`); green reads "good", which would turn a model
 * output into a judgement about the athlete before a single word is read. The
 * line here takes `LinePath`'s ordinary series stroke, the same one any other
 * single-series chart would get. The status tokens stay where they belong: on
 * verdicts, never on chrome.
 *
 * ── The axis is fixed at 0–100 ─────────────────────────────────────────────
 * From `fitnessSeries`, mirroring `charts.tsx:325`. An axis rescaled to the
 * data would turn three points of drift across a season into a mountain range.
 *
 * ── The line breaks — WHERE IT CAN ─────────────────────────────────────────
 * `LinePath` splits at every null and `AbsentMarks` puts the 12px dashed mark
 * on the baseline, exactly as on every other chart. There is no interpolation
 * here or anywhere else in the chart system.
 *
 * BUT DO NOT READ THAT AS A GUARANTEE ABOUT THIS SERIES. `Fitness["weekly"]`
 * types `score` as a plain `number` (`lib/types.ts:336`), and
 * `computeFitness` (`website/src/lib/engine.ts:246`) does
 * `if (score !== null) weekly.push(...)` — a week it could not score is DROPPED
 * FROM THE ARRAY rather than pushed with a null. So the nulls this component
 * breaks at never arrive: the unscored weeks are simply not in `weekly`, the
 * surviving weeks close up evenly spaced, and the line runs straight across a
 * stretch of season the model had nothing to say about. That is the same
 * silent gap-closing `PaceChart`'s header names as the website's mistake —
 * `paceTrend` avoids it by emitting `pace: null`, and `computeFitness` does
 * not.
 *
 * It is not fixable from inside this component: `weekly` carries only the
 * pre-formatted label ("Mar 3") and no ISO week start, so there is nothing here
 * to notice a gap with, and deriving a date in a component is barred by
 * non-negotiable #2. The fix is server-side — push `{ week, score: null }`
 * instead of skipping. The null handling below is kept as the defence for the
 * day that lands.
 *
 * ── One caveat this component cannot fix from inside ───────────────────────
 * `(tabs)/stats.tsx:460` gates this chart on `risk.hasActivityHistory`, the
 * same flag its Fitness score TILE uses, because a score with no synced running
 * behind it is the model talking to itself. Worth knowing what that gate is
 * actually worth: `risk.ts:650` computes it as `activities.length > 0` over the
 * athlete's whole history, so it is a LIFETIME flag that never goes false again
 * once an athlete has ever synced a run. It excludes a brand-new athlete and
 * nobody else — it says nothing about whether the season on screen is founded.
 * The only real guard here is `fitnessSeries`' three-week threshold
 * (`charts.tsx:319`).
 */
import { StyleSheet, Text } from "react-native";

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, LinePath } from "../chart/marks";
import { isAbsent } from "../chart/scales";
import { fitnessSeries } from "../../lib/chartData";
import type { Fitness } from "../../lib/types";
import { space } from "../../theme/space";
import { Panel } from "../Panel";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

const TITLE = "Fitness score";
/** The caveat lives in the note, which is the slot the app reserves for one. */
const NOTE = "season · 0–100, a model output";


export function FitnessChart({ weekly }: { weekly?: Fitness["weekly"] }) {
  /*
   * `fitnessSeries` owns the labels, the fixed domain, the ticks, the unit and
   * the readout. `weekly` being undefined is handled there — it becomes an
   * empty series, which fails the three-week threshold and lands on the not-
   * enough-data state below rather than on an empty axis.
   */
  const s = fitnessSeries(weekly);

  if (!s.enough) {
    return (
      <Panel title={TITLE} note={NOTE}>
        <ChartAbsent label={s.absentLabel} />
      </Panel>
    );
  }

  const weeks = s.points.filter((p) => !isAbsent(p.value)).length;

  return (
    <Panel title={TITLE} note={NOTE}>
      <Plot
        data={s.points}
        domain={s.domain}
        ticks={s.ticks}
        tickFormat={s.tickFormat}
        unitLabel={s.unitLabel}
        /* "64 fitness score", with the week label — "Week of Mar 3" — printed
           beneath it by Plot itself. The weekly label is pre-formatted by the
           server (`profile.ts:276`); chartData wraps it and nothing here
           derives a date. */
        readout={s.readout}
        accessibilityLabel={`Fitness score across the season, on a fixed scale of 0 to 100. ${weeks} ${
          weeks === 1 ? "week" : "weeks"
        } scored. The score is a model output, not a measurement.`}
      >
        {(frame) => (
          <>
            <LinePath frame={frame} data={s.points} />
            <AbsentMarks frame={frame} data={s.points} />
          </>
        )}
      </Plot>

      <Text style={styles.key}>
        The model works this out from your synced training. It is not something
        measured on you, and it is not a verdict. It moves when the training
        behind it moves.
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({

  /** `ink2` — this has to be read, not merely noticed. 6.4:1 on card. */
  key: { ...text.meta, color: color.ink2, marginTop: space.md },
});
