/**
 * The front door.
 *
 * WHAT THIS REPLACES. A cold-launched new install used to open on `login.tsx`,
 * headed **"Welcome back."** — copy written for someone who had been here
 * before, on a screen that asked for an email and a password without ever
 * saying what RunGuard was. `Create an account` sat below the primary button as
 * a quiet link. The first thing the product did was ask.
 *
 * Worse, that landing was not a decision. There is no `index.tsx` and no
 * `initialRouteName`, so the entry screen was `routeNames[0]` — whichever
 * `Stack.Screen` happened to be declared first inside `guard={!signedIn}` in
 * `_layout.tsx`. Reordering three JSX lines moved the app's front door with no
 * diff signal. This screen is now declared first AND named as the auth group's
 * initial route, so the entrance is stated twice and by accident neither time.
 *
 * NO "HAS SEEN INTRO" FLAG, deliberately. `auth.ts` holds a contract that
 * `signOut()` clears every key this app stores, and any flag added there would
 * be wiped on unpair — so the intro would replay anyway, and the contract would
 * have grown an exception for a cosmetic value. Signed out IS the condition:
 * this screen exists exactly when there is no session, which is the same
 * question the gate already answers.
 *
 * VOICE. The website sells the coach "See the injury coming before it happens."
 * That is a prediction, and `CLAUDE.md` is explicit that RunGuard is a
 * monitoring signal and never phrases output as diagnosis or forecast — doubly
 * so on the athlete's own screen, where the athlete is a minor. The three lines
 * below are the site's athlete-facing claims, kept because they are true and
 * checkable, in the app's descriptive voice.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { ApiError, getDemoPairing } from "../lib/api";
import { setToken } from "../lib/auth";
import { enterDemo } from "../lib/demo";
import { useSession } from "../lib/session";
import { useReducedMotion } from "../lib/useReducedMotion";
import { dim } from "../theme/press";
import { color } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/** The website's `--ember` stops and its 135°, as on every primary action. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/**
 * The one screen in this app allowed an entrance.
 *
 * `space.ts` states the rule the rest of the app lives by — no entrance
 * animations, skeletons reserve their exact final height — and the reason is
 * that every other screen shows DATA the athlete may tap before it settles.
 * This screen shows no data. Nothing here can arrive late, nothing here can be
 * wrong, and it is read once per install, standing still. So the design study's
 * fadeUp is kept here and nowhere else.
 *
 * WHY THESE ARE LOCAL CONSTANTS AND NOT TOKENS. `duration` in `space.ts` holds
 * `state` (140) and `reveal` (180) — both interaction responses. 420ms with a
 * 45ms stagger is a third kind of motion with exactly one call site, and adding
 * a token the theme cannot yet name would invite a second screen to grow an
 * entrance by reaching for it. See the NEEDS PRIMITIVE note in this change's
 * summary: if a second surface ever earns one, these move to the theme.
 *
 * The rise is `space.md` rather than a guessed offset — the same 4px scale the
 * rest of the file measures with.
 */
const ENTRANCE_DURATION = 420;
const ENTRANCE_STAGGER = 45;
const ENTRANCE_RISE = space.md;

/**
 * `steps` fade-and-rise styles, staggered, collapsed to nothing when the OS is
 * asked for reduced motion.
 *
 * The house style from `useReducedMotion`: keep ONE code path and drive the
 * duration to zero, so the reduced case renders the same tree, just arrived at
 * instantly. Honest caveat — the hook resolves asynchronously and reports
 * `false` until it does, so someone with Reduce Motion on may see a frame or
 * two of movement before the effect re-runs and snaps everything to rest. That
 * is a frame, not an animation, and the alternative (hold the screen blank
 * until the OS answers) is worse on the app's first paint.
 */
