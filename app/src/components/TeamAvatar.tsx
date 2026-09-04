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

import { useIsDark } from "../theme/tokens";
import { ruleWidth } from "../theme/space";
import { font } from "../theme/type";

/**
 * One set per theme, because these are computed colours and there is no token
 * to make dynamic.
 *
 * The original numbers were verified against white only: a 91%-lightness fill
 * with 28%-lightness initials is right on paper and, on the #0A0D12 ground the
 * coach roster actually renders on, a row of bright blobs. Dark keeps the hue
 * and inverts the relationship — a deep fill carrying light initials — so the
 * avatar reads as a token of the athlete rather than the loudest thing on the
 * screen.
 */
const LIGHT = { fillS: 50, fillL: 91, inkS: 55, inkL: 28, edgeS: 45, edgeL: 80 };
const DARK = { fillS: 38, fillL: 26, inkS: 62, inkL: 78, edgeS: 34, edgeL: 36 };

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
  const tone = useIsDark() ? DARK : LIGHT;
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `hsl(${hue}, ${tone.fillS}%, ${tone.fillL}%)`,
          borderColor: `hsl(${hue}, ${tone.edgeS}%, ${tone.edgeL}%)`,
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
          { fontSize: size * 0.38, color: `hsl(${hue}, ${tone.inkS}%, ${tone.inkL}%)` },
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
