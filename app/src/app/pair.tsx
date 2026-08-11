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
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { Card } from "../components/Card";
import { BASE_URL } from "../lib/api";
import { setToken } from "../lib/auth";
import { color } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

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
 * `lib/auth.ts`.
 */
const DEV_TOKEN = process.env.EXPO_PUBLIC_DEV_TOKEN || null;

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

function explain(problem: Problem): string {
  switch (problem.kind) {
    case "empty":
      return "Paste the device token from the web app before pairing.";
    case "malformed":
      return "That is not the shape of a device token. It begins with dt_ and has 40 hexadecimal characters after that. Copy the whole line.";
    case "unauthorized":
      return "That token was not recognised. Open Profile → Pair the RunGuard iPhone app on the web app and copy it again.";
    case "network":
      // The base URL is shown deliberately: a wrong EXPO_PUBLIC_API_URL, or
      // `localhost` on a physical phone, is otherwise invisible from here.
      return `Could not reach the server at ${BASE_URL}. On a phone that address must be the computer's LAN address, not localhost.`;
    case "server":
      return `The server answered with ${problem.status}. Nothing was paired.`;
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
      router.replace("/");
    })();
  }

  return (
    <SafeAreaView style={styles.safe}>
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
              placeholderTextColor={color.muted}
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
                style={styles.dev}
                onPress={() => attempt(DEV_TOKEN)}
                disabled={checking}
                accessibilityRole="button"
                accessibilityState={{ disabled: checking }}
              >
                <Text style={styles.devLabel}>Use development token</Text>
              </Pressable>
            ) : null}
          </Card>
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
    // hole to paste into, and on the cream ground `bg` no longer reads as one.
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
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
  dev: {
    minHeight: target.min,
    justifyContent: "center",
    marginTop: target.gap,
  },
  devLabel: { ...text.baseSemi, color: color.muted },
});
