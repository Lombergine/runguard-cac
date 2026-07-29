export const SEVERITY_COLORS = {
  high: "#ef4444", // red — reserved for persistent injury flags (not a severity score)
  none: "#9ca3af", // neutral gray — no severity set
} as const;

/** 0-10 severity → a smooth green (0, no soreness) to red (10, worst) gradient. */
export function severityColor(severity: number | null | undefined): string {
  if (severity == null) return SEVERITY_COLORS.none;
  const clamped = Math.max(0, Math.min(10, severity));
  const hue = 120 - clamped * 12; // 0 → 120° green, 10 → 0° red
  return `hsl(${hue}, 70%, 45%)`;
}
