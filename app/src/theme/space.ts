/**
 * Space, stance and motion. See ../../../docs/visual-spec.md.
 *
 * Everything is one step larger than a normal mobile app: the primary use is
 * 6am, one hand, arm's length, possibly in cold or glare. It should feel
 * slightly oversized on a desk and exactly right at arm's length.
 */

import { StyleSheet } from "react-native";

/** 4px scale. Use these names, not raw numbers. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Page-level metrics, taken from the design rather than from the 4px scale.
 *
 * These are not scale STEPS and must not be treated as interchangeable with
 * `space.*`. They are the four numbers the design's phone frame actually uses
 * for its scrolling page — its scroller is `padding: 0 0 20px` and the content
 * wrapper inside it is `padding: 14px 16px 0` with `gap: 22px` (line 233 and
 * 236 of `RunGuard iOS App copy.dc.html`). Three of those — 14, 16 and 22 — are
 * off the 4px scale, and rounding them onto it is how the app drifted 4px wider
 * and 10px lower than the design on six of its eight tabs.
 *
 * `pageTop` is small on purpose: `ScreenHeader` is pinned above this scroller
 * and carries its own bottom padding and a hairline, so the page starts close
 * under it. The tabs that still spend `space.xl` here predate the header and
 * leave a gap where the header used to be clipped.
 */
export const layout = {
  /** Card padding. */
  cardPadding: space.lg,
  /** Gap between sections — the design's content-wrapper `gap`. */
  section: 22,
  /** Page horizontal inset. */
  page: 16,
  /** First child's offset below the pinned header. */
  pageTop: 14,
  /** Last child's clearance above the tab bar. */
  pageBottom: 20,
} as const;

/**
 * Corner radii. FOUR steps, because two were not enough.
 *
 * With only `card` and `control`, anything smaller than a control or fully
 * round had nowhere to go, and eight call sites reached into the SPACING scale
 * for a corner instead — `borderRadius: space.xs`, `space.sm`, `space.lg`.
 * Those read as token-sourced and pass every lint, but they weld two unrelated
 * scales together: nudging a padding step would silently reshape a chip's
 * corners. `chip` and `pill` give those sites somewhere honest to land.
 *
 * `pill` is deliberately huge rather than computed from a height. React Native
 * clamps `borderRadius` to half the smaller side, so one value makes a capsule
 * of any element without the caller knowing its height — which is what the
 * website gets from `rounded-full`.
 *
 * Pair every radius EXCEPT `pill` with `borderCurve: "continuous"`. That is the
 * squircle iOS itself draws; on a capsule it is a no-op, and on a card the
 * difference between it and a circular arc is most of why a screen reads as
 * native rather than as a web page in a wrapper.
 */
export const radius = {
  /** Legend swatches and small square marks — a softened corner, not a round one. */
  mark: 3,
  /** Chips and severity buttons. Also the HR-zone bar's track. */
  chip: 8,
  control: 10,
  /**
   * Content cards. 14, from the design study, which uses it for every card
   * surface on every screen. It was 12 here before the port — chosen before
   * there was a design to match, and 2pt tighter than every mock.
   *
   * `group` below already came from the same source, so the two now agree
   * about where they got their corners.
   */
  card: 14,
  /**
   * 18 — the two hero surfaces, softer than a card and tighter than a group.
   *
   * The design gives the ember check-in card and the readiness card the same
   * `border-radius:18px` (`:236`, `:256`), one step off every other card. Both
   * were carrying the literal; a third caller would have made it three.
   */
  hero: 18,
  /**
   * The inset grouped list — `IOSList` in the design study's `ios-frame.jsx`.
   *
   * 26, and deliberately much rounder than `card`. iOS groups rows into a
   * single soft slab and lets the corner do the grouping, where a web page
   * would draw a border around each row. It is the one place in this app where
   * a radius is doing structural work rather than softening an edge, which is
   * why it does not simply reuse `card`.
   */
  group: 26,
  /** Capsules and dots. Clamped to half the shorter side by RN — height-agnostic. */
  pill: 9999,
} as const;

/**
 * The design's hairline — `StyleSheet.hairlineWidth`, one device pixel.
 *
 * ── IT WAS 1.5, AND THE ARGUMENT FOR THAT WAS A JUDGEMENT ───────────────────
 *
 * The reasoning was real: a line read at arm's length on a track in direct
 * sunlight wants more than a hairline, and the whole file is built on being one
 * step larger than a normal mobile app. But the design draws every separator at
 * `0.5px`, and "we decided we prefer heavier" is taste, not a rule — not a
 * measured contrast floor, not one of `visual-spec.md`'s non-negotiables. Under
 * the standard the app is now held to, taste does not outrank the design.
 *
 * `hairlineWidth` rather than a literal `0.5`: on a @3x phone that is 0.333pt,
 * which is the ACTUAL single pixel the design's CSS `0.5px` asks for on a @2x
 * display. Writing 0.5 would draw a line and a half on @3x.
 *
 * One token, every border in the app.
 */
export const ruleWidth = StyleSheet.hairlineWidth;

/** Left rule on SafetyNotice — deliberately heavier than a card rule. */
export const safetyRuleWidth = 3;

export const target = {
  /** Minimum tap target, both axes. */
  min: 48,
  /**
   * A grouped-list row. 52 is the iOS standard and the design study's
   * `IOSListRow`; it clears `min` and gives a two-line row room without
   * growing. Rows use this; standalone controls still use `min`.
   */
  row: 52,
  /** Minimum gap between adjacent targets. */
  gap: space.sm,
} as const;

/**
 * Motion. No entrance animations on the home screen, and skeletons must
 * reserve exact final height — the user may tap before data settles.
 */
export const duration = {
  state: 140,
  reveal: 180,
} as const;

/** Minimum supported width. The check-in must work at 360×640. */
export const minWidth = 360;
