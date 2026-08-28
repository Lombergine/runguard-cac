/**
 * The check-in, as a card you tap rather than a screen you fill in.
 *
 * The design study's Home opens with this: a compact ember slab about 120pt
 * tall — eyebrow, question, "Two taps ›" — that opens the real check-in in a
 * sheet. What it replaces is the full-viewport white card the app shipped,
 * whose deliberate emptiness read on an iPhone 17 as content that had failed to
 * load: roughly 460pt of nothing between the question and its answers.
 *
 * ── THIS IS STILL THE HERO ──────────────────────────────────────────────────
 *
 * The product thesis has not moved: the check-in is the first thing on the home
 * screen because ~10 of 14 athletes do not report, and readiness is ~55%
 * self-report. What changes is how that priority is spent. Filling the viewport
 * is one way to say "this is the important thing"; being the only ember on an
 * otherwise calm screen is another, and it leaves room for the day underneath
 * it — which is what an athlete opening the app at 6am actually wants to see.
 *
 * The ember is the argument. It is the one saturated surface on Home, and the
 * spec rations colour to roughly three appearances per screen; this spends one
 * of them on the single action the product needs.
 *
 * INK on the gradient, never white: white on the lightest stop is 1.67:1, ink
 * never drops below 5.97:1. Pressing drops the gradient to the flat
 * `brandStrong` ground beneath — the idiom `login.tsx`, `welcome.tsx` and the
 * check-in's own Done button already share, and the fallback if the gradient
 * fails to draw.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";

import { color } from "../theme/tokens";
import { layout, radius, ruleWidth, space } from "../theme/space";
import { font, text } from "../theme/type";

/** The website's `--ember` stops and its 135°, as everywhere else. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/** Same 24-unit grid and rule weight as the tab bar's glyphs. */
const GRID = 24;
const CHEVRON_SIZE = 18;

export type CheckInPromptProps = {
  /**
   * Pre-formatted local day, e.g. "Thu 27 Aug" — never derived here.
   * Non-negotiable #2: a component does not know what day it is.
   */
  dateLabel: string;
  onPress: () => void;
};

export function CheckInPrompt({ dateLabel, onPress }: CheckInPromptProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Check in before practice, ${dateLabel}. Two taps.`}
      style={styles.card}
    >
      {({ pressed }) => (
        <>
          {pressed ? null : (
            <LinearGradient
              colors={color.ember}
              locations={EMBER_STOPS}
              start={EMBER_START}
              end={EMBER_END}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.body}>
            <Text style={styles.eyebrow}>{`Before practice · ${dateLabel}`}</Text>
            <Text style={styles.question}>Anything sore?</Text>
            <View style={styles.cue}>
              <Text style={styles.cueLabel}>Two taps</Text>
              <Svg
                width={CHEVRON_SIZE}
                height={CHEVRON_SIZE}
                viewBox={`0 0 ${GRID} ${GRID}`}
              >
                <Path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke={color.ink}
                  strokeWidth={(ruleWidth * GRID) / CHEVRON_SIZE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    /* 18, between `card` and the grouped list's `group` — the design gives the
       one ember surface a softer corner than the cards around it. */
    borderRadius: 18,
    borderCurve: "continuous",
    overflow: "hidden",
    /* The flat ground the press reveals, and the fallback if the gradient never
       draws — either way the label keeps a real background. */
    backgroundColor: color.brandStrong,
  },
  body: { padding: layout.cardPadding + space.xs },
  /**
   * Ink at 62%, the design's own value. Not `muted`: that token is tuned for
   * the cream page, and on the ember it would be a different, muddier grey.
   */
  eyebrow: { ...text.micro, color: "rgba(34,29,21,0.62)" },
  question: {
    ...text.title,
    fontFamily: font.displayExtra,
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.4,
    color: color.ink,
    marginTop: space.sm,
  },
  cue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
  },
  cueLabel: { ...text.baseSemi, color: color.ink },
});

export default CheckInPrompt;
