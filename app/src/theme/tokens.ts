import { DynamicColorIOS, Platform } from "react-native";
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

/**
 * A token that changes with the system appearance.
 *
 * ── WHY `DynamicColorIOS` AND NOT A THEME HOOK ─────────────────────────────
 *
 * The obvious way to add dark mode is `useColorScheme()` plus dynamic styles.
 * It is also the wrong way here: every screen in this app builds its styles
 * with a module-level `StyleSheet.create`, so a hook would mean converting
 * roughly a hundred static stylesheets into functions of the theme, touching
 * every file to change no layout at all.
 *
 * `DynamicColorIOS` returns ONE opaque value that the OS resolves per
 * appearance, at draw time. A static stylesheet holding it adapts on its own.
 * So dark mode lands in this file and nowhere else, and — the part that
 * matters — a screen written next month gets it without knowing it exists.
 *
 * The dark values are the Claude Design "Mobile app discrepancy" study's own
 * `.dark` block, not invented here.
 *
 * NOT applied to: the ember gradient stops, which `LinearGradient` needs as
 * real strings, and the `…Text` accents, whose whole purpose is a measured
 * contrast ratio against a known ground. Those are handled explicitly below.
 */
const dyn = (light: string, dark: string) =>
  Platform.OS === "ios" ? DynamicColorIOS({ light, dark }) : light;

