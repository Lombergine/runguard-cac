/**
 * The week's mileage against its target.
 *
 * Mirrors the web portal's "Weekly mileage" panel
 * (`website/src/components/athlete/tabs.tsx`, `Panel` + the bar at 241–258):
 * same figures, same 115% threshold, same warning sentence, so the two surfaces
 * never disagree about what the athlete is looking at.
 *
 * Under sunrise the bar IS the web bar: the `color.ember` gradient (the CSS
 * `linear-gradient(135deg, …)` at 0/45/100%, drawn corner to corner) on a
 * `surface3` track. This is the screen's one ember signature — the brand doing
 * the energy work on the one element that is genuinely about effort. The web
 * panel's `box-shadow` glow still does not come across: a glow is emphasis, and
 * the only elevation in this app is `shadow.card` on a card.
 *
 * Past the threshold the gradient is replaced by a FLAT `watch` fill. Flat
 * versus graded is a difference in shape, not only in hue, so the two states
 * stay apart in greyscale — and the ember is the brand, which must not be the
 * thing that says "over plan".
 *
 * The payload is KILOMETRES on both figures; every printed distance goes
 * through lib/units with "mi" welded into the same text node.
 *
 * The bar is decorative — it restates a percentage that is already written out
 * a line below it — so it is hidden from assistive tech and the text carries
 * the whole meaning.
 */
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Panel } from "./Panel";
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

/**
 * The website's stop positions (`--ember`: 0% / 45% / 100%) and its 135°, which
 * in CSS points down-and-right — so the gradient runs corner to corner. On a bar
 * this shallow that reads as left-to-right, which is the direction the fill
 * grows in, and the hottest stop lands at the leading edge.
 */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

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
    <Panel
      title="Weekly mileage"
      /* Both figures carry "mi" in their own node. The website prints the unit
         once, after the target; here the first numeral would be left bare,
         which non-negotiable #3 forbids. */
      note={
        <>
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
        </>
      }
    >

      {rawPct === null ? (
        <View>
          <Absent label="No weekly target set" />
        </View>
      ) : (
        <View>
          <View
            style={styles.track}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {over ? (
              <View
                style={[
                  styles.fill,
                  styles.fillOver,
                  { width: `${Math.min(100, rawPct)}%` },
                ]}
              />
            ) : (
              <LinearGradient
                colors={color.ember}
                locations={EMBER_STOPS}
                start={EMBER_START}
                end={EMBER_END}
                style={[styles.fill, { width: `${Math.min(100, rawPct)}%` }]}
              />
            )}
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
    </Panel>
  );
}

const styles = StyleSheet.create({
  /** Nested in prose: inherits the meta size and colour, contributes the mono
   *  face and tabular figures every numeral in this app is required to have. */
  noteFigure: { fontFamily: font.mono, ...tabular },
  track: {
    height: BAR_HEIGHT,
    backgroundColor: color.surface3,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  /** Geometry only — the ground is the ember gradient, or `fillOver` below. */
  fill: {
    height: "100%",
    borderRadius: radius.control,
  },
  /** Flat, so over-plan differs from the gradient in more than hue. */
  fillOver: { backgroundColor: color.watch },
  caption: { ...text.meta, color: color.muted, marginTop: space.sm },
  /** `watchText`, not `watch`: this is a glyph. 5.17:1 on card, vs 2.98:1. */
  captionOver: { color: color.watchText },
  captionFigure: { fontFamily: font.mono, ...tabular },
});

export default WeekProgress;
