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
 * ── The line breaks ────────────────────────────────────────────────────────
 * A week the server could not score stays null and `LinePath` breaks at it,
 * with the 12px dashed mark on the baseline saying so. No interpolation, here
 * or anywhere else in the chart system.
 *
 * ── One caveat this component cannot fix from inside ───────────────────────
 * `(tabs)/stats.tsx` gates its Fitness score TILE on `risk.hasActivityHistory`,
 * because a score with no synced running behind it is the model talking to
 * itself. The call-site contract for this chart passes only `fitness.weekly`,
 * so the only guard available here is `fitnessSeries`' three-week threshold
 * (`charts.tsx:319`). If the screen wants the same gate the tile has, it should
 * render this component conditionally rather than have it grow a second prop.
 */
import { StyleSheet, Text, View } from "react-native";

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, LinePath } from "../chart/marks";
import { fitnessSeries } from "../../lib/chartData";
import type { Fitness } from "../../lib/types";
import { layout, radius, ruleWidth, space } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

const TITLE = "Fitness score";
/** The caveat lives in the note, which is the slot the app reserves for one. */
const NOTE = "season · 0–100, a model output";

/**
 * The website's Panel (`athlete/tabs.tsx:22`): semibold title left, muted note
 * right, content under. Spelled out locally from tokens, as it is in
 * `(tabs)/stats.tsx`, `profile.tsx` and `chat.tsx` — no file owns a shared one
 * yet, and every value here is a token, so the copies cannot drift.
 */
function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
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

  const weeks = s.points.filter((p) => p.value !== null).length;

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
        measured on you, and it is not a verdict — it moves when the training
        behind it moves.
      </Text>
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
    // Elevation, never emphasis.
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
  panelNote: { ...text.meta, color: color.muted, flexShrink: 1 },

  /** `ink2` — this has to be read, not merely noticed. 6.4:1 on card. */
  key: { ...text.meta, color: color.ink2, marginTop: space.md },
});
