/**
 * Energy and motivation from the athlete's own check-ins, over the last thirty
 * local days.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE LINE BREAKS. `connectNulls` IS NOT PORTED.
 *
 * `website/src/components/charts.tsx:422-423` sets `connectNulls` on both of
 * these lines. That draws a straight segment THROUGH every day the athlete did
 * not check in, so a day nobody reported becomes a plausible-looking point on a
 * trend — a blank rendering as a value, which is the one failure the visual
 * spec exists to prevent.
 *
 * What this file does instead: the nulls survive out of `mentalSeries` into
 * `ChartPoint.value`, `LinePath` splits the series into contiguous non-null
 * runs and draws one polyline per run (a run of one becomes a dot, so a lone
 * reading between two holes is still visible), and `AbsentMarks` puts the 12px
 * dashed hollow mark on the baseline at every day with something missing. The
 * picture therefore shows the SHAPE OF THE CHECKING-IN as well as the numbers,
 * and there is no interpolation anywhere in it.
 *
 * Do not "restore" `connectNulls` when comparing the two surfaces.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── Telling the two series apart WITHOUT COLOUR ────────────────────────────
 * The website separates energy from motivation on hue alone (BRAND vs
 * SERIES_1) plus a two-swatch legend, which is hue again. That fails in
 * greyscale, in glare, and for a red-green or blue-yellow colour-blind reader.
 *
 * Here the hues are kept — same assignment as the website, so the two surfaces
 * agree — but they are the LAST cue, not the only one. Two further channels
 * carry it:
 *
 *   ENERGY      heavier stroke, and a filled dot on EVERY recorded day
 *   MOTIVATION  finer stroke, no per-day dots
 *
 * Desaturate and one line is visibly fatter and beaded, the other is a thin
 * plain line. The channel is NOT a dash pattern, and it must never be: dashed
 * means "we don't know" everywhere in this app, with no exceptions, and a
 * dashed series line would collide head-on with the absent mark.
 *
 * The residual case is a lone reading with holes on both sides, where each
 * series is a single dot and only the radius separates them. `mental30` is
 * sparse by construction so that case is common — which is exactly why the
 * readout below the plot names BOTH values with the scale welded on
 * ("energy 7/10 · motivation 4/10"). A day is read in text, never by
 * identifying a dot.
 *
 * ── Why there is no legend ─────────────────────────────────────────────────
 * A two-swatch legend would cost a line of chrome on a phone to re-state the
 * weakest cue (hue) and would say nothing about the stroke or the beads. The
 * key below the plot is prose instead: it names both series, names the channel
 * that separates them, and doubles as the statement about the breaks — three
 * jobs in the space the legend wanted for one.
 *
 * ── Why the dashes are the point, not an embarrassment ─────────────────────
 * This is the athlete's own report reflected back at them, and the app is the
 * only surface that can collect it — the app's check-in posts `energy`, and no
 * control on the website does. A month with four dots in it is an honest
 * picture of how often they checked in, and the best available argument for
 * checking in again.
 */
import { StyleSheet, Text, View } from "react-native";

import { ChartAbsent, Plot } from "../chart/Plot";
import { AbsentMarks, Dots, LinePath } from "../chart/marks";
import type { ChartPoint } from "../chart/scales";
import { DAILY_DAYS, mentalSeries } from "../../lib/chartData";
import type { MentalDay } from "../../lib/types";
import { layout, radius, ruleWidth, space } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/**
 * Energy: the heavier line. Wider than the app's rule weight so the difference
 * survives a screenshot at 360pt.
 */
const ENERGY_WIDTH = 2.5;
/** The dot on every recorded energy day — the second, colour-free channel. */
const ENERGY_DOT = 3.5;
/** Motivation: the app's one line weight, and no beads. */
const MOTIVATION_WIDTH = ruleWidth;

