/**
 * Colour tokens — the single source. See ../../../docs/visual-spec.md.
 *
 * Never hardcode a colour in a component. If a colour you need is not here,
 * that is a signal the design does not call for it.
 *
 * Colour is RATIONED: roughly three appearances per screen — the thing you tap,
 * a status dot, the body map. Everything else is white, near-black, and one
 * grey rule weight.
 */

export const color = {
  /**
   * Surface — pre-dawn cool, not cream. Warm cream washes out in low morning
   * light, which is the primary use.
   */
  bg: "#F3F5F4",
  card: "#FFFFFF",
  /** Sunken, for empty slots. */
  well: "#E9EDEB",

  /** Ink — deliberately darker than fashionable, for outdoor sunlight. */
  ink: "#12161A",
  ink2: "#3C444B",
  /** Verified ≥4.5:1 on `bg`. Re-verify if `bg` ever changes. */
  muted: "#6B7178",

  /** Rules are 1.5px, not hairline — hairlines disappear in bright sun. */
  rule: "#D3DAD7",
  ruleSoft: "#E4E9E7",

  /**
   * Accent — exactly ONE. Deliberately not green: green reads "good", and a
   * blank must never read as fine. This is the school-colour slot.
   */
  accent: "#2C4C8C",
  accentSoft: "#DFE6F2",

  /** Support — track surface. Data and illustration only, never on a control. */
  track: "#9A4A38",
  trackSoft: "#F0E1DD",

  /** Status — semantic only. Never decorative, never on a non-status element. */
  ok: "#2F6B4F",
  watch: "#8A6A1F",
  unusual: "#A33A2E",
  /** ALWAYS paired with a dashed border and a label. Never colour alone. */
  unknown: "#8A9098",
} as const;

export type ColorToken = keyof typeof color;
