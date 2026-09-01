/**
 * The stack header, in one place.
 *
 * WHY THIS EXISTS. The same ten-line `options` literal was pasted into five
 * screens — chat, settings, profile, privacy and activity/[id] — and two more,
 * `connect` and `gallery`, had no header at all. `connect` is PUSHED from
 * Settings, so with `headerShown: false` inherited from the root layout it had
 * no visible way back: the only exit was the iOS edge-swipe, which is invisible,
 * is not a tap target, and does not exist on Android.
 *
 * A copied literal is also how headers drift. Five copies means five chances for
 * one screen's title to end up a different size from its neighbour's, and
 * nothing fails when it does.
 *
 * The back button itself is the native stack's own: it appears automatically
 * whenever there is a screen beneath this one, so it is correct by construction
 * rather than something each screen remembers to render. `headerBackTitle` is
 * pinned to "Back" instead of the default — which echoes the PREVIOUS screen's
 * title — because that default reads as a second, competing title next to the
 * real one, and it changes depending on where you came from.
 */
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";

import { darkColor, staticColor } from "./tokens";
import { font, text } from "./type";

/**
 * Derived from `Stack.Screen` rather than imported from
 * `@react-navigation/native-stack`, which is only a transitive dependency here —
 * naming it directly would be a dependency this package.json does not declare,
 * and it would silently drift the day expo-router changes which stack it wraps.
 */
type HeaderOptions = NonNullable<ComponentProps<typeof Stack.Screen>["options"]>;

/**
 * A header that is ONLY a back button.
 *
 * For the auth screens. They already carry their own eyebrow + heading in the
 * scroll content ("SIGN IN" / "Welcome back"), so `screenHeader()` would put a
 * second heading directly above the first — the doubled-heading problem
 * `connect.tsx` had. What those screens were missing is not a title, it is a way
 * back: the whole group ran with `headerShown: false` and every cross-link was
 * `router.replace`, so tapping "Create an account" and changing your mind meant
 * scrolling to the bottom of a screen that is roughly one and a half viewports
 * tall to find the link home.
 *
 * OPAQUE, on the page ground, and not transparent — which was the first
 * attempt. `headerTransparent` floats the bar over the content, and these
 * screens centre a single card in a ScrollView, so the card scrolled underneath
 * the back button and its top edge was clipped by it.
 * `contentInsetAdjustmentBehavior` does not compensate for a transparent header
 * here. An opaque strip in `color.bg` is invisible against the page anyway —
 * same colour, no shadow, no title — so it reads exactly like the transparent
 * one was meant to, and the content simply starts beneath it.
 *
 * Screens using this should carry `edges={["bottom"]}` on their SafeAreaView,
 * as every other headered screen does, or the top inset is applied twice.
 */
export function useBackOnlyHeader(): HeaderOptions {
  const dark = useColorScheme() === "dark";
  /** Memoised for the reason `useScreenHeader` above is. */
  return useMemo<HeaderOptions>(
    () => ({
      headerShown: true,
      headerTitle: "",
      headerStyle: { backgroundColor: dark ? darkColor.bg : staticColor.bg },
      headerTintColor: dark ? darkColor.ink : staticColor.ink,
      headerShadowVisible: false,
      headerBackTitle: "Back",
      headerBackTitleStyle: { fontFamily: font.body },
    }),
    [dark]
  );
}

/**
 * Header options for one pushed screen.
 *
 * A HOOK, not a plain function, and that is not stylistic. **The native stack
 * header does not resolve a `DynamicColorIOS` value.** Handing it `color.bg`
 * flattened to the light branch, so in dark mode every pushed screen wore a
 * cream bar over a near-black page — and the system status-bar glyphs, which DO
 * follow the appearance, were drawn white on cream at 1.05:1. Invisible.
 *
 * So this resolves the appearance itself and passes concrete strings. Screens
 * already call it inside render, so it being a hook costs them nothing.
 *
 * ── NO LARGE TITLE, AND WHY ────────────────────────────────────────────────
 *
 * `headerLargeTitleEnabled` was tried and reverted. It broke three things at
 * once, on all six pushed screens:
 *
 *  1. The title stopped rendering AT ALL — large or collapsed. An empty ~190pt
 *     bar with only a Back pill.
 *  2. Content was clipped underneath it on four of six screens, because a large
 *     title requires `contentInsetAdjustmentBehavior="automatic"` on the
 *     screen's own ScrollView and only `connect.tsx` had it.
 *  3. It needed a second background token (`headerLargeStyle`), doubling the
 *     surface that could disagree with the page.
 *
 * A large title is worth having, but not at the price of a header that shows no
 * title and eats the first paragraph. If it comes back it needs the inset set on
 * every consumer first, and the font checked on device — the title font here is
 * Archivo via `expo-font`, and a native header wants a PostScript name.
 */
export function useScreenHeader(title: string): HeaderOptions {
  const dark = useColorScheme() === "dark";
  /*
   * ── MEMOISED, AND NOT AS AN OPTIMISATION ──────────────────────────────────
   *
   * This returned a fresh object literal on every render, and `<Stack.Screen>`
   * memoises on that reference — so `navigation.setOptions()` fired on every
   * render of every consumer. `chat.tsx` holds its composer draft in screen
   * state, which made that one navigator state update per typed character,
   * with the message list re-rendering behind it.
   *
   * Ten screens call this. Fixing it here rather than at the call sites is
   * what stops the eleventh reintroducing it.
   */
  return useMemo<HeaderOptions>(() => {
    const ink = dark ? darkColor.ink : staticColor.ink;
    return {
      headerShown: true,
      title,
      // `bg`, not `card`: the header is part of the page's ground, and a white
      // strip above a cream page reads as a floating bar — which the visual
      // spec rules out ("Lines instead of shadows. Nothing floats.").
      headerStyle: { backgroundColor: dark ? darkColor.bg : staticColor.bg },
      headerTintColor: ink,
      headerShadowVisible: false,
      headerTitleStyle: {
        fontFamily: text.title.fontFamily,
        fontSize: text.title.fontSize,
        color: ink,
      },
      headerBackTitle: "Back",
      headerBackTitleStyle: { fontFamily: font.body },
    };
  }, [dark, title]);
}

