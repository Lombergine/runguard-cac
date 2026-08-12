/**
 * One run in the log.
 *
 * Panel hierarchy, as on the website: the date sits LEFT as the card's title,
 * the team's word for the day sits RIGHT as the note. Both arrive
 * pre-formatted, because a component that derives a date will eventually derive
 * the wrong one, and a run with no matching plan day simply has no note rather
 * than a guessed one.
 *
 * Then three stats, always Distance / Time / Pace, always that order, mono, to
 * the right of a small route glyph. The glyph is drawn in the ember gradient —
 * the one place the brand signature appears on a run.
 *
 * The payload is kilometres and has no pace field; both display figures are
 * produced here through lib/units, welded to their unit in a single node.
 *
 * When the run spiked, an observation sits below the stats inside the card: the
 * figure, then the provenance of the finding it rests on. No modal, no
 * interstitial, no dismiss, and no tinted or alarmed surface: nothing here is
 * urgent enough to interrupt, and interrupting would make a description read as
 * a directive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE WHOLE CARD IS A BUTTON, and why that needed an explicit label.
 *
 * It opens `/activity/{id}`, mirroring the web log, where each row is a `<Link
 * href={/activity/${r.id}}>` (tabs.tsx:320-351). The route is pushed from in
 * here rather than handed down as a prop because the card already holds
 * `run.id`, and a link that knows its own destination cannot be wired to the
 * wrong one.
 *
 * React Native's `Pressable` marks ITSELF accessible, so the card becomes one
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
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { Advisory } from "./Advisory";
import { Card } from "./Card";
import { Absent } from "./Nothing";
import { Stat } from "./Stat";
import type { Flag, RunCardProps, SessionSpike } from "../lib/types";
import { formatDistance, formatDuration, formatPace } from "../lib/units";
import { layout, ruleWidth, space, target } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/**
 * The route glyph's rendered size — a real dimension, so it comes off the 4px
 * scale rather than being typed in here.
 */
const GLYPH = space.xl;

/** SVG gradient handle. Scoped to this Svg element, so one id is enough. */
const EMBER = "runCardEmber";

/**
 * One line of the micro scale, taken from the scale itself. The run-log
 * skeleton reserves the header's height from this, and a locally-guessed line
 * would reserve something other than what renders.
 */
const MICRO_LINE = text.micro.lineHeight ?? 0;

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
 */
const SPIKE_PROVENANCE =
  "In a study of 5,205 adult runners, single sessions well past a runner's " +
  "recent longest carried a higher injury rate — the clearest load signal " +
  "there is, though it hasn't been shown specifically in teenagers.";

/**
 * The geometry of a card's content box, exported for the run-log skeleton
 * alone. The card lays itself out from these same values below, so there is one
 * set of numbers rather than two that drift.
 *
 * The stats row is reserved at its TALLEST: a run with no pace swaps a figure
 * for a bordered `Absent` slot, which cannot be known before the payload lands,
 * and that over-reservation settles into whitespace nobody notices.
 *
 * A spike is deliberately NOT reserved. It once was, when the advisory was a
 * single line. It is now a paragraph whose height depends on where the text
 * wraps, and holding room for it would make three placeholders taller than the
 * screen — trading a small settle for a screenful of emptiness on every load,
 * when most runs never spike at all.
 */
export const runCardMetrics = {
  headerLine: MICRO_LINE,
  gap: space.md,
  /** A stat column: micro label, then the figure. Enforced as a `minHeight`
   *  below, so the reservation holds regardless of how Stat measures. */
  statsRow: MICRO_LINE + space.xs + (text.stat.lineHeight ?? 0),
  /**
   * The same row when a figure is missing and `Absent` takes a column — time,
   * pace, or both, which sit side by side and so measure the same:
   * eyebrow, then a slot with a rule and `layout.cardPadding` on both axes
   * around its `—` and label. Mirrors Absent's box in Nothing.tsx — built from
   * the same tokens, and must track it if that box changes.
   */
  statsRowAbsent:
    MICRO_LINE +
    space.sm +
    2 * ruleWidth +
    2 * layout.cardPadding +
    (text.stat.lineHeight ?? 0) +
    space.xs +
    (text.meta.lineHeight ?? 0),
} as const;

/**
 * A route mark in the ember gradient — the website's 135°, top-left to
 * bottom-right. Flat, in the icon line weight: a printed key, not an
 * illustration. Decorative, so it is hidden from assistive tech.
 */
function RouteGlyph() {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={EMBER} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color.ember[0]} />
          <Stop offset="0.45" stopColor={color.ember[1]} />
          <Stop offset="1" stopColor={color.ember[2]} />
        </LinearGradient>
      </Defs>
      <Path
        d="M5 19c3.4 0 3.4-4.6 6.8-4.6S15.2 5 19 5"
        fill="none"
        stroke={`url(#${EMBER})`}
        strokeWidth={ruleWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={5} cy={19} r={2} fill={`url(#${EMBER})`} />
    </Svg>
  );
}