export const color = {
  /* Surfaces — warm paper, three elevation steps (globals.css:12-24). */
  bg: dyn("#FAF7F2", "#141210"),
  /** Top of the page gradient; the website's ground sunrises over 420px. */
  bgTop: dyn("#FDF3E3", "#241C11"),
  card: dyn("#FFFFFF", "#1F1C18"),
  /** Sunken. The old palette called this `well`; kept as the empty-slot fill. */
  well: dyn("#F4EFE6", "#242019"),
  surface3: dyn("#ECE5D8", "#2C271F"),

  /* Ink. Both clear 4.5:1 on every surface above (ink 14.6+, ink2 6.4+). */
  ink: dyn("#221D15", "#F6F2EB"),
  ink2: dyn("#55503F", "#CDC5B8"),
  /**
   * Darkened from the website's #94897b (3.21:1 → 4.83:1 on bg, 4.51 on well).
   * Same hue and saturation, lower lightness.
   */
  muted: dyn("#756C5F", "#A79E8F"),

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
  rule: dyn("rgba(34,29,21,0.14)", "rgba(255,255,255,0.14)"),
  ruleSoft: dyn("rgba(34,29,21,0.09)", "rgba(255,255,255,0.07)"),
  ruleStrong: dyn("rgba(34,29,21,0.24)", "rgba(255,255,255,0.24)"),

  /**
   * The chrome grounds: the header bar and the tab bar.
   *
   * TRANSLUCENT, and the design's own values — `--nav` and `--tabbar`. They are
   * meant to be seen through, with `blur(18px) saturate(180%)` behind them, and
   * `expo-blur` now supplies that. Before it was installed these two surfaces
   * were painted opaque with `bg` and `card`, and the header's docblock argued
   * the case: without a real blur a 0.86-alpha strip over scrolling content is
   * just muddy, and `visual-spec.md` rules out floating surfaces. That argument
   * was sound while there was no blur; there is one now.
   *
   * The alphas differ by design — the nav is slightly more transparent than the
   * tab bar (0.86 against 0.90), so the page shows through the top more than
   * the bottom.
   */
  nav: dyn("rgba(250,247,242,0.86)", "rgba(20,18,16,0.84)"),
  tabbar: dyn("rgba(250,247,242,0.90)", "rgba(20,18,16,0.90)"),

  /* ── The ember signature — "the fun" (globals.css:26-31) ───────────── */
  /** FILL only: bars, dots, gradient stops. 2.01:1 — never put a glyph on it. */
  brand: "#F59E0B",
  brandStrong: "#D97706",
  emberHot: "#F97316",
  /** The gradient stops, for expo-linear-gradient. 135° on the web. */
  ember: ["#FBBF24", "#F59E0B", "#F97316"] as const,
  emberGlow: "rgba(249,115,22,0.16)",
  /**
   * TEXT: ember dark enough to put a word or a glyph on.
   *
   * Measured on the three grounds, worst case first (`well`, the deepest):
   * light `#976106` is 4.55 / 5.21 / 4.88; dark `#C98A12` is 5.50 / 5.76 / 6.34.
   *
   * IT HAD TO BECOME A PAIR. As one static value it was 3.11:1 on the dark well
   * — under the floor, on the token whose entire job is "the ember you are
   * allowed to write in". Every one of the forty-odd call sites reasoned about
   * its light-mode figure in a comment and none of them was wrong; they were all
   * measured against the cream. Darkening the light branch would have broken
   * those, so the dark branch is its own value: the same hue lifted until it
   * clears 4.5:1 on `#242019`, and stopped there rather than run up to `brand`,
   * which is a FILL at 2.01:1 and is never a glyph.
   *
   * SVG paint cannot take this. See `staticColor` / `darkColor` below, which
   * carry both branches as raw hex for the three stroked glyphs.
   */
  brandText: dyn("#976106", "#C98A12"),

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
   * The design's `--accent-soft`: the ember at 18% light, 22% dark.
   *
   * A PAIR, and translucent, which is what makes it usable as a ground under
   * type — it composites over whatever card it sits on and therefore follows
   * the appearance. `accentSoft` above is an opaque light-only cream and its
   * docblock scopes it to surfaces with no type on them; putting a word on that
   * in dark mode is the ~1.05:1 trap the calendar screen already refused.
   */
  accentWash: dyn("rgba(245,158,11,0.18)", "rgba(245,158,11,0.22)"),

  /**
   * Ink for a word ON `accentWash`. Measured over the composited ground, which
   * is `#FDEED3` light and `#4E3915` dark:
   *
   *     light  #976106  4.55:1     (`brandText`, unchanged)
   *     dark   #E0A32B  4.92:1     (`brandText`'s #C98A12 is 3.71:1 — under)
   *
   * The dark branch is the one place the design's own accent could not be used
   * verbatim: `--accent` dark is `#f0a72e`, close to this, but the app's
   * `brandText` pair is tuned for the page ground rather than for a tinted
   * chip, and on this one it falls short. A measured floor is the exception the
   * design does not override.
   */
  accentWashInk: dyn("#976106", "#E0A32B"),

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
  fill: dyn("rgba(120,120,128,0.12)", "rgba(120,120,128,0.26)"),
  /** The same, one step up — a selected segment. */
  fillStrong: dyn("rgba(120,120,128,0.16)", "rgba(120,120,128,0.32)"),
  /**
   * What a row flashes while your thumb is down.
   *
   * The design is explicit that this is a FLASH on the whole row, not a
   * hover tint and not an opacity fade: `.row:active { background: var(--press) }`
   * over 120ms linear. A list row has no hover state on a phone, so the
   * press is the only feedback there is.
   */
  press: dyn("rgba(120,120,128,0.12)", "rgba(255,255,255,0.10)"),
  /** iOS placeholder grey. Not `muted` — placeholders sit lighter than labels. */
  placeholder: dyn("rgba(60,60,67,0.35)", "rgba(235,235,245,0.35)"),
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

/**
 * Raw light-mode strings, for the places a dynamic colour cannot go.
 *
 * `react-native-svg` types every paint prop as `string`, and the chart code
 * does arithmetic on channels (`mix`, `channels`) which needs a parseable hex,
 * not an opaque OS token. Those call sites read from here.
 *
 * The cost, stated precisely — it used to be stated too broadly here, and the
 * overstatement nearly bought a hook nobody needed: **it is the ARITHMETIC that
 * cannot take a dynamic colour, not SVG.** `extractBrush` in react-native-svg
 * 15.15.4 passes a `DynamicColorIOS` object straight through to `RCTConvert`, so
 * a plain `fill` or `stroke` follows the appearance like any other style. What
 * does not is chart code that reads channels out of the string to `mix` them —
 * those call sites read from here, and their colours stay light-mode values in
 * dark mode until `useColorScheme()` is threaded into the components, which is a
 * real change to how they are built rather than a token swap.
 */
export const staticColor = {
  ink: "#221D15",
  ink2: "#55503F",
  muted: "#756C5F",
  card: "#FFFFFF",
  bg: "#FAF7F2",
  well: "#F4EFE6",
  rule: "rgba(34,29,21,0.14)",
  ruleSoft: "rgba(34,29,21,0.09)",
} as const;

/**
 * The same tokens' DARK values, as raw strings.
 *
 * Needed for the same reason as `staticColor`, plus one that cost real
 * breakage: **the native stack header does not resolve a `DynamicColorIOS`
 * value.** Passing one to `headerStyle.backgroundColor` or `headerTintColor`
 * flattens it to the light branch, so in dark mode every pushed screen wore a
 * cream bar over a near-black page — with the system status-bar glyphs, which
 * DO follow the appearance, drawn white on cream at 1.05:1. Invisible.
 *
 * `theme/header.ts` therefore resolves the appearance itself with
 * `useColorScheme()` and picks from here. Anything rendering through React
 * Native's own style system should keep using `color.*` and adapt for free.
 */
export const darkColor = {
  ink: "#F6F2EB",
  ink2: "#CDC5B8",
  muted: "#A79E8F",
  card: "#1F1C18",
  bg: "#141210",
  well: "#242019",
  rule: "rgba(255,255,255,0.14)",
  ruleSoft: "rgba(255,255,255,0.07)",
} as const;

/**
 * The five-step ember ramp — load intensity, for the year grid and the HR-zone
 * bar.
 *
 * Raw `rgb()` for the same reason as `staticColor`: both consumers paint SVG
 * or a flex track, and the design carries them as literals for exactly that
 * reason. Five steps, not the three in `color.ember`: that one is a gradient
 * (three stops interpolated), this one is a scale (five discrete levels that
 * must stay distinguishable side by side).
 *
 * Deeper is a harder day. Step 0 is the lightest load, step 4 the heaviest.
 */
export const emberRamp = [
  "rgb(245,158,11)",
  "rgb(217,136,14)",
  "rgb(188,113,16)",
  "rgb(160,91,19)",
  "rgb(131,68,21)",
] as const;

/** The same scale lifted for a dark ground. */
export const emberRampDark = [
  "rgb(242,174,28)",
  "rgb(214,146,20)",
  "rgb(184,116,18)",
  "rgb(153,89,18)",
  "rgb(120,63,20)",
] as const;

/**
 * The disclosure chevron's stroke.
 *
 * A neutral grey rather than a ramp step, and deliberately the same in both
 * appearances: it is chrome pointing at a row, not information about it. Taken
 * from the design, which likewise carries it as a literal because it lands in
 * an SVG `stroke`.
 */
export const chevronStroke = "rgba(140,140,140,0.62)";

export type ColorToken = keyof typeof color;
