/**
 * An athlete's initials in a coloured circle. The coach side's only "portrait".
 *
 * INITIALS, NEVER A PHOTOGRAPH. The spec is explicit — "initials in circles
 * instead of photos" — and on a coach's roster of minors that is not a style
 * preference. There is no image field on the wire and there should not be one.
 *
 * ── THE COLOUR IS PER ATHLETE, AND IT IS MEASURED ──────────────────────────
 * `hue` is the athlete's own `avatar_hue`, the same value the website's
 * `Avatar` uses, so a coach who learns a face-colour on the dashboard sees the
 * same one in the app. The website expresses it in `oklch()`, which React
 * Native cannot parse, so this is the HSL equivalent — and HSL lightness is NOT
 * perceptually uniform across hue, so the values below could not be eyeballed
 * from the web ones.
 *
 * Measured across all 360 hues at 5° steps, initials on their own fill:
 *
 *     bg hsl(h,60%,88%) · fg hsl(h,45%,34%)   worst 3.78 at hue 60   FAIL
 *     bg hsl(h,55%,90%) · fg hsl(h,50%,30%)   worst 4.46 at hue 60   FAIL
 *     bg hsl(h,50%,91%) · fg hsl(h,55%,28%)   worst 4.75 at hue 60   PASS
 *
 * Yellow is the worst case every time, which is exactly why a single spot-check
 * at one hue would have shipped a failing set. The third row is what is used.
 * Changing any of these four numbers means re-running that sweep.
 */
import { StyleSheet, Text, View } from "react-native";

import { ruleWidth } from "../theme/space";
import { font } from "../theme/type";

/** Verified across every hue — see the header before changing these. */
const FILL_S = 50;
const FILL_L = 91;
const INK_S = 55;
const INK_L = 28;
const EDGE_S = 45;
const EDGE_L = 80;

/** Up to two initials. A single-word name gives one, never a blank. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TeamAvatar({
  name,
  hue,
  size = 40,
}: {
  name: string;
  hue: number;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `hsl(${hue}, ${FILL_S}%, ${FILL_L}%)`,
          borderColor: `hsl(${hue}, ${EDGE_S}%, ${EDGE_L}%)`,
        },
      ]}
      // Decoration: the name is always rendered beside this, so a screen reader
      // announcing the initials too would just repeat it.
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text
        style={[
          styles.text,
          { fontSize: size * 0.38, color: `hsl(${hue}, ${INK_S}%, ${INK_L}%)` },
        ]}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: ruleWidth,
    flexShrink: 0,
  },
  text: { fontFamily: font.bodySemi },
});

export default TeamAvatar;
