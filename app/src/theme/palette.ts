/**
 * The two palettes, as plain hex. One file, full key parity, nothing derived.
 *
 * `tokens.ts` builds the runtime `color` object from these; this file holds no
 * logic so the two themes can be read side by side and audited as a pair. A key
 * present in one and missing from the other is a type error, which is the point
 * — a token defined only in one theme is a screen that breaks in the other.
 *
 * ── HOW THE PAIR IS BUILT ──────────────────────────────────────────────────
 * Dark is the designed theme: near-black ground, surfaces getting LIGHTER with
 * elevation, coral for the athlete, teal for the team, violet for the body.
 *
 * Light is not that palette inverted. Elevation reverses (a raised card is
 * WHITE on a grey ground, not lighter than it), and every colour that lands on
 * a GLYPH is re-picked rather than reused: coral #FF5A36 is 2.6:1 on white, so
 * a coral WORD in light theme is #C2410C at 5.2:1. That split is why `brand`
 * and `brandText` are separate keys, and it runs through all four semantic
 * pairs — `ok`/`okText`, `watch`/`watchText`, and the rest.
 *
 * Measured against the three grounds text sits on in each theme:
 *
 *     light  --muted #5D6673   5.37 (bg) / 4.99 (well) / 4.69 (surface3)
 *     dark   --muted #8A94A6   6.4  (bg) / 5.6  (well) / 4.9  (surface3)
 *
 * 4.5:1 is the floor, not the goal — this app is read outdoors at 6am.
 */

export const lightColors = {
  /* Surfaces — a cool near-white ground; raised things are WHITE, not lighter
     than the ground, because that is what elevation looks like in daylight. */
  bg: "#F4F6F9",
  bgTop: "#F4F6F9",
  card: "#FFFFFF",
  well: "#EDEFF4",
  surface3: "#E3E7EE",
  /** The one card that sits above the others — the morning check-in. */
  raised: "#FFF6F3",
  raisedRule: "#FFD8CC",
  /**
   * A tappable control sitting ON `raised` — the check-in's answer chips.
   * Elevation reverses between the themes, so this cannot be one of the
   * `surface*` steps: on light it must be WHITE (brighter than the tinted
   * card), on dark a step LIGHTER than it. Hence its own key.
   */
  control: "#FFFFFF",
  controlEdge: "#E4D5CE",

  /* Ink. */
  ink: "#10141B",
  ink2: "#414A57",
  /** 4.69:1 on `surface3`, the darkest ground a caption sits on here. */
  muted: "#5D6673",

  /* Rules. In light theme these are visible: a white card on a near-white
     ground needs an edge, where on the dark ground the surface step is enough. */
  rule: "#DFE4EB",
  ruleSoft: "#E9ECF2",
  ruleStrong: "#C7CEd9",

  fill: "rgba(120,120,128,0.12)",
  fillStrong: "rgba(120,120,128,0.16)",
  press: "rgba(120,120,128,0.14)",
  sep: "#DFE4EB",
  nav: "rgba(244,246,249,0.92)",
  chip: "rgba(255,90,54,0.12)",

  /* ── Coral is you. FILL only — 2.6:1 on white, never a glyph. ─────────── */
  brand: "#FF5A36",
  brandStrong: "#E84A28",
  emberHot: "#FF7A5C",
  emberGlow: "rgba(255,90,54,0.18)",
  /** TEXT: coral at 5.18:1 on white. Any coral-coloured WORD uses this. */
  brandText: "#C2410C",

  /* ── Semantic. Teal is the team / fine, violet is the body. ───────────── */
  ok: "#14B8A6",
  watch: "#F59E0B",
  serious: "#F97316",
  unusual: "#EF4444",
  series1: "#8B7CFF",
  okText: "#0F766E",
  watchText: "#A16207",
  seriousText: "#C2410C",
  unusualText: "#B91C1C",
  series1Text: "#6D28D9",

  /** Absent. ALWAYS paired with a dashed border and a label, never colour alone. */
  unknown: "#5F6875",
  /** TextInput placeholder. Lighter than `muted`: it is a hint, not content. */
  placeholder: "#8C94A1",

  accent: "#FF5A36",
  accentSoft: "rgba(255,90,54,0.12)",

  /**
   * Body-map support colour. Soreness is data entry about the body, so it must
   * NOT wear the accent, or a tapped region reads as a system action.
   */
  track: "#B45309",
  trackSoft: "rgba(180,83,9,0.14)",

  /* Chart furniture. */
  grid: "#E7EBF1",
  baseline: "#C7CED9",
} as const;

/** Same keys, dark values. The type below enforces "same keys". */
export const darkColors: { [K in keyof typeof lightColors]: string } = {
  /* Surfaces — dark ground, raised things get LIGHTER. */
  bg: "#0A0D12",
  bgTop: "#0A0D12",
  card: "#131923",
  well: "#0F141C",
  surface3: "#1E2736",
  raised: "#182030",
  raisedRule: "#22304A",
  control: "#232D3F",
  controlEdge: "#33415A",

  ink: "#F4F6FA",
  ink2: "#B9C2D0",
  /** 4.9:1 on `surface3`, the darkest-contrast ground a caption sits on. */
  muted: "#8A94A6",

  /* Rules — low-contrast. Separation comes from the surface steps. */
  rule: "#232B38",
  ruleSoft: "#1B2230",
  ruleStrong: "#2E3849",

  fill: "rgba(120,120,128,0.24)",
  fillStrong: "rgba(120,120,128,0.32)",
  press: "rgba(255,255,255,0.08)",
  sep: "#232B38",
  nav: "rgba(10,13,18,0.90)",
  chip: "rgba(255,90,54,0.18)",

  /* Coral is luminous on a dark ground, so the TEXT value becomes legible —
     which its light twin never is. */
  brand: "#FF5A36",
  brandStrong: "#E84A28",
  emberHot: "#FF7A5C",
  emberGlow: "rgba(255,90,54,0.35)",
  brandText: "#FF7A5C",

  ok: "#2DD4BF",
  watch: "#FFB020",
  serious: "#FF8A3D",
  unusual: "#FF4D6D",
  series1: "#8B7CFF",
  okText: "#2DD4BF",
  watchText: "#FFB020",
  seriousText: "#FF8A3D",
  unusualText: "#FF4D6D",
  series1Text: "#8B7CFF",

  unknown: "#7D8797",
  placeholder: "#6B7484",

  accent: "#FF5A36",
  accentSoft: "rgba(255,90,54,0.18)",

  track: "#FF8A3D",
  trackSoft: "rgba(255,138,61,0.22)",

  grid: "#1B2230",
  baseline: "#2E3849",
};

/**
 * The "gradient" stops. Three identical coral stops: the LinearGradient sites
 * keep compiling and draw a flat fill. A ramp on a button is the one thing
 * every generated-looking app has, and nothing here needs it.
 */
export const lightEmber = ["#FF5A36", "#FF5A36", "#FF5A36"] as const;
export const darkEmber = lightEmber;

export type Palette = { [K in keyof typeof lightColors]: string };
