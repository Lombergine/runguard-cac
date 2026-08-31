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
 *
 * ── AND THE INK IS `staticColor`, NOT `color` ───────────────────────────────
 *
 * Every glyph on this card reads against the ember gradient, and
 * `LinearGradient` needs its stops as real strings — so `color.ember` is one
 * of the few tokens `tokens.ts` deliberately does NOT wrap in
 * `DynamicColorIOS`. The gradient therefore does not change with the system
 * appearance. `color.ink` does: it resolves to #F6F2EB in dark mode, which is
 * the near-white this file's own paragraph above rules out at 1.67:1 on the
 * lightest stop. The card was rendering its question, its affordance line and
 * its chevron in exactly that.
 *
 * So the three foreground values come from `staticColor`, whose whole purpose
 * is "a place a dynamic colour cannot go". Measured against stop 0 (#FBBF24),
 * the lightest ground any of them sits on:
 *
 *     staticColor.ink   #221D15   12.4:1     question, affordance, chevron
 *     staticColor.ink2  #55503F    4.83:1    eyebrow
 *
 * The eyebrow was `rgba(34,29,21,0.62)`, the design's own value, which
 * composites over that stop to #755B1B — **3.85:1**, under the floor. `ink2`
 * is the same intent (a dark tint, subordinate to the question) at a ratio the
 * app has actually measured, and it is a token rather than a literal.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Chevron } from "./List";
import { color, shadow, staticColor } from "../theme/tokens";
import { layout, radius, space } from "../theme/space";
import { text } from "../theme/type";

/** The website's `--ember` stops and its 135°, as everywhere else. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

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
              {/*
                `List`'s exported chevron, not a sixth local copy of the path —
                the whole point of exporting it (see its note there, and the
                "One chevron, not four" commit). The design draws every
                disclosure chevron at 18, which is what that component is.
                Stroked in the card's own ink rather than the neutral
                `chevronStroke`, because here it is part of an affordance line
                on a saturated ground, not chrome pointing at a list row.
              */}
              <Chevron stroke={staticColor.ink} />
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    /* `hero`: between `card` and the grouped list's `group` — the design gives
       its two hero surfaces a softer corner than the cards around them. */
    borderRadius: radius.hero,
    borderCurve: "continuous",
    overflow: "hidden",
    /* The flat ground the press reveals, and the fallback if the gradient never
       draws — either way the label keeps a real background. */
    backgroundColor: color.brandStrong,
    /**
     * The design gives this card a coloured glow. It does not ship: a glow is
     * emphasis, and `tokens.ts` is explicit that "a shadow is elevation, never
     * emphasis" — the same call `WeekProgress` and `TodayBlock` already
     * recorded against the web panels they ported. What the design is right
     * about is that the card is RAISED, so it takes `shadow.card`, the one
     * elevation this app has, exactly as every other surface does.
     */
    ...shadow.card,
  },
  /* 20: the design's padding, composed from the scale rather than written as a
     number — `cardPadding` (16) plus one step. */
  body: { padding: layout.cardPadding + space.xs },
  /**
   * A dark tint, subordinate to the question, that does NOT follow the system
   * appearance — see the header for the measurement.
   *
   * `text.micro` IS the design's eyebrow now — sans 600 13, +0.06em, uppercase.
   * This comment used to argue for the app's mono rank instead; ledger row 1 is
   * retired and the rank took the design's values, so there is nothing left to
   * argue.
   */
  eyebrow: { ...text.micro, color: staticColor.ink2 },
  question: { ...text.promptCard, color: staticColor.ink, marginTop: space.sm },
  cue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
  },
  cueLabel: { ...text.baseSemi, color: staticColor.ink },
});

export default CheckInPrompt;
