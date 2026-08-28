/**
 * Pairing. The athlete copies a device token from the web app (Profile → Pair
 * the RunGuard iPhone app) and pastes it here; this screen proves it works
 * before storing it, then leaves.
 *
 * The token NEVER EXPIRES and cannot be revoked (`newDeviceToken()`,
 * `website/src/lib/db.ts`), so this file is held to the same rule as
 * `lib/auth.ts`: it is never logged, never put in an error message, and never
 * rendered back once it has been stored. Nothing here prints one, and nothing
 * added here should either.
 *
 * `lib/api` cannot do the verifying call: `request()` reads the token out of
 * SecureStore, and the whole point is to check a token that is NOT stored yet.
 * Storing first and rolling back on failure would put an unproven token in the
 * keychain, so this issues the one request itself instead.
 */
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";

import { Card } from "../components/Card";
import { List, ListRow } from "../components/List";
import { BASE_URL } from "../lib/api";
import { setToken } from "../lib/auth";
import { useSession } from "../lib/session";
import { useBackOnlyHeader } from "../theme/header";
import { dim } from "../theme/press";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, space, target } from "../theme/space";

/** `dt_` + 20 random bytes as lowercase hex. An exact shape, so check it exactly. */
const TOKEN_SHAPE = /^dt_[0-9a-f]{40}$/;

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

/** The website's `--ember` stops and its 135°, which points down-and-right. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/**
 * Static dot path — Expo inlines `EXPO_PUBLIC_*` by textual substitution at
 * build time, so a computed lookup comes back undefined. Same read as
 * `lib/auth.ts`, `__DEV__` guard included.
 *
 * That guard is the whole point: `__DEV__` is a compile-time constant, so in a
 * release bundle this expression folds to `null` and neither the token nor the
 * button that spends it reaches the shipped JavaScript. Without it, a release
 * build produced on a machine with the variable set would bake a live,
 * non-expiring device token for a real athlete into a bundle anyone can read.
 */
const DEV_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_DEV_TOKEN || null : null;

/**
 * The outcomes worth telling apart. The three that matter are a token that is
 * the wrong shape, a token the server rejects, and a server that is not there —
 * each has a different fix, and collapsing them leaves the athlete guessing.
 */
type Problem =
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "unauthorized" }
  | { kind: "network" }
  | { kind: "server"; status: number }
  | { kind: "storage" };

/**
 * A NODE, not a string, for the reason `PanelProps.note` is one: three of these
 * sentences carry a machine literal — a character count, a base URL, a status
 * code — and every figure in this app is mono and tabular (non-negotiable #3).
 * A figure set in the body face is one the athlete has to take on trust; these
 * are the sentences that exist to be checked character by character against
 * another screen, so their figures have to read as figures.
 */
function explain(problem: Problem): ReactNode {
  switch (problem.kind) {
    case "empty":
      return "Paste the device token from the web app before pairing.";
    case "malformed":
      return (
        <>
          That is not the shape of a device token. It begins with dt_ and has{" "}
          <Text style={styles.figure}>40</Text> hexadecimal characters after that.
          Copy the whole line.
        </>
      );
    case "unauthorized":
      return "That token was not recognised. Open Profile → Pair the RunGuard iPhone app on the web app and copy it again.";
    case "network":
      // The base URL is shown deliberately: a wrong EXPO_PUBLIC_API_URL, or
      // `localhost` on a physical phone, is otherwise invisible from here. It
      // is an address to be proof-read against a browser's URL bar, so it takes
      // the figure face — the host and port are what is usually wrong.
      return (
        <>
          Could not reach the server at{" "}
          <Text style={styles.figure}>{BASE_URL}</Text>. On a phone that address
          must be the computer&apos;s LAN address, not localhost.
        </>
      );
    case "server":
      return (
        <>
          The server answered with{" "}
          <Text style={styles.figure}>{problem.status}</Text>. Nothing was paired.
        </>
      );
    case "storage":
      return "The token could not be saved to this device's keychain. Nothing was paired.";
  }
}

/**
 * GET /api/mobile/me with the candidate token. Returns the problem, or null
 * when the server accepted it. The body is not read: a valid response is the
 * athlete's whole profile, and pairing only needs the status.
 */
async function verify(token: string): Promise<Problem | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch {
    // The thrown value can echo the request, Authorization header included.
    // It is discarded rather than surfaced or logged.
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) return { kind: "server", status: res.status };
  return null;
}

