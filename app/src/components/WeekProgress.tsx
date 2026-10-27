/**
 * The week's mileage against its target — the design's "This week" card.
 *
 * One card: a row naming the figure and carrying it on the right, the bar, and
 * the caption. The eyebrow above it is NOT drawn here; it belongs to `Section`,
 * which the screen owns, so that the screen can swap this card for an `Absent`
 * under the same label. That is why this is a `Card` and no longer a `Panel` —
 * a panel puts its title INSIDE, which is the shape for a card that is one
 * object with a caveat, and the design has moved the label outside.
 *
 * The figures still mirror the web portal's "Weekly mileage" panel
 * (`website/src/components/athlete/tabs.tsx`, `Panel` + the bar at 241–258):
 * same numbers, same 115% threshold, same warning sentence, so the two surfaces
 * never disagree about what the athlete is looking at.
 *
 * The bar IS the web bar: the `color.ember` gradient (the CSS
 * `linear-gradient(135deg, …)` at 0/45/100%, drawn corner to corner) on the
 * design's `--fill-strong` track. This is the screen's one ember signature
 * besides the check-in card — the brand doing the energy work on the one
 * element that is genuinely about effort. The web panel's `box-shadow` glow
 * still does not come across: a glow is emphasis, and the only elevation in
 * this app is `shadow.card` on a card.
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

/**
 * Track height. The design draws 10; `space.md` is the 4px scale's step next to
 * it, and `app/CLAUDE.md` makes the theme the single source — a one-off 10
 * would weld a bar's geometry to nothing.
 */
const BAR_HEIGHT = space.md;

/**
 * The website's stop positions (`--ember`: 0% / 45% / 100%) and its 135°, which
 * in CSS points down-and-right — so the gradient runs corner to corner. On a bar
 * this shallow that reads as left-to-right, which is the direction the fill
 * grows in, and the hottest stop lands at the leading edge.
 */

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
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Weekly mileage</Text>
        {/*
          The design sets this "14.9 / 21.7 mi", with the unit spent once at the
          end. Both figures carry their own "mi" here: non-negotiable #3 forbids
          a bare numeral beside a unit that lives elsewhere in the layout, and
          the first figure would be exactly that.
        */}
        <Text style={styles.figures}>
          {hasTarget
            ? `${fmtMiles(weekKm)} / ${fmtMiles(weeklyTargetKm as number)}`
            : fmtMiles(weekKm)}
        </Text>
      </View>

      {rawPct === null ? (
        <Absent label="No weekly target set" />
      ) : (
        <>
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
              <View
                style={[styles.fill, styles.fillOn, { width: `${Math.min(100, rawPct)}%` }]}
              />
            )}
          </View>

          <Text style={[styles.caption, over && styles.captionOver]}>
            <Text style={styles.captionFigure}>{`${rawPct}%`}</Text>
            {" of weekly target"}
            {over
              ? ", well over plan, this is the spike RunGuard is flagging"
              : ""}
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  /** Layout only — `Card` owns the ground, the corner, the rule and the shadow. */
  card: { gap: space.md },
  /**
   * `alignItems: "baseline"` so the label and its figure sit on one line at
   * different sizes, and `flexWrap` so a long pair drops rather than crushing
   * the label — the website's flex rules, and `Panel`'s.
   */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { ...text.base, color: color.ink },
  /**
   * The design's 15px tabular figure. `text.statInline` (14 mono) is the app's
   * rank for a figure that sits subordinate to the words beside it; mono runs
   * wider than sans, so matching the design's size rather than its measure
   * would overshoot the label it has to stay under. See type.ts.
   */
  figures: { ...text.statInline, color: color.muted, flexShrink: 1 },
  track: {
    height: BAR_HEIGHT,
    /* The design's `--fill-strong` — one of Apple's neutral system fills, which
       is what makes an inert track read as a system control rather than a drawn
       rectangle. See the note on `color.fill` in tokens.ts. */
    backgroundColor: color.fillStrong,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  /** Geometry only — the ground is the ember gradient, or `fillOver` below. */
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  /** Flat, so over-plan differs from the gradient in more than hue. */
  fillOn: { backgroundColor: color.brand },
  fillOver: { backgroundColor: color.watch },
  caption: { ...text.meta, color: color.muted },
  /** `watchText`, not `watch`: this is a glyph. 5.17:1 on card, vs 2.98:1. */
  captionOver: { color: color.watchText },
  captionFigure: { fontFamily: font.mono, ...tabular },
});

export default WeekProgress;
