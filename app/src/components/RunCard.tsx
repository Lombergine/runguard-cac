/**
 * One run in the log — a ROW, not a card.
 *
 * Ported from the Claude Design study's "Recent runs" list. The card is gone
 * from this component: the design pools the runs into one grouped slab and
 * lets the caller draw it, exactly as `List` does, so what ships here is the
 * row's inside and nothing else. No surface, no border, no shadow, and no
 * separator — a separator belongs to the list that knows which row is last
 * (docs/design-port.md #6).
 *
 * Two lines and a chevron:
 *
 *     5.2 mi · 42:18 · 8:07 /mi                                    ›
 *     Tue 25 Aug · Long run
 *
 * The figures lead and the date follows, which inverts what this component
 * used to do (date as the card's title, three big labelled stat columns
 * beneath a route glyph). In a log the athlete is scanning for a run's SHAPE —
 * how far, how long, how fast — and the date is how they confirm they found
 * the right one. The route glyph and the three micro-labels went with the
 * card: three eyebrows per row, fourteen rows down a screen, is a column of
 * labels rather than a log.
 *
 * The payload is kilometres and has no pace field; both display figures are
 * produced here through lib/units, welded to their unit in a single node.
 *
 * When the run spiked, an observation sits below the two lines: the state's
 * shape, the sentence, and the provenance of the finding it rests on. No
 * modal, no interstitial, no dismiss, no rule above it and no tinted surface —
 * nothing here is urgent enough to interrupt, and interrupting would make a
 * description read as a directive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE DESIGN DRAWS THAT THIS DOES NOT — see docs/design-port.md #10, #11
 *
 *  1. The design marks a spike with a HALF-filled dial and labels it
 *     "unusual". visual-spec.md maps half → `watch` and split → `unusual`, so
 *     the design pairs the watch shape with the unusual word. Shape is what
 *     carries the state here — that is the whole reason these are shapes and
 *     not just colours — so the wrong shape does not survive greyscale,
 *     colour-blindness or glare. `StatusDot` draws the flag, and the flag
 *     comes from `SPIKE_FLAG` below: split for `large`, half for `notable`.
 *  2. The design sets the word "unusual" in #dc2626. Non-negotiable #5:
 *     advisory renders in body weight, lowercase, colour LAST, no red. A red
 *     word is not a red banner, but it is still type turning a description
 *     into an instruction. The whole advisory sentence — flag word included —
 *     is `ink2`, and the dot beside it is the only thing that varies by state.
 *
 * That second point is also why this row does not call `Advisory`: that
 * component colours the flag word and sets the reason on its own line, and the
 * design's spike marker is one sentence with the state welded into it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ON THE ABSENT FIGURE. A missing time or pace used to render the bordered,
 * dashed `Absent` slot. A slot cannot survive one line of type, so the absent
 * figure is the em dash in `color.unknown` — the same dash and the same token
 * the app uses everywhere for "we don't know" (`lib/readiness.ts` renders
 * "— unknown"). It is a blank that cannot be read as a value, which is what
 * non-negotiable #4 is protecting; the WORDS that normally sit under the dash
 * survive in the accessibility label below, which says "Time not recorded".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE WHOLE ROW IS A LINK, and why that needed an explicit label.
 *
 * It opens `/activity/{id}`, mirroring the web log, where each row is a `<Link
 * href={/activity/${r.id}}>` (tabs.tsx:320-351). The route is pushed from in
 * here rather than handed down as a prop because the row already holds
 * `run.id`, and a link that knows its own destination cannot be wired to the
 * wrong one.
 *
 * React Native's `Pressable` marks ITSELF accessible, so the row becomes one
 * element and its children stop being individually announced. Left alone, that
 * would silently drop the 5,205-runner provenance from every screen reader —
 * which is the same failure as deleting the paragraph, and
 * `website/src/lib/risk.ts:352-353` requires it to survive. So the label below
 * is composed from the SAME strings that render, spike sentence and provenance
 * included: nothing is on the glass that is not also spoken.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { StatusDot } from "./StatusDot";
import type { Flag, RunCardProps, SessionSpike } from "../lib/types";
import { formatDistance, formatDuration, formatPace } from "../lib/units";
import { rowPress } from "../theme/press";
import { layout, ruleWidth, space, target } from "../theme/space";
import { chevronStroke, color } from "../theme/tokens";
import { text } from "../theme/type";

/** What sits between two figures, and between the date and the session. */
const SEP = " · ";

