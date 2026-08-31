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
 * VOICE. The headline and the lede are the design's, verbatim, and they are the
 * website's own sell. An earlier revision of this file rejected them as a
 * forecast, on `CLAUDE.md`'s rule that RunGuard never phrases output as
 * diagnosis. Two things settle it the other way. That rule governs OUTPUT —
 * what the app says about a particular athlete on a particular day, which is
 * §Status-and-advisory's territory and is unaffected by anything on this
 * screen. And the design pairs the claim with the footnote below the actions —
 * "Not medical advice. RunGuard monitors training load and recovery." — which
 * is the disclaimer that objection was asking for, placed where the athlete
 * reads it before they have typed anything. The claim is also checkable: the
 * app does read Apple Health, and it does tell a coach who is carrying more
 * load than usual.
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
import Svg, { Path } from "react-native-svg";

import { List, ListRow } from "../components/List";
import { Section } from "../components/Section";
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
 * The onboarding glyphs, on the same 24-unit grid and at the same rule weight
 * as the tab bar's — the icon vocabulary is one system or it is noise. Stroked,
 * never filled, so a glyph and a card border are the same line.
 */
const GRID = 24;
/**
 * The tinted disc the glyph sits on, and the glyph drawn inside it.
 *
 * Both are derived from TYPE metrics rather than from the spacing scale, which
 * is the rule this file already followed for its glyph: `space.ts` is explicit
 * that welding a size to a spacing step means a padding change silently
 * reshapes something else. The disc takes `text.statLarge`'s line box and the
 * glyph `text.meta`'s, so a 34pt disc carries a 20pt mark with even air around
 * it — the design's "small glyph on a tinted disc" at the app's own measures.
 */
const DISC_SIZE = text.statLarge.lineHeight as number;
const GLYPH_SIZE = text.meta.lineHeight as number;

/** Two arcs chasing each other — the workout arriving on its own. */
const SYNC =
  "M4.5 12 A7.5 7.5 0 0 1 18.4 8.2 M18.9 5 L18.4 8.2 L15.2 8.6 " +
  "M19.5 12 A7.5 7.5 0 0 1 5.6 15.8 M5.1 19 L5.6 15.8 L8.8 15.4";
/** A tick. The check-in is two taps and nothing else. */
const CHECK = "M4 12.5 L9.5 18 L20 6.5";
/**
 * Three written lines, the last one short.
 *
 * Deliberately NOT an eye, a magnifier or anything else from the watching
 * vocabulary: this point is that the app writes down what it saw and stops
 * there. A surveillance glyph would say the opposite of the sentence beside it,
 * and it is the sentence the whole product rests on.
 */
const NOTE = "M5 7.5 H19 M5 12 H19 M5 16.5 H12.5";

/**
 * `brandStrong`, not `brand`: a 1.5pt stroke needs the 3:1 floor a drawn
 * element is held to, and `brand` measures 2.01:1. The same split the tab bar
 * makes between its glyph and its label.
 */
