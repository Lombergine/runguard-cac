/**
 * Four weeks of daily training load, as a thumbnail. The roster's "last 4
 * weeks" column, which the website draws with recharts and this draws with the
 * same SVG primitives everything else in this app uses.
 *
 * ── WHAT IT DOES AND DOES NOT CLAIM ────────────────────────────────────────
 * There is no axis, no scale and no number, because at this size it cannot
 * honestly carry one. It answers a shape question — is this athlete's training
 * steady, ramping, or full of holes — and the real figures are one tap away on
 * their own screen. That is also why it is NOT normalised across athletes: each
 * bar is scaled to that athlete's own peak, so a tall bar means "big day FOR
 * THEM", never "bigger than the runner above". Comparing runners by bar height
 * would be a ranking, and this product does not rank athletes.
 *
 * ── A ZERO IS A BAR, AN ABSENCE IS NOT ─────────────────────────────────────
 * A rest day has load 0 and draws a baseline tick — a fact, drawn. A day the
 * server never sent simply is not in the array and leaves a gap. The two must
 * not look alike, which is the same rule `Nothing.tsx` enforces at full size.
 *
 * With no points at all the component renders nothing rather than an empty
 * frame: an axis with no data in it reads as "flat", and flat is a claim.
 *
 * ── WHY THE BARS ARE NEUTRAL, NOT `series1` ────────────────────────────────
 * The app's `Bars` mark defaults to the blue `series1`, which is right inside a
 * chart panel an athlete opened on purpose. It is wrong here. Colour is
 * rationed in this product — "maybe three times per screen: on the thing you
 * tap, on a status dot, on the body map" — and fourteen blue thumbnails stacked
 * down a roster would be the loudest thing on the coach's triage screen while
 * carrying no state at all. `ruleStrong` is the neutral the website uses for
 * the same chart (translucent ink rather than a hue), so the ember stays the
 * only colour that means something.
 */
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { color } from "../theme/tokens";

/** Drawn height. Small enough to sit inside a roster row without crowding it. */
const HEIGHT = 34;
/** A zero day still gets this many points of bar, so rest is visible. */
const ZERO_TICK = 1.5;

export function LoadSpark({
  data,
  width = 96,
}: {
  data: { date: string; load: number }[];
  width?: number;
}) {
  if (data.length === 0) return null;

  // Scaled to THIS athlete's peak — see the header on why not a shared scale.
  const peak = Math.max(...data.map((d) => d.load), 0);

  // Bars share the width with a hairline gap; at 28 points on a phone the gap
  // is sub-pixel, so it is expressed as a fraction of the slot rather than a
  // fixed inset that would round away to nothing.
  const slot = width / data.length;
  const barW = Math.max(1, slot * 0.62);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no">
      <Svg width={width} height={HEIGHT}>
        {data.map((d, i) => {
          // peak === 0 means every day in the window was rest. Every bar is
          // then the zero tick, which is the truthful picture: a flat row of
          // recorded rest, not an empty chart.
          const h = peak > 0 ? Math.max(ZERO_TICK, (d.load / peak) * HEIGHT) : ZERO_TICK;
          return (
            <Rect
              key={d.date}
              x={i * slot + (slot - barW) / 2}
              y={HEIGHT - h}
              width={barW}
              height={h}
              rx={0.5}
              fill={color.ok}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export default LoadSpark;