/** The absent figure. Paired with `color.unknown`, never a bare grey blank. */
const DASH = "—";

/**
 * `spike.level` is information, so it survives as a different advisory state
 * rather than being flattened to one. `notable` is 25–50% past the athlete's
 * recent longest; `large` is 50%+ (website/src/lib/risk.ts). StatusDot draws
 * `watch` and `unusual` as different shapes, so the two stay apart in
 * greyscale as well as in colour.
 */
const SPIKE_FLAG: Record<SessionSpike["level"], Flag> = {
  notable: "watch",
  large: "unusual",
};

/**
 * The website's wording (components/athlete/tabs.tsx:344-348), ported whole.
 *
 * It names the comparison — a percentage, against the longest single run in the
 * 30 days before this one, with that run's distance quoted — because "longer
 * than your recent long runs" states neither how much longer nor than what.
 */
function spikeReason(spike: SessionSpike): string {
  return `${spike.pctAbove}% longer than your longest run in the month before it (${formatDistance(
    spike.longestKm,
  )}).`;
}

/**
 * The provenance, which website/src/lib/risk.ts:352-353 requires the UI to
 * preserve: the cohort behind the finding, and the fact that its mean age was
 * 45.8 so nothing equivalent has been shown in adolescents. The athletes
 * reading this are adolescents, so the caveat is not a footnote to be trimmed —
 * it is the honest strength of the claim.
 *
 * The design's row does not draw it. It is not a design detail: risk.ts names
 * it as copy the UI must keep, so it stays.
 */
const SPIKE_PROVENANCE =
  "In a study of 5,205 adult runners, single sessions well past a runner's " +
  "recent longest carried a higher injury rate — the clearest load signal " +
  "there is, though it hasn't been shown specifically in teenagers.";

/**
 * The geometry of a row's two lines, exported for the run-log skeleton alone.
 * The row lays itself out from these same values below, so there is one set of
 * numbers rather than two that drift.
 *
 * A spike is deliberately NOT reserved. It once was, when the advisory was a
 * single line. It is now a paragraph whose height depends on where the text
 * wraps, and holding room for it would make three placeholders taller than the
 * screen — trading a small settle for a screenful of emptiness on every load,
 * when most runs never spike at all.
 *
 * The three keys keep the names the run log's skeleton already reads, and now
 * describe the row rather than the card: the figure line, the gap, and the
 * line beneath it. `statsRowAbsent` no longer differs from a present figure —
 * an absent one is an em dash on the same line, so the row has no taller
 * variant to reserve for.
 */
export const runCardMetrics = {
  /** The figure line — distance, time, pace. */
  headerLine: text.statBase.lineHeight ?? 0,
  /**
   * Between the two lines. The design pairs them at 1px; that is below the
   * app's 4px scale, and `space.xs` is the smallest step it has. At this
   * leading the 3pt difference does not break the pairing, and inventing a 1
   * would put a raw number in a component (app/CLAUDE.md).
   */
  gap: space.xs,
  /** The date and session line. */
  statsRowAbsent: text.meta.lineHeight ?? 0,
} as const;

