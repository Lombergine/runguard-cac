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

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Render nothing rather than a half-styled frame. The splash is still up.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SessionProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Gate />
      </SafeAreaProvider>
    </SessionProvider>
  );
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
          animation: "fade",
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
        </Stack.Protected>

        <Stack.Protected guard={!signedIn}>
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