function useEntrance(steps: number, reduced: boolean) {
  const values = useRef(
    Array.from({ length: steps }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.stagger(
      reduced ? 0 : ENTRANCE_STAGGER,
      values.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: reduced ? 0 : ENTRANCE_DURATION,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [reduced, values]);

  // Memoised on `values`, which is stable for the mount: interpolating afresh
  // on every render would hang a new node off the same value each time the
  // demo button changes state.
  return useMemo(
    () =>
      values.map((value) => ({
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [ENTRANCE_RISE, 0],
            }),
          },
        ],
      })),
    [values]
  );
}

/**
 * What the athlete gets, in the order they will meet it.
 *
 * Three, not five: this screen is read standing up, once. Each is a fact the
 * app can be held to rather than a promise — you can join solo, the figures
 * come from Health, the coach sees the same numbers you do.
 */
const POINTS = [
  "Check in before practice — two taps, no typing.",
  "Your runs and overnight recovery, read from Apple Health.",
  "Join a team with a code, or train on your own.",
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const reducedMotion = useReducedMotion();
  /**
   * One step per thing that arrives, in reading order. Named rather than
   * indexed so reordering the page cannot silently reorder the stagger.
   */
  const [riseWordmark, riseIntro, risePoints, riseActions, risePolicy] =
    useEntrance(5, reducedMotion);
  /**
   * "off" hides the button entirely. It starts as "idle" and only moves to
   * "off" once the server has actually answered 404 — guessing would either
   * show a button that cannot work or hide one that can.
   */
  const [demoState, setDemoState] = useState<"idle" | "opening" | "off">("idle");
  const [demoError, setDemoError] = useState<string | null>(null);

  function openDemo() {
    if (demoState === "opening") return;
    setDemoError(null);
    setDemoState("opening");
    void (async () => {
      try {
        const { token } = await getDemoPairing();
        /*
         * Order matters: mark the session as a demo BEFORE the token is stored.
         * `enterDemo()` is what makes `lib/api` hold writes on the device, and
         * a screen that mounted between the two would be a live session with a
         * real token and no interception.
         */
        enterDemo();
        await setToken(token);
        await refresh();
        router.replace("/");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setDemoState("off");
          return;
        }
        setDemoError(
          err instanceof ApiError
            ? err.message
            : "The demo could not be opened just now."
        );
        setDemoState("idle");
      }
    })();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Anchored to the top on its own. The rest of the screen is bottom
            weighted for thumb reach, and with the wordmark in that group too
            the whole page floated in the middle of a tall phone with a void
            above it. */}
        <Animated.Text style={[styles.wordmark, riseWordmark]}>
          RunGuard
        </Animated.Text>

        <View style={styles.bottom}>
          <Animated.View style={[styles.top, riseIntro]}>
            <Text style={styles.heading} accessibilityRole="header">
              See how your training is landing.
            </Text>
            <Text style={styles.lede}>
              RunGuard watches your training load and how you are recovering,
              and shows you — and your coach — what it is actually doing to you.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.points, risePoints]}>
            {POINTS.map((point) => (
              <View key={point} style={styles.point}>
                {/* A mark, not an icon set. The one ember on the screen that is
                    not the button, drawn at the same rule weight as every card
                    border so it reads as part of the page. */}
                <View style={styles.pointMark} />
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View style={[styles.actions, riseActions]}>
            <Pressable
              style={styles.primary}
              onPress={() => router.push("/signup")}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <>
                  {/* Pressing drops the gradient to the flat `brandStrong`
                      ground beneath — the idiom login and profile already use,
                      and the fallback if the gradient never draws. NOT `dim`:
                      theme/press is explicit that the ember buttons keep this
                      richer signal instead. */}
                  {pressed ? null : (
                    <LinearGradient
                      colors={color.ember}
                      locations={EMBER_STOPS}
                      start={EMBER_START}
                      end={EMBER_END}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  {/* INK on the ember, never white: white on the lightest stop
                      is 1.67:1. Here the ember is the ground, not the glyph. */}
                  <Text style={styles.primaryLabel}>Create an account</Text>
                </>
              )}
            </Pressable>

            {/* `dim`, not `rowPress`: these are OBJECTS — a bordered button and
                two links — not list surfaces. The whole control dims, border
                and label together, rather than the label alone. */}
            <Pressable
              style={({ pressed }) => [styles.secondary, dim(pressed)]}
              onPress={() => router.push("/login")}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryLabel}>I already have an account</Text>
            </Pressable>

            {/*
              The demo. Third, and quiet: it is the least committing thing on the
              screen, not the recommended one.

              It opens a REAL seeded athlete's record read-only — every write the
              demo makes is kept on this phone and never sent (lib/demo.ts), and
              the server refuses them independently, so nothing typed here can
              reach the roster a coach is being shown.

              Hidden entirely when the server has no demo configured, rather than
              shown and then failing: `getDemoPairing()` 404s when `DEMO_TEAM_ID`
              is unset, and a button that cannot work is worse than no button.
            */}
            {demoState !== "off" ? (
              <Pressable
                style={({ pressed }) => [styles.quiet, dim(pressed)]}
                onPress={openDemo}
                disabled={demoState === "opening"}
                accessibilityRole="button"
                accessibilityState={{ disabled: demoState === "opening" }}
              >
                <Text style={styles.quietLabel}>
                  {demoState === "opening" ? "Opening the demo…" : "Look around first"}
                </Text>
              </Pressable>
            ) : null}

            {demoError ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {demoError}
              </Text>
            ) : null}
          </Animated.View>

          {/*
            The policy, reachable BEFORE anything is asked for.
            `privacy` is declared outside both guards in `_layout.tsx` because App
            Review requires it, but the only link to it lived in Settings — inside
            the authed group. So the three screens that collect an email, a
            password and a permanent credential were the three screens with no way
            to read what happens to any of it.
          */}
          <Animated.View style={risePolicy}>
            <Pressable
              style={({ pressed }) => [styles.policy, dim(pressed)]}
              onPress={() => router.push("/privacy")}
              accessibilityRole="link"
            >
              <Text style={styles.policyLabel}>
                How RunGuard handles your data
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  /**
   * `space-between` pins the wordmark to the top and holds everything else at
   * the bottom, so the things you tap land in the thumb's reach — the same
   * argument as the check-in's three answers — without leaving a void above.
   */
  page: {
    flexGrow: 1,
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
    justifyContent: "space-between",
    gap: layout.section,
  },
  /** Everything that is not the wordmark, held at the bottom together. */
  bottom: { gap: layout.section },
  top: { gap: space.md },
  wordmark: { ...text.title, color: color.brandText },
  heading: { ...text.display, color: color.ink },
  lede: { ...text.base, color: color.ink2 },

  points: { gap: space.md },
  point: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  /**
   * Nudged down by the difference between the line box and the mark, so it sits
   * on the first line's optical centre instead of its top edge. Derived, not a
   * guessed offset.
   *
   * `radius.pill` takes no `borderCurve`: a capsule has no corner for the
   * squircle to shape, so continuous is a no-op there by definition.
   */
  pointMark: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.brand,
    marginTop: ((text.base.lineHeight as number) - space.sm) / 2,
  },
  pointText: { ...text.base, color: color.ink2, flex: 1 },

  actions: { gap: target.gap },
  primary: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  primaryLabel: { ...text.baseSemi, color: color.ink },

  secondary: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    borderCurve: "continuous",
  },
  secondaryLabel: { ...text.baseSemi, color: color.ink },

  /** The third action: no border, no fill — plainly the quietest way in. */
  quiet: { minHeight: target.min, justifyContent: "center", alignItems: "center" },
  quietLabel: { ...text.baseSemi, color: color.muted },
  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2 },

  policy: { minHeight: target.min, justifyContent: "center", alignItems: "center" },
  policyLabel: { ...text.meta, color: color.muted, fontFamily: font.body },
});
