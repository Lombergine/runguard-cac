/**
 * Athlete login. Email + password in, a device token stored, straight to home.
 *
 * `/pair` asks for a token the athlete has to fetch from the web app first. This
 * screen does not: `POST /api/athlete-login`
 * (website/src/app/api/athlete-login/route.ts) answers a correct email and
 * password with `{ ok, name, token }`, so the app can authenticate on its own
 * and the web detour disappears.
 *
 * The token that comes back is the SAME permanent, non-revocable credential
 * `lib/auth.ts` describes. It is written to the Keychain and then dropped. It is
 * never logged, never held in component state, never put in an error message and
 * never rendered — not even as a success confirmation. Neither is the password.
 *
 * `lib/api` cannot make this call: `request()` reads a token out of SecureStore
 * and refuses without one, and the entire point here is to obtain the first one.
 * So this issues its own request, exactly as `pair.tsx` does.
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
  TextInputProps,
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

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

/** The route's own check, so an obvious typo costs no round trip. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The website's `--ember` stops and its 135°, which points down-and-right. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/**
 * The outcomes worth telling apart, in the shape `pair.tsx` uses.
 *
 * `rejected` is the one addition, and it carries the SERVER's sentence rather
 * than a rewrite of it. The route distinguishes two refusals that look identical
 * from here — 401 "Email or password is incorrect." and 400 "This account can't
 * be opened yet — contact your coach." — and only the second is a dead end the
 * athlete cannot fix by retyping. Paraphrasing them into one "login failed"
 * would send someone hunting for a typo that isn't there. Those strings are
 * fixed copy from the handler; they never contain the password or the token.
 */
type Problem =
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "rejected"; message: string }
  | { kind: "network" }
  | { kind: "server"; status: number }
  | { kind: "noToken" }
  | { kind: "storage" };

function explain(problem: Problem): string {
  switch (problem.kind) {
    case "empty":
      return "Enter your email and password.";
    case "malformed":
      return "That email doesn't look right. Check it and try again.";
    case "rejected":
      return problem.message;
    case "network":
      // The base URL is shown deliberately: a wrong EXPO_PUBLIC_API_URL, or
      // `localhost` on a physical phone, is otherwise invisible from here.
      return `Could not reach the server at ${BASE_URL}. On a phone that address must be the computer's LAN address, not localhost.`;
    case "server":
      return `The server answered with ${problem.status}. You are not logged in.`;
    case "noToken":
      return "The server logged you in but sent nothing this app can use to stay logged in. Contact your coach.";
    case "storage":
      return "Your login could not be saved to this device's keychain. You are not logged in.";
  }
}

/** The `error` string a route sends with a 4xx, if there is one. */
function messageOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

function tokenOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const token = (body as { token?: unknown }).token;
  return typeof token === "string" && token ? token : null;
}

/**
 * POST /api/athlete-login. Resolves to the token, or to the reason there isn't
 * one. The caller stores the token and forgets it; nothing else reads the body.
 */
async function login(
  email: string,
  password: string
): Promise<{ token: string } | { problem: Problem }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/athlete-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
  } catch {
    // The thrown value can echo the request — and this request body holds the
    // password. It is discarded rather than surfaced or logged.
    return { problem: { kind: "network" } };
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message = messageOf(body);
    return {
      problem: message
        ? { kind: "rejected", message }
        : { kind: "server", status: res.status },
    };
  }

  // The route answers email+password with a token or with a 400, so this is the
  // branch the types force rather than one the current server can reach. It
  // exists so a contract change degrades into a sentence instead of a crash.
  const token = tokenOf(body);
  return token ? { token } : { problem: { kind: "noToken" } };
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  function attempt() {
    if (busy) return;
    const address = email.trim();
    if (!address || !password) return setProblem({ kind: "empty" });
    if (!EMAIL_SHAPE.test(address)) return setProblem({ kind: "malformed" });

    setProblem(null);
    setBusy(true);
    void (async () => {
      const result = await login(address, password);
      if ("problem" in result) {
        setProblem(result.problem);
        setBusy(false);
        return;
      }
      try {
        await setToken(result.token);
      } catch {
        // SecureStore rejects on web and on a locked keychain. The error object
        // can carry the value, so it is swallowed like it is in lib/auth.
        setProblem({ kind: "storage" });
        setBusy(false);
        return;
      }
      // Clear the password out of component state on the way out. The token was
      // never in it.
      setPassword("");
      setBusy(false);
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
            <Text style={styles.eyebrow}>LOG IN</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.body}>
              Use the email and password from your RunGuard account. This signs the
              app in on its own — you do not need a device token.
            </Text>

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              placeholder="you@school.edu"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              spellCheck={false}
              returnKeyType="next"
            />

            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={attempt}
            />

            <Pressable
              style={styles.action}
              onPress={attempt}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
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
                    {busy ? "Logging in…" : "Log in"}
                  </Text>
                </>
              )}
            </Pressable>

            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {explain(problem)}
              </Text>
            ) : null}

            <Pressable
              style={styles.alt}
              onPress={() => router.replace("/signup")}
              disabled={busy}
              accessibilityRole="link"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.altLabel}>No account yet? Create one</Text>
            </Pressable>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * One form row in the website's Panel hierarchy (`Panel`,
 * website/src/components/athlete/tabs.tsx:22): semibold title left, muted note
 * right, content underneath. Here the note is the field's caveat.
 */
function Field({
  label,
  note,
  ...input
}: { label: string; note?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{label}</Text>
        {note ? <Text style={styles.panelNote}>{note}</Text> : null}
      </View>
      <TextInput
        style={styles.input}
        placeholderTextColor={color.muted}
        accessibilityLabel={label}
        {...input}
      />
    </View>
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

  field: { marginTop: space.xl, gap: space.sm },
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  panelTitle: { ...text.meta, fontFamily: font.bodySemi, color: color.ink },
  /** The caveat. Always the right-hand side, always muted (5.16:1 on card). */
  panelNote: { ...text.meta, color: color.muted },
  /**
   * Sunken against the white card, the way the empty slot is: the field is a
   * hole to type into, and on the cream ground `bg` no longer reads as one.
   */
  input: {
    ...text.base,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    // Explicit, because Android's default TextInput padding top-aligns the text
    // in a fixed-height box. 12 + the 24 line box + 12 is exactly target.min,
    // so the tap target and the drawn field are the same rectangle.
    paddingVertical: space.md,
    minHeight: target.min,
  },

  /**
   * The ember signature, on the one thing you tap. The gradient is laid in
   * absolutely over this ground, so `brandStrong` is both the pressed state and
   * the fallback if the gradient ever fails to draw.
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
   * INK on the ember, not white: white on the lightest stop is 1.67:1, `ink` is
   * 5.97:1 on the darkest and 10.03:1 on the lightest. Not `brandText`, because
   * here the ember is the ground rather than the glyph.
   */
  actionLabel: { ...text.baseSemi, color: color.ink },
  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2, marginTop: space.md },
  alt: {
    minHeight: target.min,
    justifyContent: "center",
    marginTop: target.gap,
  },
  altLabel: { ...text.baseSemi, color: color.brandText },
});
