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
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          animation: "fade",
        }}
      />
    </SafeAreaProvider>
  );
}
