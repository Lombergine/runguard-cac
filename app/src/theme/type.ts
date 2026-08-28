/**
 * Type. See ../../../docs/visual-spec.md.
 *
 * Two typographic voices: friendly sentences, precise figures.
 *   Display — Archivo 700/800      headings, card titles, athlete name
 *   Body    — Source Sans 3 400/600 all prose and labels
 *   Mono    — Spline Sans Mono 500  EVERY numeral, tabular-nums mandatory
 *
 * The scale is one step larger than a normal mobile app throughout.
 *
 * Rule: if it is a number, it is mono. No exceptions — that split is what makes
 * figures read as a different kind of thing from prose.
 */
import { TextStyle } from "react-native";

/** Font family keys as registered by useFonts() in the root layout. */
export const font = {
  displayBold: "Archivo_700Bold",
  displayExtra: "Archivo_800ExtraBold",
  body: "SourceSans3_400Regular",
  bodySemi: "SourceSans3_600SemiBold",
  mono: "SplineSansMono_500Medium",
} as const;

/**
 * Every numeral must carry this. Without tabular figures, columns of stats
 * jitter as values change.
 */
export const tabular: TextStyle = {
  fontVariant: ["tabular-nums"],
};

/**
 * The six-step scale. Named by role, not size, so a component never picks a
 * number.
 */
export const text = {
  /**
   * 11.5 mono, uppercase, +0.12em — micro-labels and eyebrows.
   *
   * `lineHeight` is explicit because skeletons reserve height from these
   * numbers. Without it, callers guessed: CheckInCard used fontSize + space.xs
   * (15.5) and RunCard used round(fontSize * 1.4) (16), so two reserved heights
   * disagreed by half a point and neither matched what actually rendered.
   */
  micro: {
    fontFamily: font.mono,
    fontSize: 11.5,
    lineHeight: 16,
    letterSpacing: 0.12 * 11.5,
    textTransform: "uppercase",
    ...tabular,
  } as TextStyle,

  /** 14 body — secondary metadata, advisory reason lines. */
  meta: {
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,

  /** 16.5 body — the base size. */
  base: {
    fontFamily: font.body,
    fontSize: 16.5,
    lineHeight: 24,
  } as TextStyle,

  /** 16.5 body, semibold — emphasis within prose, control labels. */
  baseSemi: {
    fontFamily: font.bodySemi,
    fontSize: 16.5,
    lineHeight: 24,
  } as TextStyle,

  /** 19 display — card titles. */
  title: {
    fontFamily: font.displayBold,
    fontSize: 19,
    lineHeight: 24,
  } as TextStyle,

  /** 22 mono — inline stats. */
  stat: {
    fontFamily: font.mono,
    fontSize: 22,
    lineHeight: 28,
    ...tabular,
  } as TextStyle,

  /**
   * 28 mono — the ONE figure a screen is actually about.
   *
   * `stat` at 22 was the only figure size, so readiness (the point of the home
   * screen after a check-in) was 3pt larger than the word "Readiness" printed
   * beside it at 19 — no size advantage over its own label. This is the step
   * that lets a hero figure lead. Reach for it once per screen; a second one
   * makes both ordinary again.
   */
  statLarge: {
    fontFamily: font.mono,
    fontSize: 28,
    lineHeight: 34,
    ...tabular,
  } as TextStyle,

  /**
   * 28 display 800 — a screen whose whole job is one sentence.
   *
   * Deliberately NOT `prompt`: that role is the check-in question and nothing
   * else, and spending it on a welcome headline would put the app's loudest
   * type on the one screen an athlete sees once. Same 28 as `statLarge`, so the
   * display and figure voices share an optical rank.
   */
  display: {
    fontFamily: font.displayExtra,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.02 * 28,
  } as TextStyle,

  /**
   * 34 display 700, +0.4 — the iOS large-title navigation rank.
   *
   * This is the collapsing title the native stack draws above a scrolled
   * screen (see theme/header.ts), NOT a role a screen sets on a `Text`. It
   * exists so that title stays in the app's own display face instead of
   * falling back to SF Pro the moment the header is asked for a large one —
   * the app would then carry two display voices, one of them Apple's.
   *
   * DISTINCT FROM `prompt`, which is also 34: prompt is display-800 with
   * NEGATIVE tracking and is reserved for the check-in question and nothing
   * else. A nav title is chrome and a check-in question is the thing the whole
   * app exists to ask, so they must not be the same object — 700 versus 800
   * and +0.4 versus -0.68 keeps the question the louder of the two even at
   * identical size.
   *
   * The positive tracking is iOS's own for a large title: Archivo at 34 is
   * tighter than SF Pro Display, and letting it set solid makes the title read
   * as a headline rather than as navigation.
   */
  largeTitle: {
    fontFamily: font.displayBold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: 0.4,
  } as TextStyle,

  /**
   * 30–40 display 800, -0.02em — the check-in prompt, and nothing else.
   * Sized at 34 to sit mid-range and survive Dynamic Type scaling at 360px.
   */
  prompt: {
    fontFamily: font.displayExtra,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.02 * 34,
  } as TextStyle,
} as const;

export type TextRole = keyof typeof text;