export default function PairScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [checking, setChecking] = useState(false);

  /** Shape first, then the server. Both paths — paste and dev token — go here. */
  function attempt(candidate: string) {
    if (checking) return;
    const token = candidate.trim();
    if (!token) return setProblem({ kind: "empty" });
    if (!TOKEN_SHAPE.test(token)) return setProblem({ kind: "malformed" });

    setProblem(null);
    setChecking(true);
    void (async () => {
      const failure = await verify(token);
      if (failure) {
        setProblem(failure);
        setChecking(false);
        return;
      }
      try {
        await setToken(token);
      } catch {
        // SecureStore rejects on web and on a locked keychain. The error object
        // can carry the value, so it is swallowed like it is in lib/auth.
        setProblem({ kind: "storage" });
        setChecking(false);
        return;
      }
      // Drop it out of component state on the way out, so no render after this
      // point can put it back on screen.
      setDraft("");
      setChecking(false);
      // Writing the keychain is not signing in — see the same call in
      // `login.tsx`. The gate reads `useSession().status`, resolved once at
      // launch; without `refresh()` it stays "out", the authed group stays
      // unmounted, and `replace("/")` has no screen to land on.
      await refresh();
      router.replace("/");
    })();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Back only — these screens carry their own heading in the content. */}
      <Stack.Screen options={useBackOnlyHeader()} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={styles.eyebrow}>PAIR THIS DEVICE</Text>
            <Text style={styles.title}>Paste your device token</Text>
            <Text style={styles.body}>
              On the RunGuard web app, open Profile → Pair the RunGuard iPhone app and
              copy the token shown there.
            </Text>

            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              editable={!checking}
              placeholder="dt_"
              placeholderTextColor={color.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              // Deliberately visible: it is an opaque code being checked
              // character by character against another screen.
              secureTextEntry={false}
              multiline
              accessibilityLabel="Device token"
            />

            <Text style={styles.note}>
              The token identifies this device to RunGuard. It does not expire, so keep
              it to yourself.
            </Text>

            <Pressable
              style={styles.action}
              onPress={() => attempt(draft)}
              disabled={checking}
              accessibilityRole="button"
              accessibilityState={{ disabled: checking }}
            >
              {({ pressed }) => (
                <>
                  {/* Pressing drops the gradient and reveals the flat
                      `brandStrong` ground beneath it — a deeper, calmer ember,
                      and a token rather than a hand-mixed press tint. */}
                  {pressed ? null : (
                    <LinearGradient
                      colors={color.ember}
                      locations={EMBER_STOPS}
                      start={EMBER_START}
                      end={EMBER_END}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={styles.actionLabel}>
                    {checking ? "Checking…" : "Pair"}
                  </Text>
                </>
              )}
            </Pressable>

            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {explain(problem)}
              </Text>
            ) : null}

            {DEV_TOKEN ? (
              <Pressable
                // An object, not a surface, so it dims rather than flashing a
                // fill. See theme/press.
                style={({ pressed }) => [styles.dev, dim(pressed)]}
                onPress={() => attempt(DEV_TOKEN)}
                disabled={checking}
                accessibilityRole="button"
                accessibilityState={{ disabled: checking }}
              >
                <Text style={styles.devLabel}>Use development token</Text>
              </Pressable>
            ) : null}
          </Card>

          {/* The other two doors. An athlete who arrives here holding an email
              and a password rather than a token is otherwise stranded: this
              screen can only accept a token. `replace`, not `push`, because the
              three entry points are equivalent rather than nested — a back
              stack of half-filled sign-in forms is not worth preserving.

              A grouped list rather than two tinted text links, and OUTSIDE the
              card: each row goes to another screen, which is the shape
              `ListRow` exists for, and the chevron is what promises there is a
              screen underneath. Leaving them inside the card would have made
              them read as part of the pairing form they are the alternative to.

              The `checking` guard moved inside each handler because `ListRow`
              takes no `disabled` — a tap mid-verification is ignored either
              way, and the rows never looked disabled to begin with. */}
          <List header="Other ways in" style={styles.alternatives}>
            <ListRow
              title="Sign in with email instead"
              chevron
              onPress={() => {
                if (checking) return;
                router.replace("/login");
              }}
            />
            <ListRow
              title="Create an account"
              chevron
              isLast
              onPress={() => {
                if (checking) return;
                router.replace("/signup");
              }}
            />
          </List>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  page: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
  },
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.title, color: color.ink, marginTop: space.md },
  body: { ...text.base, color: color.ink2, marginTop: space.md },
  /** Mono because it is a code, not prose, and misread characters cost a retry. */
  input: {
    ...text.base,
    fontFamily: font.mono,
    color: color.ink,
    // Sunken against the white card, the way the empty slot is: the field is a
    // hole to paste into. The system fill with no border — the design's `.fld`.
    backgroundColor: color.fill,
    borderCurve: "continuous",
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: target.min * 1.5,
    marginTop: space.xl,
  },
  note: { ...text.meta, color: color.muted, marginTop: space.sm },
  /**
   * The ember signature, on the one thing you tap. The gradient is laid in
   * absolutely over this ground, so `brandStrong` is both the pressed state and
   * the fallback if the gradient ever fails to draw — either way the label keeps
   * a real background to sit on.
   */
  action: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    // The squircle iOS draws itself — every non-pill corner in the app carries
    // it, and the gradient clipped inside is where it shows most.
    borderCurve: "continuous",
    marginTop: space.xl,
    overflow: "hidden",
  },
  /**
   * INK on the ember, not white. White on the lightest stop is 1.67:1 and
   * illegible in the exact conditions this app is used in; `ink` measures 5.97:1
   * on the darkest stop, 10.03:1 on the lightest, and 5.25:1 on the pressed
   * `brandStrong`. This is also why the label is not `brandText`: here the ember
   * is the ground, not the glyph.
   */
  actionLabel: { ...text.baseSemi, color: color.ink },
  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2, marginTop: space.md },
  /**
   * A figure inside one of those sentences. Nested in `problem`, so it inherits
   * that size and colour and changes only the face — the mono, tabular figures
   * every numeral in this app is required to have.
   */
  figure: { fontFamily: font.mono, ...tabular },
  dev: {
    minHeight: target.min,
    justifyContent: "center",
    marginTop: target.gap,
  },
  devLabel: { ...text.baseSemi, color: color.muted },
  /**
   * The grouped list of other doors, one section below the card. The rows carry
   * their own 52pt height and their own separator, so nothing here spaces them.
   */
  alternatives: { marginTop: layout.section },
});