/** "1 day" / "4 days", welded, never a bare numeral. */
function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/**
 * The website's Panel (`athlete/tabs.tsx:22`): a semibold title on the left, a
 * muted note on the right carrying the caveat or the unit, then the content.
 *
 * Spelled out locally from tokens, as it is in `(tabs)/stats.tsx`,
 * `profile.tsx` and `chat.tsx`. No file owns a shared Panel yet; every value
 * here comes from a token, so the copies cannot drift apart on anything that
 * matters.
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

export function MentalChart({ mental30 }: { mental30?: MentalDay[] }) {
  /*
   * `mentalSeries` already densifies the sparse `mental30` onto a continuous
   * thirty-day local axis, formats every label, fixes the 0–10 domain and
   * writes the readout. Nothing is re-derived here. Deliberately not memoised:
   * the window is anchored on `new Date()` inside, so a cached series would go
   * on naming yesterday's days after midnight, and thirty iterations is not a
   * cost worth that.
   */
  const s = mentalSeries(mental30);

  if (!s.enough) {
    return (
      <Panel title="Energy & motivation" note="your own check-ins · 1–10">
        <ChartAbsent label={s.absentLabel} />
      </Panel>
    );
  }

  const energy = s.points;
  const motivation = s.motivation;

  /*
   * ONE dashed mark per day with anything missing.
   *
   * `energy` and `motivation` are INDEPENDENTLY nullable — a day can carry one
   * and not the other — so this is null wherever either half is, and a day the
   * athlete half-answered gets the mark alongside its real point. That is the
   * honest reading: something about that day is genuinely not recorded, and the
   * readout says which half by printing "—" for it.
   *
   * Merged rather than rendering <AbsentMarks> twice: on the majority of days
   * both halves are missing, and two identical rects stacked on the same pixels
   * would render very slightly darker than a single one — an accidental
   * encoding of "more absent", which is not a thing.
   *
   * The non-null value is inert. `AbsentMarks` reads only which entries are
   * null, and this array is never handed to a scale.
   */
  const gaps: ChartPoint[] = energy.map((p, i) => ({
    label: p.label,
    value: p.value === null || motivation[i].value === null ? null : p.value,
  }));

  const recorded = energy.filter(
    (p, i) => p.value !== null || motivation[i].value !== null,
  ).length;

  return (
    <Panel title="Energy & motivation" note="your own check-ins · 1–10">
      <Plot
        data={energy}
        domain={s.domain}
        ticks={s.ticks}
        tickFormat={s.tickFormat}
        unitLabel={s.unitLabel}
        /* Names the explicit local day itself, and both values with the scale
           welded on — so the picture never has to be decoded to read a day. */
        readout={s.readout}
        accessibilityLabel={`Energy and motivation from your check-ins, each scored 1 to 10, over the last ${days(
          DAILY_DAYS,
        )}. ${days(recorded)} recorded, ${days(DAILY_DAYS - recorded)} not recorded.`}
      >
        {(frame) => (
          <>
            {/* Motivation underneath: energy is the series this app collects,
                and it is the one that should survive an overlap. */}
            <LinePath
              frame={frame}
              data={motivation}
              stroke={color.series1}
              width={MOTIVATION_WIDTH}
            />
            <LinePath
              frame={frame}
              data={energy}
              stroke={color.brand}
              width={ENERGY_WIDTH}
            />
            {/* The beads. Energy only — this is the channel, not decoration. */}
            <Dots frame={frame} data={energy} fill={color.brand} r={ENERGY_DOT} />
            <AbsentMarks frame={frame} data={gaps} />
          </>
        )}
      </Plot>

      {/* The key, in words rather than swatches. See the header. */}
      <Text style={styles.key}>
        Energy is the heavier line, with a dot on every day you recorded one.
        Motivation is the finer line.
      </Text>
      <Text style={styles.key}>
        Nothing here is filled in for you: every point is a day you checked in.
        Days you did not are dashed on the baseline, and the lines break at them
        rather than drawing straight through.
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
    // Elevation, never emphasis. Every panel in the app carries the same one.
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

  /**
   * `ink2`, not `muted`: this is the key to the picture, so it has to be read
   * rather than merely noticed. 6.4:1 on card.
   */
  key: { ...text.meta, color: color.ink2, marginTop: space.md },
});
