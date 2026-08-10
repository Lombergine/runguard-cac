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
import { ruleWidth, space } from "../theme/space";
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
 * The geometry of a spike-free card's content box, exported for the run-log
 * skeleton alone. `statsRow` is enforced as a `minHeight` below, so the
 * reservation holds regardless of how Stat measures internally.
 */
export const runCardMetrics = {
  eyebrowLine: MICRO_LINE,
  gap: space.md,
  statsRow: MICRO_LINE + space.xs + (text.stat.lineHeight ?? 0),
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
  spike: { marginTop: space.md },
});
