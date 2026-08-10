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

export const radius = {
  card: 12,
  control: 10,
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
