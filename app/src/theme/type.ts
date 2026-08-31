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
  /**
   * The mono at 600, for the one place a mono rank has to carry weight rather
   * than colour: the focused tab label. The design sets 600 against 400 there
   * (`RunGuard iOS App copy.dc.html:1862`) so the current tab is legible
   * without its accent — `visual-spec.md` §5, colour last.
   *
   * A weight, not a second face: `fontWeight` on a custom family synthesises
   * badly on iOS, so the real cut is registered in `_layout.tsx` and named here.
   */
  monoSemi: "SplineSansMono_600SemiBold",
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
   * 13 semibold sans, uppercase, +0.06em — micro-labels and eyebrows.
   *
   * THE DESIGN'S OWN RANK, and by some distance its most-used: `600 13px` with
   * `letter-spacing:0.06em` appears 23 times, more than any other declaration
   * except the body. This was 11.5 MONO at +0.12em, and the reason recorded
   * for that was internal consistency — "every other eyebrow in the app is
   * already the mono micro role". True, and not a rule. Under the standard the
   * app is now held to, matching itself is not a reason to differ from the
   * design.
   *
   * `tabular` stays. An eyebrow occasionally carries a count ("14 ATHLETES"),
   * and figures in this app do not jitter.
   *
   * `lineHeight` is explicit because skeletons reserve height from these
   * numbers. Without it, callers guessed: CheckInCard used fontSize + space.xs
   * and RunCard used round(fontSize * 1.4), so two reserved heights disagreed
   * by half a point and neither matched what actually rendered.
   */
  micro: {
    fontFamily: font.bodySemi,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.06 * 13,
    textTransform: "uppercase",
    ...tabular,
  } as TextStyle,

  /** 13.5 body — the design's secondary line (18 uses). Metadata, reasons. */
  meta: {
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 20,
  } as TextStyle,

  /**
   * 17 body — the base size, and the design's own (`400 17px`, 31 uses, more
   * than any other declaration it makes). The app had 16.5, chosen to be "one
   * step larger than a normal mobile app"; the design agrees and is half a
   * point larger still.
   */
  base: {
    fontFamily: font.body,
    fontSize: 17,
    lineHeight: 24,
  } as TextStyle,

  /** 17 body, semibold — the design's `600 17px`. Emphasis, control labels. */
  baseSemi: {
    fontFamily: font.bodySemi,
    fontSize: 17,
    lineHeight: 24,
  } as TextStyle,

  /** 19 display — card titles. */
  title: {
    fontFamily: font.displayBold,
    fontSize: 19,
    lineHeight: 24,
  } as TextStyle,

  /**
   * 16.5 mono — a figure that IS the line, at body rank.
   *
   * The mono ladder had a hole in the middle: `statInline` (14) sits under
   * something, `stat` (22) is the figure a screen is about, and a list row
   * whose primary line is entirely figures — "8.7 mi · 1:12:40 · 8:21/mi" —
   * is neither. Borrowing `statInline` shrank the row's own subject below the
   * date beneath it; borrowing `stat` made every run in a scrolling log shout.
   *
   * 16.5 is `base`'s size, so a mono row and a prose row sit on one optical
   * rank. The design sets this line at 17 sans; mono runs wider, so matching
   * its size rather than its measure would overshoot.
   */
  statBase: {
    fontFamily: font.mono,
    fontSize: 16.5,
    lineHeight: 24,
    ...tabular,
  } as TextStyle,

  /**
   * 14 mono — a figure that sits UNDER the thing it describes.
   *
   * The gap this fills: between `micro` (11.5, uppercase, an eyebrow) and
   * `stat` (22, a figure a screen is about) there was no mono rank at all, so
   * a subordinate figure had to borrow `stat` and then outshouted the title
   * above it — a plan row read "5 mi @ 8:10 /mi" louder than "Easy run", which
   * inverts what the row is for.
   *
   * The design sets this line at 13.5 sans. Mono at the same size runs wider,
   * so 14 with `meta`'s 20 leading holds the same optical weight while keeping
   * the rule that every numeral in this app is mono and tabular.
   */
  statInline: {
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: 20,
    ...tabular,
  } as TextStyle,

  /**
   * 24 mono — the tile figure. The design's `700 24px`.
   *
   * Its size, kept in the app's mono face rather than its sans: the size is the
   * design's decision and the face is what makes a COLUMN of figures line up.
   * That is the one carve-out in the type pass, and it is functional rather
   * than taste — a stat grid and a calendar depend on digits being one width.
   */
  stat: {
    fontFamily: font.mono,
    fontSize: 24,
    lineHeight: 30,
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
   * NEGATIVE tracking, and is reserved for the check-in question and nothing
   * else. A nav title is chrome and a check-in question is the thing the whole
   * app exists to ask, so they must not be the same object — 700 versus 800,
   * and -0.6 against -0.68, keeps the question the louder of the two even at
   * identical size. That margin is now thin, and deliberately so: the design
   * sets its own nav title at `-0.6px` (`:229`) and this used +0.4.
   *
   * The old value was iOS's own tracking for a large title, on the argument
   * that Archivo at 34 is already tighter than SF Pro Display and letting it
   * set solid reads as a headline rather than as navigation. A fair reading,
   * and still only a reading — the design draws the title it wants, and under
   * the current standard that settles it.
   */
  largeTitle: {
    fontFamily: font.displayBold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.6,
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

  /**
   * 27 display 800, -0.4 — the question ON the ember card.
   *
   * `prompt` above is the same question when it IS the screen (the check-in
   * sheet). On Home it sits inside a card with a section below it, and the
   * design sizes it down accordingly: `700 27px/1.15, letter-spacing:-0.4px`
   * (`RunGuard iOS App copy.dc.html:242`).
   *
   * A rank rather than three literals in `CheckInPrompt`: it was carrying
   * `fontSize: 27, lineHeight: 31, letterSpacing: -0.4` inline, which
   * `app/CLAUDE.md` rules out — "never hardcode a colour, size, or spacing
   * value in a component" — and which meant the design's number lived somewhere
   * no audit of the type scale would ever find it.
   */
  promptCard: {
    fontFamily: font.displayExtra,
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.4,
  } as TextStyle,
} as const;

export type TextRole = keyof typeof text;
