/**
 * The week's mileage against its target.
 *
 * Mirrors the web portal's "Weekly mileage" panel
 * (`website/src/components/athlete/tabs.tsx`, `Panel` + the bar at 241–258):
 * same figures, same 115% threshold, same warning sentence, so the two surfaces
 * never disagree about what the athlete is looking at.
 *
 * What does NOT come across is the decoration. The web bar is an `--ember`
 * gradient with a `box-shadow` glow; here the fill is flat `accent` on an
 * `accentSoft` track, one radius from the scale, no shadow and no elevation.
 *
 * The payload is KILOMETRES on both figures; every printed distance goes
 * through lib/units with "mi" welded into the same text node.
 *
 * The bar is decorative — it restates a percentage that is already written out
 * a line below it — so it is hidden from assistive tech and the text carries
 * the whole meaning.
 */
import { StyleSheet, Text, View } from "react-native";

import { Card } from "./Card";
import { Absent } from "./Nothing";
import { fmtMiles } from "../lib/units";
import { radius, space } from "../theme/space";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";

/**
 * Past this, the fill turns `watch` and the caption says so. The website's
 * number, deliberately — a threshold that drifts between the two surfaces is a
 * threshold the athlete cannot trust.
 */
const WATCH_PCT = 115;

/** Track height, from the 4px scale. */
const BAR_HEIGHT = space.md;

export type WeekProgressProps = {
  /** KILOMETRES — `Profile["risk"]["weekKm"]`. */
  weekKm: number;
  /**
   * KILOMETRES. Null when the athlete has no target on file; zero is treated
   * the same way, because a target of zero yields no percentage either.
   */
  weeklyTargetKm: number | null;
};

export function WeekProgress({ weekKm, weeklyTargetKm }: WeekProgressProps) {
  const hasTarget =
    weeklyTargetKm !== null &&
    Number.isFinite(weeklyTargetKm) &&
    weeklyTargetKm > 0;

  // The printed percentage is uncapped and the bar's is not — the website's
  // behaviour: a bar that can only ever fill is honest about running out of
  // room, while the sentence stays honest about the actual number.
  const rawPct = hasTarget
    ? Math.round((weekKm / (weeklyTargetKm as number)) * 100)
    : null;
  const over = rawPct !== null && rawPct > WATCH_PCT;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title}>Weekly mileage</Text>
        {/* Both figures carry "mi" in their own node. The website prints the
            unit once, after the target; here the first numeral would be left
            bare, which non-negotiable #3 forbids. */}
        <Text style={styles.note}>
          <Text style={styles.noteFigure}>{fmtMiles(weekKm)}</Text>
          {hasTarget ? (
            <>
              {" of "}
              <Text style={styles.noteFigure}>
                {fmtMiles(weeklyTargetKm as number)}
              </Text>
              {" target"}
            </>
          ) : null}
        </Text>
      </View>

      {rawPct === null ? (
        <View style={styles.body}>
          <Absent label="No weekly target set" />
        </View>
      ) : (
        <View style={styles.body}>
          <View
            style={styles.track}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <View
              style={[
                styles.fill,
                { width: `${Math.min(100, rawPct)}%` },
                over && styles.fillOver,
              ]}
            />
          </View>

          <Text style={[styles.caption, over && styles.captionOver]}>
            <Text style={styles.captionFigure}>{`${rawPct}%`}</Text>
            {" of weekly target"}
            {over
              ? " — well over plan, this is the spike RunGuard is flagging"
              : ""}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted },
  /** Nested in prose: inherits the meta size and colour, contributes the mono
   *  face and tabular figures every numeral in this app is required to have. */
  noteFigure: { fontFamily: font.mono, ...tabular },
  body: { marginTop: space.md },
  track: {
    height: BAR_HEIGHT,
    backgroundColor: color.accentSoft,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  /** Flat. No gradient, no glow — the web panel's ember does not come across. */
  fill: {
    height: "100%",
    backgroundColor: color.accent,
    borderRadius: radius.control,
  },
  fillOver: { backgroundColor: color.watch },
  caption: { ...text.meta, color: color.muted, marginTop: space.sm },
  captionOver: { color: color.watch },
  captionFigure: { fontFamily: font.mono, ...tabular },
});

export default WeekProgress;