function Glyph({ d }: { d: string }) {
  return (
    <View style={styles.disc}>
      <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox={`0 0 ${GRID} ${GRID}`}>
        <Path
          d={d}
          fill="none"
          stroke={color.brandStrong}
          strokeWidth={(ruleWidth * GRID) / GLYPH_SIZE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * What the athlete gets, in the order the design puts them in.
 *
 * Three, not five: this screen is read standing up, once. Each is a fact the
 * app can be held to rather than a promise — the runs really do arrive on their
 * own, the check-in really is two taps, and the third one is the product's
 * whole position rather than a feature.
 *
 * ROWS, not cards. This used to be three `Card`s, which put three elevated
 * surfaces above the primary action and made the list compete with it. The
 * design draws them as plain rows on the page ground with the tinted disc doing
 * the marking, so the only raised things on the screen are the two you tap.
 */
const POINTS = [
  {
    glyph: SYNC,
    title: "Syncs itself",
    body: "Runs arrive from Apple Health the moment a workout ends.",
  },
  {
    glyph: CHECK,
    title: "Two taps a day",
    body: "Sleep, then soreness. That's the whole check-in.",
  },
  {
    glyph: NOTE,
    title: "Describes, never instructs",
    body: "It says what was observed. Your coach decides.",
  },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const reducedMotion = useReducedMotion();
  /**
   * One step per thing that arrives, in reading order. Named rather than
   * indexed so reordering the page cannot silently reorder the stagger.
   */
  const [riseWordmark, riseIntro, risePoints, riseActions, riseDemo, risePolicy] =
    useEntrance(6, reducedMotion);
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
              See the injury coming before it happens
            </Text>
            <Text style={styles.lede}>
              RunGuard reads your training from Apple Health, and tells your
              coach who needs a lighter day — before practice starts.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.points, risePoints]}>
            {POINTS.map((point) => (
              <View key={point.title} style={styles.point}>
                <Glyph d={point.glyph} />
                <View style={styles.pointBody}>
                  <Text style={styles.pointTitle}>{point.title}</Text>
                  <Text style={styles.pointText}>{point.body}</Text>
                </View>
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

            {/*
              The second door, as the design's outlined CTA rather than the
              eyebrow'd grouped row it was.

              Two buttons is the design's shape and it is also the truer one:
              signing up and signing in are the same KIND of act, and putting
              one on a chevron row under a "Sign in" eyebrow ranked it below the
              demo. Outlined at `ruleWidth`, with no fill and no ember — this
              screen spends its one accent on the button above, and a second
              filled button would make neither of them the answer.

              `dim`, not the gradient drop: there is no gradient to drop, and
              `theme/press` gives a bordered control the opacity fade.
            */}
            <Pressable
              style={({ pressed }) => [styles.secondary, dim(pressed)]}
              onPress={() => router.push("/login")}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryLabel}>I already have an account</Text>
            </Pressable>

            {/*
              The design's footnote, and the disclaimer the headline above is
              held to. Muted and at note rank deliberately: it is a standing
              condition on the whole screen rather than a warning, and
              `visual-spec.md` §Status-and-advisory is categorical that nothing
              in this app is styled to shout.
            */}
            <Text style={styles.footnote}>
              Not medical advice. RunGuard monitors training load and recovery.
            </Text>
          </Animated.View>

          {/*
            The demo. Last, and quiet: it is the least committing thing on the
            screen, not the recommended one.

            It opens a REAL seeded athlete's record read-only — every write the
            demo makes is kept on this phone and never sent (lib/demo.ts), and
            the server refuses them independently, so nothing typed here can
            reach the roster a coach is being shown.

            ONE row. The design offers an athlete demo and a coach demo; there
            is no coach anything on the phone — `_layout.tsx` has no coach group
            and `/api/mobile/*` has no coach surface — so a second row would be
            a door onto nothing.

            The row does NOT name the athlete. The design labels it "Ethan Park,
            grade 11 — mid-season, shin settling", and this app cannot stand
            behind any of that: `website/src/lib/demoAthlete.ts` picks whoever
            `DEMO_ATHLETE_ID` names and falls back to the alphabetically first
            runner on the demo team, so the name is a deployment setting, and
            the seed has Ethan in grade 10 rather than 11. Printing an identity
            the client never resolved is the failure `visual-spec.md` names
            under "Fails closed" — a surface must never render data with an
            unconfirmed name attached. What replaces it is the one thing about
            the demo that is true on every deployment.

            Hidden entirely when the server has no demo configured, rather than
            shown and then failing: `getDemoPairing()` 404s when `DEMO_TEAM_ID`
            is unset, and a button that cannot work is worse than no button.

            While it is opening the row loses its `onPress`, which makes it
            genuinely inert — no chevron, no flash, no role — rather than a row
            that still looks followable and is not. That is `List`'s rule, and
            it is what `disabled` used to approximate here.
          */}
          <Animated.View style={[styles.demo, riseDemo]}>
            {demoState !== "off" ? (
              <Section label="Or open a demo">
                <List>
                  <ListRow
                    title={
                      demoState === "opening"
                        ? "Opening the demo…"
                        : "Athlete demo"
                    }
                    sub="Someone else's season. Nothing you tap is saved."
                    onPress={demoState === "opening" ? undefined : openDemo}
                    chevron
                    isLast
                  />
                </List>
              </Section>
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
  /**
   * `text.display`, NOT the design's 34.
   *
   * The design sets this headline at 700/34/-0.5, and both of the app's 34pt
   * display roles are spoken for by name in `type.ts`: `prompt` is the check-in
   * question "and nothing else", and `largeTitle` is the native stack's
   * collapsing nav title, explicitly "NOT a role a screen sets on a `Text`".
   * `text.display`'s own docblock was written for this exact line — "a screen
   * whose whole job is one sentence… spending [prompt] on a welcome headline
   * would put the app's loudest type on the one screen an athlete sees once".
   * It carries the design's weight (800) and its negative tracking; only the
   * size steps down.
   */
  heading: { ...text.display, color: color.ink },
  lede: { ...text.base, color: color.ink2 },

  points: { gap: space.lg },
  /** A row on the page ground: disc, then the two lines beside it. */
  point: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  /**
   * The tinted disc. `accentSoft` is the ember wash — a SHAPE tinted with the
   * accent, with the mark itself drawn in `brandStrong` on top of it, so
   * nothing legible ever lands on the 2.01:1 fill.
   */
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pointBody: { flex: 1, gap: space.xs },
  pointTitle: { ...text.baseSemi, color: color.ink },
  pointText: { ...text.meta, color: color.ink2 },

  /**
   * The two CTAs and their footnote, as one block. `space.md` between them —
   * they are one decision offered two ways, not two sections, and they still
   * clear `target.gap`.
   */
  actions: { gap: space.md },
  /**
   * `radius.control`, not the design's 14.
   *
   * 14 is `radius.card` — the CONTENT-surface role. Every button in this app
   * takes `radius.control` (10), including the login screen this one pushes
   * to, so adopting the design's corner on the three signed-out screens alone
   * would put two button shapes one tap apart. The same argument holds for the
   * design's 16pt vertical padding: `target.min` is the app's control height
   * everywhere. Both are worth changing — as one change, across all of them.
   */
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
  /** Outlined at `ruleWidth`, the design's 1.5 — and the app's only line weight. */
  secondary: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderWidth: ruleWidth,
    borderColor: color.ruleStrong,
    borderRadius: radius.control,
    borderCurve: "continuous",
  },
  secondaryLabel: { ...text.baseSemi, color: color.ink },
  /** The standing disclaimer. Note rank, muted, no fill and no border. */
  footnote: { ...text.meta, color: color.muted },

  /**
   * The demo group and the one sentence that explains a failed attempt to open
   * it, as a single entrance step. `space.md`, not `layout.section`: the error
   * belongs to the row above it rather than following it as a section.
   */
  demo: { gap: space.md },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2 },

  policy: { minHeight: target.min, justifyContent: "center", alignItems: "center" },
  policyLabel: { ...text.meta, color: color.muted, fontFamily: font.body },
});
