/**
 * One run in the log.
 *
 * Three stats, always Distance / Time / Pace, always that order, mono, to the
 * right of a small route glyph. The eyebrow carries the explicit local date and
 * the team's word for the day ("Long run", "Recovery run") — both arrive
 * pre-formatted, because a component that derives a date will eventually derive
 * the wrong one.
 *
 * The payload is kilometres and has no pace field; both display figures are
 * produced here through lib/units, welded to their unit in a single node.
 *
 * When the run spiked, one advisory line sits below the stats inside the card.
 * No modal, no interstitial, no dismiss: nothing here is urgent enough to
 * interrupt, and interrupting would make a description read as a directive.
 */
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Advisory } from "./Advisory";
import { Card } from "./Card";
import { Absent } from "./Nothing";
import { Stat } from "./Stat";
import type { RunCardProps } from "../lib/types";
import { formatDistance, formatDuration, formatPace } from "../lib/units";
import { layout, ruleWidth, space } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

const GLYPH = 24;

/**
 * The micro scale has no line height of its own, so the card fixes one. A
 * measured line is what lets the run-log skeleton reserve the exact final
 * height instead of an approximation — the list must not shift as data lands.
 */
const MICRO_LINE = Math.round((text.micro.fontSize ?? 0) * 1.4);

/**
 * The geometry of a card's content box, exported for the run-log skeleton
 * alone. The card lays itself out from these same values below, so there is one
 * set of numbers rather than two that drift.
 *
 * Two of the heights are data-dependent and so cannot be known before the
 * payload lands: a run with no pace swaps a figure for a bordered `Absent`
 * slot, and a run that spiked adds an advisory. The skeleton therefore reserves
 * BOTH — the tallest card the log can produce. Over-reserving settles into
 * whitespace nobody notices; under-reserving moves content under a thumb at
 * 6am, which is the failure "skeletons reserve exact final height" exists to
 * stop.
 */
export const runCardMetrics = {
  eyebrowLine: MICRO_LINE,
  gap: space.md,
  /** A stat column: micro label, then the figure. Enforced as a `minHeight`
   *  below, so the reservation holds regardless of how Stat measures. */
  statsRow: MICRO_LINE + space.xs + (text.stat.lineHeight ?? 0),
  /**
   * The same row when pace is missing and `Absent` takes the third column:
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
  /** Gap between the stats and a spike advisory. */
  spikeGap: space.md,
  /** The advisory itself: the dot-and-flag row, then one reason line. */
  spikeAdvisory:
    (text.base.lineHeight ?? 0) + space.xs + (text.meta.lineHeight ?? 0),
} as const;

/**
 * A route mark, drawn flat in the icon line weight — a printed key, not an
 * illustration. Decorative, so it is hidden from assistive tech.
 */
function RouteGlyph() {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24">
      <Path
        d="M5 19c3.4 0 3.4-4.6 6.8-4.6S15.2 5 19 5"
        fill="none"
        stroke={color.muted}
        strokeWidth={ruleWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={5} cy={19} r={2} fill={color.muted} />
    </Svg>
  );
}

export function RunCard({ run, dateLabel, sessionLabel }: RunCardProps) {
  const eyebrow = sessionLabel ? `${dateLabel} · ${sessionLabel}` : dateLabel;
  // Null when there is no distance or no duration to divide. A pace that was
  // never run is absent, and absent is dashed — never a stand-in "0:00 /mi".
  const pace = formatPace(run.durationS, run.km);

  return (
    <Card>
      <Text style={styles.eyebrow}>{eyebrow}</Text>

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
            <Stat label="DISTANCE" value={formatDistance(run.km)} />
          </View>
          <View style={styles.stat}>
            <Stat label="TIME" value={formatDuration(run.durationS)} />
          </View>
          <View style={styles.stat}>
            {pace === null ? (
              <Absent eyebrow="PACE" />
            ) : (
              <Stat label="PACE" value={pace} />
            )}
          </View>
        </View>
      </View>

      {run.spike ? (
        <View style={styles.spike}>
          <Advisory
            flag="unusual"
            reason={`This run was ${formatDistance(
              run.spike.km - run.spike.longestKm,
            )} longer than your recent long runs.`}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...text.micro,
    lineHeight: runCardMetrics.eyebrowLine,
    color: color.muted,
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
  spike: { marginTop: runCardMetrics.spikeGap },
});
