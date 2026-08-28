/**
 * Colour tokens — the "sunrise" system, ported from the website.
 *
 * Source of truth: `website/src/app/globals.css:3-45`, whose own docblock names
 * the system: "Warm cream-white surfaces, one ember signature doing the energy
 * work, soft real shadows, colorful-but-disciplined state chips."
 *
 * This SUPERSEDES the pale-cool palette the app shipped with. See
 * ../../../docs/visual-spec.md — its palette section is overruled; its safety
 * and honesty rules are not.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THERE ARE TWO SETS OF ACCENT COLOURS
 *
 * The website's palette was never checked against WCAG, and most of it fails
 * as text. Measured against `surface2` (#f4efe6), the darkest ground text
 * commonly sits on:
 *
 *     ink-muted  #94897b  3.21:1     brand    #f59e0b  2.01:1
 *     good       #16a34a  3.08:1     warning  #d97706  2.98:1
 *     series-1   #2a78d6  4.13:1     serious  #ea580c  3.33:1
 *
 * Every one of those is below the 4.5:1 text floor, and `ink-muted` carries
 * every micro-label, note and sub-line on the site. This app is used at 6am
 * outdoors in glare, so shipping them verbatim would be a real legibility
 * defect rather than a pedantic one.
 *
 * So each accent exists twice:
 *   - the FILL value  — the website's exact hex, for bars, dots and gradients
 *   - the TEXT value  — the same hue and saturation walked down in lightness
 *                       until it clears 4.5:1 on surface2
 *
 * Use `…Text` whenever the colour lands on a glyph. Use the plain token for a
 * shape. Getting this wrong is invisible indoors and unreadable on a track.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const color = {
  /* Surfaces — warm paper, three elevation steps (globals.css:12-24). */
  bg: "#FAF7F2",
  /** Top of the page gradient; the website's ground sunrises over 420px. */
  bgTop: "#FDF3E3",
  card: "#FFFFFF",
  /** Sunken. The old palette called this `well`; kept as the empty-slot fill. */
  well: "#F4EFE6",
  surface3: "#ECE5D8",

  /* Ink. Both clear 4.5:1 on every surface above (ink 14.6+, ink2 6.4+). */
  ink: "#221D15",
  ink2: "#55503F",
  /**
   * Darkened from the website's #94897b (3.21:1 → 4.83:1 on bg, 4.51 on well).
   * Same hue and saturation, lower lightness.
   */
  muted: "#756C5F",

  /*
   * Rules. The website uses translucent ink rather than a grey.
   *
   * THREE steps where the site has two, and the top step is darker than its
   * counterpart — `--hairline` 0.09 and `--hairline-strong` 0.18 become
   * 0.09 / 0.14 / 0.24. Recorded because an audit reads the 0.24 as drift:
   * it is not. `rule` is the app's default border and has no web twin at all,
   * so the scale is its own, and its top step follows the same reasoning as
   * `muted` above and `ruleWidth` in space.ts — a line that has to survive
   * direct sunlight on a track needs more contrast than one read indoors.
   */
  rule: "rgba(34,29,21,0.14)",
  ruleSoft: "rgba(34,29,21,0.09)",
  ruleStrong: "rgba(34,29,21,0.24)",

  /* ── The ember signature — "the fun" (globals.css:26-31) ───────────── */
  /** FILL only: bars, dots, gradient stops. 2.01:1 — never put a glyph on it. */
  brand: "#F59E0B",
  brandStrong: "#D97706",
  emberHot: "#F97316",
  /** The gradient stops, for expo-linear-gradient. 135° on the web. */
  ember: ["#FBBF24", "#F59E0B", "#F97316"] as const,
  emberGlow: "rgba(249,115,22,0.16)",
  /** TEXT: ember at 4.55:1. Use for any ember-coloured word. */
  brandText: "#976106",

  /* ── Semantic states. The website's comment: "verdicts only, never chrome" */
  ok: "#16A34A",
  watch: "#D97706",
  serious: "#EA580C",
  unusual: "#DC2626",
  series1: "#2A78D6",
  /** TEXT variants, all ≥4.5:1 on well. */
  okText: "#117E39",
  watchText: "#A55A05",
  seriousText: "#BD470A",
  unusualText: "#D42222",
  series1Text: "#266DC4",

  /**
   * Absent. ALWAYS paired with a dashed border and a label, never colour alone.
   * Retuned for the cream ground: 4.86:1 on well, 5.21:1 on bg.
   */
  unknown: "#6F675C",

  /* ── Compatibility with the pre-sunrise names ──────────────────────────
   * The old palette had exactly ONE accent (a deep field blue) because colour
   * was rationed. Under sunrise the accent IS the ember, so these map onto it.
   * `accent` is a FILL — put a glyph on `brandText`, never on this.
   */
  accent: "#F59E0B",
  /** Soft ember wash for a bar track or a pressed state. */
  accentSoft: "#FDECC8",

  /**
   * Body-map support colour. The spec's rule survives the re-skin: soreness is
   * data entry about the body, so it must NOT wear the accent, or a tapped
   * region reads as a system action. Warm brick — same family as the ember,
   * clearly not it.
   */
  track: "#9A4A38",
  trackSoft: "#F2E0DB",

  /* Chart furniture (globals.css:23-24). */
  grid: "#ECE6DA",
  baseline: "#D8D0C0",

  /* ------------------------------------------------------------------ *
   * iOS system fills — from the Claude Design "Mobile app discrepancy"
   * study, which restated this product as a native app rather than a web
   * page in a wrapper.
   *
   * These are NOT brand colours and must never be used as one. They are
   * Apple's own neutral fills — a single grey (120,120,128) at different
   * alphas — and they are what makes a control read as a system control
   * rather than a drawn rectangle. The brand stays where the brand belongs:
   * one ember per screen, on the thing you tap to commit something.
   * ------------------------------------------------------------------ */

  /** The ground under a text field or an inert segmented track. */
  fill: "rgba(120,120,128,0.12)",
  /** The same, one step up — a selected segment. */
  fillStrong: "rgba(120,120,128,0.16)",
  /**
   * What a row flashes while your thumb is down.
   *
   * The design is explicit that this is a FLASH on the whole row, not a
   * hover tint and not an opacity fade: `.row:active { background: var(--press) }`
   * over 120ms linear. A list row has no hover state on a phone, so the
   * press is the only feedback there is.
   */
  press: "rgba(120,120,128,0.12)",
  /** iOS placeholder grey. Not `muted` — placeholders sit lighter than labels. */
  placeholder: "rgba(60,60,67,0.35)",
} as const;

/**
 * The website's card shadow (globals.css:77-82), as a `boxShadow` string.
 *
 * Nothing floated in the old palette. Under sunrise things do — but a shadow is
 * elevation, never emphasis: it must not be used to make one card louder than
 * another.
 *
 * WHY A STRING RATHER THAN `shadowOffset`/`elevation`. This used to be the
 * legacy prop set, chosen because "iOS reads shadow*, Android reads elevation".
 * That is the pre-0.76 model; `boxShadow` is now one cross-platform property,
 * and the old props are on the deprecation path.
 *
 * The rewrite is not merely a port. The legacy props could express exactly ONE
 * shadow with no spread, so the website's two layers had to be flattened into a
 * single approximation — a wider, softer blur that read as a glow rather than a
 * lift. `boxShadow` takes a comma-separated list AND a spread distance, so both
 * of the site's layers survive verbatim: the 1px contact shadow that sits a card
 * on the page, and the long -16px-spread ambient one that gives it height.
 */
export const shadow = {
  card: {
    boxShadow:
      "0px 1px 2px 0px rgba(34, 29, 21, 0.04), 0px 10px 28px -16px rgba(34, 29, 21, 0.14)",
  },
} as const;

export type ColorToken = keyof typeof color;