export function RunCard({ run, dateLabel, sessionLabel }: RunCardProps) {
  const router = useRouter();

  // Null when there is no distance or no duration to divide. A pace that was
  // never run is absent, and absent is dashed — never a stand-in "0:00 /mi".
  const pace = formatPace(run.durationS, run.km);

  const distance = formatDistance(run.km);
  /*
   * Null when the payload carried no duration — and it can. `duration_s` is
   * `REAL DEFAULT 0` in the schema and `/api/mobile/ingest` rejects only a
   * NEGATIVE duration (route.ts:72), so a workout synced with `durationS: 0`
   * and a real distance is stored and reaches this card.
   *
   * A run that covered ground did not take zero seconds; that 0 is a duration
   * NOBODY RECORDED, and `formatDuration` would print it as "0:00" in the same
   * mono figure as every measured time. `formatPace` already reads the very
   * same input as absent — it returns null on `durationS <= 0` and the Pace
   * column goes dashed — so without this the one missing datum rendered two
   * different ways inside a single card, which is the collapse non-negotiable
   * #4 exists to forbid. The guard matches `fmtPaceMi`'s exactly so the two
   * columns can never disagree about whether the duration exists.
   */
  const duration =
    Number.isFinite(run.durationS) && run.durationS > 0
      ? formatDuration(run.durationS)
      : null;

  /*
   * Everything the card shows, in the order it shows it. See the header: the
   * Pressable collapses the card into one accessibility element, so this is the
   * only place the spike sentence and its provenance can be spoken from.
   * `Absent` renders "—" over "Not recorded"; the label says the same words.
   */
  const spoken = [
    dateLabel,
    sessionLabel,
    `Distance ${distance}`,
    duration === null ? "Time not recorded" : `Time ${duration}`,
    pace === null ? "Pace not recorded" : `Pace ${pace}`,
    run.spike ? `${SPIKE_FLAG[run.spike.level]} — ${spikeReason(run.spike)}` : null,
    run.spike ? SPIKE_PROVENANCE : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  return (
    <Pressable
      onPress={() => router.push(`/activity/${run.id}`)}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens this run."
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}
    >
      <Card>
        <View style={styles.header}>
          <Text style={styles.date}>{dateLabel}</Text>
          {sessionLabel ? (
            <Text style={styles.session}>{sessionLabel}</Text>
          ) : null}
        </View>

        <View style={styles.row}>
          <View
            style={styles.glyph}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <RouteGlyph />
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              {/* Sentence case at every call site: text.micro owns the
                  uppercasing, so a shouted literal only splits the convention. */}
              <Stat label="Distance" value={distance} />
            </View>
            <View style={styles.stat}>
              {duration === null ? (
                <Absent eyebrow="Time" />
              ) : (
                <Stat label="Time" value={duration} />
              )}
            </View>
            <View style={styles.stat}>
              {pace === null ? (
                <Absent eyebrow="Pace" />
              ) : (
                <Stat label="Pace" value={pace} />
              )}
            </View>
          </View>
        </View>

        {/* Unchanged by the card becoming a button: the advisory sentence AND
            the provenance paragraph below it both still render in full. */}
        {run.spike ? (
          <View style={styles.spike}>
            <Advisory
              flag={SPIKE_FLAG[run.spike.level]}
              reason={spikeReason(run.spike)}
            />
            <Text style={styles.provenance}>{SPIKE_PROVENANCE}</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * The button around the card. The card is far taller than this on its own;
   * the floor is here so the target can never fall under 48dp regardless of
   * what the card ends up containing.
   */
  press: { minHeight: target.min },
  /**
   * State, not motion: a pressed card dims slightly and returns. No scale, no
   * spring, nothing that a reduced-motion setting would need to suppress.
   */
  pressed: { opacity: 0.72 },
  /** Title left, note right. No local lineHeight: text.micro carries the one
   *  the metrics reserve, and both cells sit on the same one. */
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
  },
  date: { ...text.micro, color: color.ink },
  /** The note: shrinks first, because the date must never be truncated. */
  session: {
    ...text.micro,
    color: color.muted,
    flexShrink: 1,
    textAlign: "right",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: runCardMetrics.gap,
  },
  glyph: { width: GLYPH, height: GLYPH },
  stats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: runCardMetrics.statsRow,
  },
  /** Equal columns so figures line up down the log, not just across a card. */
  stat: { flex: 1 },
  /**
   * A soft rule, not a fill. The website tints a spiked row with its status
   * colour; here that would be a red panel behind a description, which the
   * advisory rules forbid. A line separates the observation just as well.
   */
  spike: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  /** muted on card is 5.16:1 — quieter than the reason, still fully readable. */
  provenance: { ...text.meta, color: color.muted, marginTop: space.sm },
});
