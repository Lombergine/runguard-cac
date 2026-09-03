/**
 * Colour tokens — the "sunrise" system, now in two themes.
 *
 * The values live in `palette.ts`. This file is the runtime: it decides which
 * theme a given reference resolves to, and it does that in two different ways
 * for two different consumers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `color` IS DYNAMIC AND `useColors()` EXISTS AS WELL
 *
 * 912 references across 66 files read `color.*`, and 62 of those files build
 * their styles in a module-scope `StyleSheet.create` — evaluated once, at
 * import, long before any component can know the appearance. A hook cannot
 * reach them without rewriting every one.
 *
 * `DynamicColorIOS` is built for exactly this: it returns an opaque value the
 * platform resolves per appearance, so a static stylesheet re-themes itself
 * with no React involvement. Every existing `StyleSheet.create` keeps working
 * and gains dark mode for free.
 *
 * The cost is that the value is OPAQUE — it is not a string, cannot be
 * inspected, concatenated, or handed to anything that parses colours itself.
 * `react-native-svg` is the consumer that matters here: it processes its own
 * `stroke`/`fill` props. So anything drawing into SVG takes plain hex from
 * `useColors()` instead. TypeScript enforces the split — `color` is typed
 * `ColorValue`, so a site that needs a real string fails to compile rather
 * than rendering the wrong colour at runtime.
 *
 * Rule of thumb:
 *   • a React Native style prop  → `color.*`
 *   • an SVG prop, a gradient, or anything computed → `useColors()`
 * ─────────────────────────────────────────────────────────────────────────
 */
import { DynamicColorIOS, Platform, useColorScheme } from "react-native";
import type { ColorValue } from "react-native";

import {
  darkColors,
  darkEmber,
  lightColors,
  lightEmber,
  type Palette,
} from "./palette";

/** LinearGradient wants at least two stops, so the tuple shape has to survive. */
type EmberStops = readonly [string, string, string];

/**
 * One key, resolved per appearance.
 *
 * Android and web have no `DynamicColorIOS`, so they take the light value and
 * this app stays light there. That is a deliberate limit rather than an
 * oversight: RunGuard's whole reason for existing on a phone is Apple Health,
 * and the iOS build is the one that ships.
 */
function dyn(key: keyof Palette): ColorValue {
  return Platform.OS === "ios"
    ? DynamicColorIOS({ light: lightColors[key], dark: darkColors[key] })
    : lightColors[key];
}

const dynamicPalette = Object.fromEntries(
  (Object.keys(lightColors) as (keyof Palette)[]).map((k) => [k, dyn(k)])
) as Record<keyof Palette, ColorValue>;

/**
 * The token object every stylesheet reads.
 *
 * Typed `ColorValue`, NOT `string`. A call site that genuinely needs the hex —
 * an SVG stroke, a gradient stop — will not compile against this, which is how
 * those sites get found instead of silently drawing an unresolved colour.
 */
export const color = {
  ...dynamicPalette,
  /** Gradient stops stay a plain tuple; an array cannot be a dynamic colour. */
  ember: lightEmber,
} as Record<keyof Palette, ColorValue> & { ember: EmberStops };

/**
 * The resolved palette as plain hex, for SVG, gradients and anything computed.
 *
 * Re-renders on appearance change, which is what makes an SVG chart follow the
 * theme — `color.*` cannot, because the SVG layer never asks the platform to
 * resolve it.
 */
export function useColors(): Palette & { ember: EmberStops } {
  const scheme = useColorScheme();
  const dark = scheme === "dark" && Platform.OS === "ios";
  return {
    ...(dark ? darkColors : lightColors),
    ember: dark ? darkEmber : lightEmber,
  };
}

/** True when the app is currently drawing its dark theme. */
export function useIsDark(): boolean {
  return useColorScheme() === "dark" && Platform.OS === "ios";
}

/**
 * Elevation. A shadow is elevation, never emphasis: it must not be used to
 * make one card louder than another.
 *
 * On a dark ground a drop shadow has nothing to fall on, so the dark theme
 * spends almost nothing on the shadow and lets the card's own lighter surface
 * carry the separation instead — the same move the website's dark block makes
 * with its rim light.
 */
export const shadow = {
  /**
   * Pulse has no drop shadows: on a dark ground a shadow has nothing to fall
   * on, and a raised surface is simply lighter than the one beneath it. The
   * token stays so the 48 sites that spread it keep compiling — and so that
   * nobody re-adds a shadow by hand somewhere the token would not reach.
   */
  card: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    default: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  }) as {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
  },
} as const;

export type ColorToken = keyof Palette;
export type { Palette };
