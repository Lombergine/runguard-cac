/**
 * Space, stance and motion. See ../../../docs/visual-spec.md.
 *
 * Everything is one step larger than a normal mobile app: the primary use is
 * 6am, one hand, arm's length, possibly in cold or glare. It should feel
 * slightly oversized on a desk and exactly right at arm's length.
 */

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

export const layout = {
  /** Card padding. */
  cardPadding: space.lg,
  /** Gap between sections. */
  section: space.xl,
  /** Page horizontal inset. */
  page: 20,
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
  mark: 4,
  /** Chips and severity buttons. */
  chip: 8,
  control: 10,
  card: 12,
  /** Capsules and dots. Clamped to half the shorter side by RN — height-agnostic. */
  pill: 9999,
} as const;

/**
 * 1.5px, not a hairline. React Native accepts fractional widths and renders
 * them on the device's pixel grid.
 */
export const ruleWidth = 1.5;

/** Left rule on SafetyNotice — deliberately heavier than a card rule. */
export const safetyRuleWidth = 3;

export const target = {
  /** Minimum tap target, both axes. */
  min: 48,
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