/**
 * The disclosure chevron. 18×18, the design's size.
 *
 * Same 24-unit grid and same path as `List`'s, because the icon vocabulary is
 * one system or it is noise. Two deliberate differences from that copy:
 *
 *  - The stroke is `chevronStroke`, the token the design carries as a literal
 *    because it lands in SVG paint (docs/design-port.md #8). It is chrome
 *    pointing at a row, not information about it, so it is the same grey in
 *    both appearances.
 *  - Width is `ruleWidth` scaled by the viewBox ratio, so the drawn line is
 *    1.5pt rather than 1.5 viewBox units. The design's 2.2 in a 24-unit box
 *    draws 1.65pt at this size; `ruleWidth` is the app's single line weight
 *    (space.ts rejects hairlines outright — they vanish in direct sunlight),
 *    and two chevrons at two weights in one app is the drift, not the 0.15pt.
 */
const GRID = 24;
const CHEVRON_SIZE = 18;
const CHEVRON = "M9.5 5.5 L16 12 L9.5 18.5";

function Chevron() {
  return (
    <Svg width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={CHEVRON}
        fill="none"
        stroke={chevronStroke}
        strokeWidth={(ruleWidth * GRID) / CHEVRON_SIZE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function RunCard({ run, dateLabel, sessionLabel }: RunCardProps) {
  const router = useRouter();

  // Null when there is no distance or no duration to divide. A pace that was
  // never run is absent, and absent is a dash — never a stand-in "0:00 /mi".
  const pace = formatPace(run.durationS, run.km);

  const distance = formatDistance(run.km);
  /*
   * Null when the payload carried no duration — and it can. `duration_s` is
   * `REAL DEFAULT 0` in the schema and `/api/mobile/ingest` rejects only a
   * NEGATIVE duration (route.ts:72), so a workout synced with `durationS: 0`
   * and a real distance is stored and reaches this row.
   *
   * A run that covered ground did not take zero seconds; that 0 is a duration
   * NOBODY RECORDED, and `formatDuration` would print it as "0:00" in the same
   * mono figure as every measured time. `formatPace` already reads the very
   * same input as absent — it returns null on `durationS <= 0` and the pace
   * position goes to a dash — so without this the one missing datum rendered
   * two different ways inside a single row, which is the collapse
   * non-negotiable #4 exists to forbid. The guard matches `fmtPaceMi`'s
   * exactly so the two positions can never disagree about whether the duration
   * exists.
   */
  const duration =
    Number.isFinite(run.durationS) && run.durationS > 0
      ? formatDuration(run.durationS)
      : null;

  const flag = run.spike ? SPIKE_FLAG[run.spike.level] : null;

  /*
   * Everything the row shows, in the order it shows it. See the header: the
   * Pressable collapses the row into one accessibility element, so this is the
   * only place the spike sentence and its provenance can be spoken from. It is
   * also where the em dash gets its words back — "Time not recorded" is what
   * the bordered `Absent` slot used to print under the dash.
   */
  const spoken = [
    dateLabel,
    sessionLabel,
    `Distance ${distance}`,
    duration === null ? "Time not recorded" : `Time ${duration}`,
    pace === null ? "Pace not recorded" : `Pace ${pace}`,
    run.spike && flag ? `${flag} — ${spikeReason(run.spike)}` : null,
    run.spike ? SPIKE_PROVENANCE : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  return (
    <Pressable
      onPress={() => router.push(`/activity/${run.id}`)}
      // "link", not "button": the row pushes a screen, and that announcement is
      // the only chevron a screen-reader user gets. Same rule as `ListRow`.
      accessibilityRole="link"
      accessibilityLabel={spoken}
      accessibilityHint="Opens this run."
      // `rowPress`, not `dim`: a row is a SURFACE, so it flashes a fill across
      // its full width. Dimming it would dim its own content. See theme/press.
      style={({ pressed }) => [styles.row, rowPress({ pressed })]}
    >
      <View style={styles.line}>
        <View style={styles.body}>
          {/*
            One line, three figures, each welded to its own unit in its own
            node — never a bare numeral with the unit rendered elsewhere
            (non-negotiable #3). Distance leads in `ink`; time and pace follow
            in `muted`, because the row is scanned by distance first.
          */}
          <Text style={styles.figures}>
            <Text style={styles.distance}>{distance}</Text>
            {SEP}
            {duration === null ? (
              <Text style={styles.missing}>{DASH}</Text>
            ) : (
              duration
            )}
            {SEP}
            {pace === null ? <Text style={styles.missing}>{DASH}</Text> : pace}
          </Text>

          {/*
            Prose carrying a pre-formatted local date, so it is set in the body
            face and not the numeral one: mono here would put "Long run" in the
            figure voice. The date arrives formatted — this component never
            derives one (non-negotiable #2).
          */}
          <Text style={styles.meta}>
            {sessionLabel ? `${dateLabel}${SEP}${sessionLabel}` : dateLabel}
          </Text>
        </View>

        <Chevron />
      </View>

      {run.spike && flag ? (
        <View style={styles.spike}>
          <View style={styles.advisoryLine}>
            {/* The shape is the state. See the header for why it is not the
                design's half dial, and why the sentence beside it is not red. */}
            <View style={styles.dot}>
              <StatusDot flag={flag} />
            </View>
            {/* Lowercase, body weight, one sentence, `ink2` throughout. */}
            <Text style={styles.advisory}>
              {`${flag} — ${spikeReason(run.spike)}`}
            </Text>
          </View>
          <Text style={styles.provenance}>{SPIKE_PROVENANCE}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * A column, so the spike block sits under the whole line rather than beside
   * the chevron. 13/16 in the design: the 16 is `layout.cardPadding`, and the
   * 13 rounds to `space.md` on the 4px scale — the same rounding `List` makes
   * for its own row.
   *
   * `minHeight` is the grouped-row floor, not the row's height: two lines
   * already clear it, and a spike or Dynamic Type grows past it rather than
   * clipping.
   */
  row: {
    minHeight: target.row,
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPadding,
  },
  /** The two text lines, with the chevron pinned right and vertically centred. */
  line: { flexDirection: "row", alignItems: "center", gap: space.md },
  /** Takes the slack so the chevron stays right however long the figures run. */
  body: { flex: 1 },
  /**
   * `statBase` — 16.5 mono, body rank. The design sets this line at 17 against
   * the 13.5 beneath it, and this is the rank that lands there: `statInline`
   * (14) is for a figure sitting UNDER something and shrank the row's own
   * subject below its date, while `stat` (22) is the rank a figure gets when
   * it is the point of a whole screen — every run in a scrolling log shouting.
   *
   * Mono and tabular because every numeral in this app is: a log is read as a
   * column, and untabulated figures jitter down it.
   *
   * Muted is the ground state of the line; only distance is lifted out of it.
   */
  figures: { ...text.statBase, color: color.muted },
  distance: { color: color.ink },
  /**
   * The absent figure. `unknown` is the token that means "we don't know", and
   * it is never colour alone — the dash is what carries it here, because a row
   * has no room for the dashed slot the page-level `Absent` draws.
   */
  missing: { color: color.unknown },
  /** Sits directly under the figures; see `runCardMetrics.gap` for the 1px. */
  meta: { ...text.meta, color: color.muted, marginTop: runCardMetrics.gap },
  /**
   * No rule and no tint above it. The website paints a spiked row with its
   * status colour and the design draws a divider; both make a description look
   * like a notice, and the 8pt of air separates the observation just as well.
   */
  spike: { marginTop: space.sm },
  /** `flex-start`, because the sentence wraps and the dot belongs to line one. */
  advisoryLine: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  /**
   * Drops the 12pt dot onto the optical centre of a 20pt line: (20 − 12) / 2 is
   * exactly `space.xs`, so the offset comes off the scale rather than being
   * eyeballed.
   */
  dot: { marginTop: space.xs },
  /** Body weight, lowercase, ink2 — flag word and reason alike. No red. */
  advisory: { ...text.meta, color: color.ink2, flex: 1 },
  /** muted on card is 5.16:1 — quieter than the reason, still fully readable. */
  provenance: { ...text.meta, color: color.muted, marginTop: space.sm },
});
