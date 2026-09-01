import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { applyAppearance, loadAppearance } from "../lib/appearance";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Archivo_700Bold, Archivo_800ExtraBold } from "@expo-google-fonts/archivo";
import {
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
} from "@expo-google-fonts/source-sans-3";
import {
  SplineSansMono_500Medium,
  SplineSansMono_600SemiBold,
} from "@expo-google-fonts/spline-sans-mono";

import { ProfileProvider } from "../lib/profileStore";
import { SessionProvider, useSession } from "../lib/session";
import { useReducedMotion } from "../lib/useReducedMotion";
import { color } from "../theme/tokens";

/**
 * Hold the splash until the fonts are ready. The alternative — rendering in a
 * fallback face and swapping — is a layout shift, and the spec forbids the
 * layout moving while someone is looking at it for fifteen seconds.
 *
 * Only the five weights the spec names are imported, so nothing else is
 * bundled.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden; not an error worth surfacing */
});

/**
 * The signed-out entrance, declared rather than inferred.
 *
 * `anchor`, not `initialRouteName`: expo-router v4 renamed it, and the old key
 * is silently ignored on SDK 57 — which is worse than an error, because the
 * comment below would still claim the guard exists.
 */
export const unstable_settings = { anchor: "welcome" };

export default function RootLayout() {
  const scheme = useColorScheme();

  /*
   * The stored appearance, applied before anything is drawn in the wrong one.
   *
   * `Appearance.setColorScheme()` moves what the OS resolves `DynamicColorIOS`
   * against, so this one call turns every token, every `useColorScheme()` and
   * the status bar over together — see `lib/appearance.ts` for why it is that
   * rather than a context.
   *
   * It runs alongside the font load and the keychain read, and the splash is
   * held until all three settle (`Launch` below), so there is no frame in which
   * an athlete who chose dark sees a cream screen.
   */
  useEffect(() => {
    let alive = true;
    void loadAppearance().then((choice) => {
      if (alive) applyAppearance(choice);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [fontsLoaded, fontError] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SplineSansMono_500Medium,
    SplineSansMono_600SemiBold,
  });

  /*
   * `SessionProvider` mounts FIRST, above the font gate, and that ordering is
   * the whole point.
   *
   * This used to `return null` until the fonts resolved, which meant the
   * provider was not in the tree yet — so the keychain read in its effect could
   * not even START until font loading had finished. Two independent waits, run
   * end to end. Now they overlap: the fonts fetch while SecureStore is read.
   */
  return (
    <SessionProvider>
      <SafeAreaProvider>
        {/*
          ── WHY REACT NAVIGATION NEEDS ITS OWN THEME ──────────────────────────

          Without this the navigator uses its light `DefaultTheme` in both
          appearances, so `theme.colors.background` is `#fff` — and that white
          is what paints behind a native-stack screen DURING a transition, and
          in any gap the screen's own `contentStyle` does not cover. The app
          masked it with `contentStyle` below and `sceneStyle` in the tabs, so
          it was only ever visible as white edges during the dark-mode fade.
          Masking the symptom, though: the navigator still believed it was light.

          `useColorScheme()` rather than a `DynamicColorIOS` pair, because this
          value is read by React Navigation in JS rather than resolved by the
          OS at paint time — the same reason `theme/header.ts` resolves the
          appearance itself.
        */}
        {/* `auto` follows the appearance: dark glyphs on the cream ground, light
            glyphs on the dark one. Pinned to "dark" it was unreadable in dark mode. */}
        <StatusBar style="auto" />
        <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
          <Launch fontsReady={fontsLoaded || Boolean(fontError)} />
        </ThemeProvider>
      </SafeAreaProvider>
    </SessionProvider>
  );
}

/**
 * Holds the native splash until there is a real frame to replace it with.
 *
 * THE BUG THIS FIXES. The splash used to be dismissed as soon as the FONTS were
 * ready, while `Gate` was still returning `null` waiting on the session. For
 * that window nothing in this app painted anything — no `Stack`, so not even
 * its `contentStyle` ground — and what showed through was the bare platform
 * root: white. A cold launch therefore stepped through three different
 * backgrounds in half a second, `#F3F5F4` splash → white → `#FAF7F2` app.
 *
 * The splash colour is now `color.bg` (app.json) so the first two agree, and
 * the splash stays up until BOTH waits are done, so the third step is the only
 * one left and it is a step onto an identical colour.
 *
 * It cannot hang: fonts resolve or error, and the session fails closed to
 * "out" if the keychain throws (lib/session.tsx), so `ready` always arrives.
 */
function Launch({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useSession();
  const ready = fontsReady && status !== "loading";

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // The splash is still up. Rendering a half-styled frame under it is what the
  // fade would otherwise reveal.
  if (!ready) return null;

  return <Gate />;
}

/**
 * The gate. Which navigator exists at all is decided here, once.
 *
 * Signed out, `Stack.Protected` leaves the whole authed group UNMOUNTED — the
 * tab bar, every tab screen, chat, profile, settings and connect simply do not
 * exist in the tree. That is stronger than hiding them: a screen that never
 * mounts cannot fetch, cannot hold state, and cannot leave the last athlete's
 * data on the glass. It also means a deep link to `/settings` while signed out
 * names a route that is not in the navigator's `routeNames`, so the action is
 * dropped and you stay on the auth group.
 *
 * EVERY ROUTE FILE MUST BE NAMED BELOW. `Stack.Protected` is a DENY-LIST, not
 * an allow-list: `useFilterScreenChildren` can only add a screen to the
 * excluded set if that screen was declared inside a guarded group, and
 * `getSortedChildren` then appends every remaining filesystem route to the
 * navigator anyway (expo-router 57, `build/useScreens.js:118`). A new file
 * under `src/app/` that nobody declares here is therefore reachable in BOTH
 * session states, silently. Adding a screen is the only thing that gates it.
 *
 * `status === "loading"` renders neither group, because guessing wrong for one
 * frame is exactly how a signed-out phone flashes someone else's readiness.
 */
function Gate() {
  const { status, role } = useSession();
  const reducedMotion = useReducedMotion();

  if (status === "loading") return null;

  const signedIn = status === "in";
  const coach = signedIn && role === "coach";

  return (
    /*
     * `key={status}` IS THE DESIGN — do not "simplify" it away.
     *
     * The profile store holds a 57 KB snapshot of one athlete. On "in" → "out"
     * the changed key makes React throw this entire subtree away and mount a
     * fresh one, and every athlete byte the store was holding goes with it.
     * There is no clear-on-sign-out function for anyone to forget to call, no
     * effect that has to win a race against the next render, and no way to add
     * a field to the store that survives sign-out by accident.
     *
     * THE ROLE IS PART OF THE KEY for exactly the same reason. A role switch is
     * "in" → "in": the status alone does not change, so keying on it would have
     * left the previous session's subtree — and whatever a coach screen was
     * holding about fourteen athletes — mounted underneath the new one. Signing
     * in as an athlete after signing in as a coach is a change of person on the
     * device, and it throws the tree away like every other one.
     */
    <ProfileProvider key={`${status}:${role ?? "none"}`}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          /*
           * The only screen transition in the app, and now the only one that
           * asks first. The spec's quality floor requires reduced motion to be
           * respected; this fade was never gated on it, so someone who had
           * turned movement off in iOS Settings still got a cross-fade on every
           * push. `"none"` is the honest opposite — an instant cut, not a
           * faster fade.
           */
          animation: reducedMotion ? "none" : "fade",
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="connect" />
          {/* One run, opened from the log. It shows an athlete's own training
              data, so it belongs inside the guard with the rest: signed out it
              never mounts, and a deep link to /activity/12 has nothing to
              resolve to. */}
          <Stack.Screen name="activity/[id]" />
          {/* Everything the engine has flagged about one athlete. Same reason
              as the run above: it is that athlete's own data, so signed out it
              never mounts and /alerts resolves to nothing. */}
          <Stack.Screen name="alerts" />
          {/*
            The session detail, pushed from a plan row. Registered here rather
            than by the agent that built it, because two concurrent writers to
            this file would have clobbered each other's Screen entry.
          */}
          <Stack.Screen name="plan/[date]" />
        </Stack.Protected>

        {/*
          The coach's three tab screens are NOT named here: they are children of
          the `(tabs)` navigator above, and `(tabs)/_layout.tsx` decides which
          five or three of them exist. Naming `(tabs)/roster` at this level would
          match nothing — the root's children are `(tabs)`, `chat`, `profile`…

          This one is a root screen, so it is declared, and it is guarded on the
          ROLE rather than merely on being signed in. It shows one athlete's
          training data to somebody who is not that athlete, which is a coach's
          job and nobody else's: in an athlete session the route does not exist,
          so a deep link to /coach/athlete/12 has nothing to resolve to. The file
          belongs to a concurrent agent; until it lands, expo-router logs
          `No route named "coach/athlete/[id]"` in dev and drops the entry.
        */}
        <Stack.Protected guard={coach}>
          <Stack.Screen name="coach/athlete/[id]" />
        </Stack.Protected>

        {/*
          ORDER IS LOAD-BEARING HERE, and it did not used to be stated.

          Signed out, `Stack.Protected` removes the authed screens from the
          navigator's `routeNames` entirely, and a cold launch resolves "/" to
          `(tabs)/index` — a route that is then not in the list. React
          Navigation falls back to `routeNames[0]`, which is simply whichever
          screen is written first below. The app's front door was therefore
          decided by JSX order, silently, and was `login` — so a brand-new
          install opened on a form headed "Welcome back."

          `welcome` is first, and `unstable_settings.anchor` at the top of this
          file says so a second time, so neither a reorder nor a new file can
          move the entrance by accident.

          That second half used to be a lie. The comment claimed
          `initialRouteName` said it too and nothing in the project ever set it
          — the belt was here, the braces were not, and the entrance was decided
          by JSX order alone, which is the exact fragility this paragraph
          describes. It is real now, and it is `anchor` rather than
          `initialRouteName` because expo-router v4 renamed the key.
        */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
        </Stack.Protected>

        {/* Reachable either way: required by App Review, and contains nothing
            athlete-derived. */}
        <Stack.Screen name="privacy" />

        {/* The specimen sheet: fixtures only, never a fetch and never a byte of
            anyone's data. Declared rather than left out so that it is a
            decision instead of an oversight — leaving it undeclared did not
            gate it (see the note above), it only hid that it was ungated.

            GUARDED ON `__DEV__` RATHER THAN RETURNING NULL. The screen already
            did the latter, which kept the route in `routeNames` in release: a
            deep link to `runguard://gallery` then opened a blank page whose
            only exit was the invisible edge-swipe, and nothing at all if it was
            the launch URL. `__DEV__` is a compile-time constant, so in a
            release bundle this guard is `false` and the route does not exist —
            an unmatched link falls through to expo-router's own screen, which
            at least says so. */}
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="gallery" />
        </Stack.Protected>
      </Stack>
    </ProfileProvider>
  );
}
