import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Archivo_700Bold, Archivo_800ExtraBold } from "@expo-google-fonts/archivo";
import {
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
} from "@expo-google-fonts/source-sans-3";
import { SplineSansMono_500Medium } from "@expo-google-fonts/spline-sans-mono";

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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SplineSansMono_500Medium,
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
        {/* `auto` follows the appearance: dark glyphs on the cream ground, light
            glyphs on the dark one. Pinned to "dark" it was unreadable in dark mode. */}
        <StatusBar style="auto" />
        <Launch fontsReady={fontsLoaded || Boolean(fontError)} />
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
  const { status } = useSession();
  const reducedMotion = useReducedMotion();

  if (status === "loading") return null;

  const signedIn = status === "in";

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
     */
    <ProfileProvider key={status}>
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
          ORDER IS LOAD-BEARING HERE, and it did not used to be stated.

          Signed out, `Stack.Protected` removes the authed screens from the
          navigator's `routeNames` entirely, and a cold launch resolves "/" to
          `(tabs)/index` — a route that is then not in the list. React
          Navigation falls back to `routeNames[0]`, which is simply whichever
          screen is written first below. The app's front door was therefore
          decided by JSX order, silently, and was `login` — so a brand-new
          install opened on a form headed "Welcome back."

          `welcome` is first, and `initialRouteName` says so a second time, so
          neither a reorder nor a new file can move the entrance by accident.
        */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="pair" />
        </Stack.Protected>

        {/* Reachable either way: required by App Review, and contains nothing
            athlete-derived. */}
        <Stack.Screen name="privacy" />

        {/* Also reachable either way, and declared rather than left out so that
            it is a decision instead of an oversight. `/gallery` is the specimen
            sheet: it renders fixtures only, never a fetch and never a byte of
            anyone's data, and `gallery.tsx` returns null when `!__DEV__`.
            Leaving it undeclared did not gate it — see the note above — it just
            hid the fact that it was ungated. */}
        <Stack.Screen name="gallery" />
      </Stack>
    </ProfileProvider>
  );
}
