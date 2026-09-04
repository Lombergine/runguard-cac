import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Outfit_700Bold, Outfit_800ExtraBold } from "@expo-google-fonts/outfit";
import { Nunito_500Medium, Nunito_700Bold } from "@expo-google-fonts/nunito";
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

import { ProfileProvider } from "../lib/profileStore";
import { SessionProvider, useSession } from "../lib/session";
import { color, useColors } from "../theme/tokens";
import { font } from "../theme/type";

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
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Nunito_500Medium,
    Nunito_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Render nothing rather than a half-styled frame. The splash is still up.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SessionProvider>
      <SafeAreaProvider>
        {/* "auto" — dark glyphs on the light theme, light on the dark one. */}
        <StatusBar style="auto" />
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
  const hex = useColors();
  const { status, coachStatus } = useSession();

  // BOTH keychain reads must land before anything mounts. Rendering on the
  // first of the two would pick a navigator from half the answer, and the
  // half-answer case is a coach with no athlete pairing: `status` resolves
  // "out" first and the auth group mounts, so the coach sees an athlete login
  // for a frame before being moved. Guessing wrong for one frame is exactly
  // what this gate exists to stop.
  if (status === "loading" || coachStatus === "loading") return null;

  const signedIn = status === "in";
  const coachIn = coachStatus === "in";

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
          // For the screens that do show a header: no "(tabs)" fallback text
          // beside the chevron, and the bar in the app's own ground and type.
          headerBackButtonDisplayMode: "minimal",
          /*
           * RESOLVED HEX, not the dynamic tokens.
           *
           * The native stack header is a UIKit surface, and it does not resolve
           * a `DynamicColorIOS` value the way a React Native style prop does —
           * it fell back to its own light material, so "Run" and "Profile"
           * rendered as a white bar with dark text sitting on top of a
           * near-black app, with the status bar unreadable across the seam.
           * `useColors()` hands over plain strings, which UIKit does take, and
           * the hook re-renders on an appearance change so the header still
           * follows the theme.
           */
          headerTintColor: hex.ink,
          headerStyle: { backgroundColor: hex.bg },
          headerTitleStyle: { fontFamily: font.displayBold, fontSize: 17, color: hex.ink },
          headerShadowVisible: false,
          /**
           * The platform push — on iOS a slide from the right with the
           * interactive back-swipe. This was "fade" for every screen, so
           * opening a run or settings crossfaded in place with no sense of
           * depth and no way to swipe back, which is most of what made the app
           * read as a web view. The entry screens below opt back into the fade:
           * there the whole root is being swapped, not a screen pushed.
           */
          animation: "default",
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
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
          <Stack.Screen name="login" options={{ animation: "fade" }} />
          <Stack.Screen name="signup" options={{ animation: "fade" }} />
        </Stack.Protected>

        {/*
          THE COACH SIDE, on its own credential and its own gate.

          Guarded by `coachIn`, never by `signedIn`. The two sessions are
          independent: a coach usually has no athlete pairing, so deriving one
          from the other would lock them out of their own team, and one phone
          may hold both for a coach who also runs.

          The same deny-list rule as everything above applies — these files are
          declared here precisely so they are a decision. A coach route left
          undeclared would be reachable while signed out, and the roster is an
          entire team's health data.
        */}
        <Stack.Protected guard={coachIn}>
          {/* The coach's own tab navigator: dashboard, roster, calendar,
              sources — the same places the website's coach nav names. The
              GROUP is guarded, so a tab added inside it inherits this gate;
              only routes outside the group need their own line below. */}
          <Stack.Screen name="coach/(tabs)" options={{ animation: "fade" }} />
          {/* Pushed from the roster, so it sits outside the tabs rather than
              becoming a fourth one: it is one athlete, not a section. */}
          <Stack.Screen name="coach/athlete/[id]" />
          {/* One run, pushed from that athlete's Training section. Declared
              here for the same reason as everything else: the gate is a
              deny-list, so an undeclared route file is reachable signed out. */}
          <Stack.Screen name="coach/activity/[id]" />
        </Stack.Protected>

        {/*
          Declared WITHOUT a guard, unlike every other auth screen, and that is
          a decision rather than an oversight.

          A guarded `!coachIn` version unmounts itself the instant sign-in
          succeeds — `refreshCoach()` flips the gate, this screen leaves the
          tree, and the `router.replace("/coach")` on the next line never lands.
          Measured: sign-in stored the token correctly and then dropped the
          coach on the ATHLETE home, because the navigator re-resolved to the
          first mounted group instead. Staying mounted long enough to navigate
          is the whole reason.

          It is safe to leave reachable because it holds nothing: an empty form
          and two inputs, no team data, no roster, no token rendered. Signing in
          again simply re-mints the same signed value. The screens that DO hold
          a team's health data — the roster and the athlete detail — stay behind
          `coachIn` above.
        */}
        <Stack.Screen name="coach/login" options={{ animation: "fade" }} />

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
