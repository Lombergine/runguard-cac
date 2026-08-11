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
 * has nothing to resolve to and falls through to the auth group.
 *
 * `status === "loading"` renders neither group, because guessing wrong for one
 * frame is exactly how a signed-out phone flashes someone else's readiness.
 */
function Gate() {
  const { status } = useSession();

  if (status === "loading") return null;

  const signedIn = status === "in";

  return (
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
      </Stack.Protected>

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="pair" />
      </Stack.Protected>

      {/* Reachable either way: required by App Review, and contains nothing
          athlete-derived. */}
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
