/**
 * The front door. One screen, two ways in.
 *
 * There used to be three doors — this one, `/pair` (paste a device token) and
 * `/signup` — and nothing told a new athlete which was theirs. `/signup` is
 * genuinely a different act, so it stays a separate screen with a link both
 * ways. Logging in is not: email+password and a pairing code are two ways to
 * obtain the SAME credential, so they belong under one header with a switch.
 *
 *   Password       POST /api/athlete-login  → { ok, name, token }
 *   Pairing code   GET  /api/mobile/me      with the pasted token, status only
 *
 * `/pair` still exists and is untouched; this screen carries a port of its
 * verification path, not a call into it.
 *
 * Both paths end at the same permanent, non-revocable credential `lib/auth.ts`
 * describes. It is written to the Keychain and then dropped: never logged, never
 * put in an error message, never rendered — not even as a success confirmation.
 * Neither is the password. The one exception to "don't show it" is the pairing
 * field itself, which the athlete is proof-reading against another screen and
 * has not yet stored anywhere.
 *
 * `lib/api` can do neither call: `request()` reads a token out of SecureStore
 * and refuses without one, and the entire point here is to obtain the first one
 * (or to check one that is deliberately NOT stored yet — storing first and
 * rolling back would put an unproven token in the keychain). So this issues both
 * requests itself.
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
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";

import { Card } from "../components/Card";
import { List, ListRow } from "../components/List";
import { Section } from "../components/Section";
import { BASE_URL } from "../lib/api";
import { setToken } from "../lib/auth";
import { useSession } from "../lib/session";
import { useBackOnlyHeader } from "../theme/header";
import { dim } from "../theme/press";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

/** The route's own check, so an obvious typo costs no round trip. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** `dt_` + 20 random bytes as lowercase hex. An exact shape, so check it exactly. */
const TOKEN_SHAPE = /^dt_[0-9a-f]{40}$/;

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

type Mode = "password" | "pairing";

const MODES = [
  { id: "password", label: "Password" },
  { id: "pairing", label: "Pairing code" },
] as const;

/**
 * The outcomes worth telling apart, in the shape `pair.tsx` uses, widened to
 * cover both doors. Each kind has a different fix, and collapsing any two of
 * them leaves the athlete guessing:
 *
 *   unauthorized  the server refused a pairing code — pairing only
 *   rejected      the server refused a login and SAID WHY — password only.
 *                 It carries the server's own sentence rather than a rewrite:
 *                 401 "Email or password is incorrect." and 400 "This account
 *                 can't be opened yet — contact your coach." look identical from
 *                 here, and only the second is a dead end retyping cannot fix.
 *                 Those strings are fixed copy from the handler; they never
 *                 contain the password or the token.
 *   noToken       login succeeded but sent nothing usable — password only
 */
type Problem =
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "unauthorized" }
  | { kind: "rejected"; message: string }
  | { kind: "network" }
  | { kind: "server"; status: number }
  | { kind: "noToken" }
  | { kind: "storage" };

/**
 * `mode` is only read by the two kinds whose remedy differs — what "blank" and
 * "wrong shape" mean is not the same for a password and for a 43-character
 * code. Everything else reads identically either way, which is the point of
 * sharing the union.
 *
 * Returns a NODE rather than a string because two of these sentences contain a
 * figure — the code's 40 characters and the server's status — and every numeral
 * in this app is mono and tabular (visual-spec non-negotiable #3), prose
 * included. The nested `Text` changes the face and nothing else; the sentence
 * still renders as one paragraph in one line style.
 */
function explain(problem: Problem, mode: Mode): ReactNode {
  switch (problem.kind) {
    case "empty":
      return mode === "password"
        ? "Enter your email and password."
        : "Paste the pairing code from the web app before pairing.";
    case "malformed":
      return mode === "password"
        ? "That email doesn't look right. Check it and try again."
        : (
            <>
              That is not the shape of a pairing code. It begins with dt_ and
              has <Text style={styles.figure}>40</Text> hexadecimal characters
              after that. Copy the whole line.
            </>
          );
    case "unauthorized":
      return "That code was not recognised. Open Profile → Pair the RunGuard iPhone app on the web app and copy it again.";
    case "rejected":
      return problem.message;
    case "network":
      // The base URL is shown deliberately: a wrong EXPO_PUBLIC_API_URL, or
      // `localhost` on a physical phone, is otherwise invisible from here.
      return `Could not reach the server at ${BASE_URL}. On a phone that address must be the computer's LAN address, not localhost.`;
    case "server":
      return (
        <>
          The server answered with{" "}
          <Text style={styles.figure}>{problem.status}</Text>. You are not signed
          in.
        </>
      );
    case "noToken":
      return "The server logged you in but sent nothing this app can use to stay logged in. Contact your coach.";
    case "storage":
      return "Your sign-in could not be saved to this device's keychain. You are not signed in.";
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

/**
 * GET /api/mobile/me with the candidate token. Returns the problem, or null
 * when the server accepted it. The body is NOT read: a valid response is the
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

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Switching wipes every field and the error line, not just the ones the
   * outgoing mode owns. Two reasons: an "email doesn't look right" left standing
   * under the pairing field would describe a field that is no longer on screen,
   * and a typed password has no business surviving in component state once the
   * athlete has said they are pairing instead.
   */
  function switchTo(next: Mode) {
    if (busy || next === mode) return;
    setEmail("");
    setPassword("");
    setDraft("");
    setProblem(null);
    setMode(next);
  }

  /** Common tail: store, then leave. The token is dropped either way. */
  async function adopt(token: string) {
    try {
      await setToken(token);
    } catch {
      // SecureStore rejects on web and on a locked keychain. The error object
      // can carry the value, so it is swallowed like it is in lib/auth.
      setProblem({ kind: "storage" });
      setBusy(false);
      return;
    }
    // Clear the secrets out of component state on the way out, so no render
    // after this point can put them back on screen.
    setPassword("");
    setDraft("");
    setBusy(false);
    // Writing the keychain is not signing in. The gate in `app/_layout` reads
    // `useSession().status`, which is resolved ONCE at launch — without this the
    // status stays "out", the authed group stays unmounted, and `replace("/")`
    // below targets a screen that does not exist in the navigator, so a correct
    // password appeared to do nothing until the app was killed and relaunched.
    // `refresh()` re-reads the keychain and flips the guard, which unmounts this
    // screen and mounts the tabs.
    await refresh();
    router.replace("/");
  }

  function attemptPassword() {
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
      await adopt(result.token);
    })();
  }

  /** Shape first, then the server. Both paths — paste and dev token — go here. */
  function attemptPairing(candidate: string) {
    if (busy) return;
    const token = candidate.trim();
    if (!token) return setProblem({ kind: "empty" });
    if (!TOKEN_SHAPE.test(token)) return setProblem({ kind: "malformed" });

    setProblem(null);
    setBusy(true);
    void (async () => {
      const failure = await verify(token);
      if (failure) {
        setProblem(failure);
        setBusy(false);
        return;
      }
      await adopt(token);
    })();
  }

  const pairing = mode === "pairing";
  const submit = pairing ? () => attemptPairing(draft) : attemptPassword;
  const actionLabel = pairing
    ? busy
      ? "Checking…"
      : "Pair this device"
    : busy
      ? "Logging in…"
      : "Log in";

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
            <Text style={styles.title} accessibilityRole="header">
              Welcome back
            </Text>
            <Text style={styles.body}>
              {pairing
                ? "On the RunGuard web app, open Profile → Pair the RunGuard iPhone app and copy the code shown there."
                : "Use the email and password from your RunGuard account. This signs the app in on its own — you do not need a pairing code."}
            </Text>

            {/* One control, two choices, both visible: the athlete cannot pick
                the wrong door if they can read both labels at once. */}
            <View style={styles.segments} accessibilityRole="tablist">
              {MODES.map((option, index) => {
                const active = option.id === mode;
                return (
                  <Pressable
                    key={option.id}
                    // `dim`, not `rowPress`: a segment is an OBJECT inside a
                    // control, not a list surface, and flashing a fill across
                    // it would fight the fill that already says which half is
                    // selected. See theme/press.
                    style={({ pressed }) => [
                      styles.segment,
                      index > 0 && styles.segmentRuled,
                      active && styles.segmentOn,
                      dim(pressed),
                    ]}
                    onPress={() => switchTo(option.id)}
                    disabled={busy}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active, disabled: busy }}
                    accessibilityLabel={option.label}
                  >
                    <Text
                      style={active ? styles.segmentLabelOn : styles.segmentLabel}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {pairing ? (
              <>
                <Field
                  label="Pairing code"
                  note="from the web app"
                  value={draft}
                  onChangeText={setDraft}
                  editable={!busy}
                  placeholder="dt_"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  // Deliberately visible: it is an opaque 43-character code
                  // being checked against another screen, character by
                  // character, and it is not a secret this device has yet.
                  secureTextEntry={false}
                  multiline
                  style={styles.codeInput}
                />
                <Text style={styles.note}>
                  The code identifies this device to RunGuard. It does not expire, so
                  keep it to yourself.
                </Text>
              </>
            ) : (
              <>
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
                  onSubmitEditing={attemptPassword}
                />
              </>
            )}

            <Pressable
              style={styles.action}
              onPress={submit}
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
                  <Text style={styles.actionLabel}>{actionLabel}</Text>
                </>
              )}
            </Pressable>

            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {explain(problem, mode)}
              </Text>
            ) : null}

            {pairing && DEV_TOKEN ? (
              // Runs the identical verify path. The value is never written into
              // the visible field, so a screenshot of a dev build cannot leak it.
              <Pressable
                style={({ pressed }) => [styles.quiet, dim(pressed)]}
                onPress={() => attemptPairing(DEV_TOKEN)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
              >
                <Text style={styles.quietLabel}>Use development token</Text>
              </Pressable>
            ) : null}
          </Card>

          {/* The other door, as a grouped card under a muted eyebrow — the same
              shape `signup` and `pair` use for theirs, rather than the tinted
              text link this was. Three reasons it moved OUTSIDE the card: it is
              not part of the form it sits under, iOS says "another screen is
              beneath this" with a chevron rather than with colour, and `List`
              owns the row's press flash so it stops being a bare tappable.

              `replace`, not `push` — the three entry points are equivalent
              rather than nested, and a back stack of half-filled sign-in forms
              is not worth preserving. No `onPress` while `busy` renders the row
              genuinely inert, which is what `disabled` used to say here. */}
          <Section label="New here" style={styles.footer}>
            <List>
              <ListRow
                title="Create an account"
                onPress={busy ? undefined : () => router.replace("/signup")}
                chevron
                isLast
              />
            </List>
          </Section>
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
  style,
  ...input
}: { label: string; note?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{label}</Text>
        {note ? <Text style={styles.panelNote}>{note}</Text> : null}
      </View>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={color.placeholder}
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
  title: { ...text.title, color: color.ink },
  body: { ...text.base, color: color.ink2, marginTop: space.sm },

  /**
   * The app's only segmented control, and the one place it has to read as a
   * SYSTEM control rather than a drawn rectangle.
   *
   * The iOS system fill, and NO border — the same argument `input` below makes:
   * a native control is a filled track, not an outlined box, and the outline is
   * the web convention that gives away a form control dropped into an app. The
   * track was `well` inside a `rule` box; `fill` is Apple's neutral grey at
   * 12%, and it is not a brand colour and must never be used as one.
   */
  segments: {
    flexDirection: "row",
    backgroundColor: color.fill,
    borderRadius: radius.control,
    borderCurve: "continuous",
    overflow: "hidden",
    marginTop: space.xl,
  },
  segment: {
    flex: 1,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  /** The rule between the halves, not around them — one control, two choices. */
  segmentRuled: { borderLeftWidth: ruleWidth, borderLeftColor: color.rule },
  /**
   * The selected half is the same neutral grey one step up — `fillStrong` (16%)
   * over `fill` (12%). It used to be the soft ember wash; the ember now belongs
   * only to the primary action below, so this stops reading as a branded
   * control and starts reading as a system one, and the screen keeps exactly
   * one ember on the thing you tap to commit.
   *
   * That step is deliberately small, and colour is never the only signal: the
   * selected label also goes semibold and from `ink2` up to `ink`. Either
   * signal alone would carry the state.
   */
  segmentOn: { backgroundColor: color.fillStrong },
  segmentLabel: { ...text.base, color: color.ink2 },
  segmentLabelOn: { ...text.baseSemi, color: color.ink },

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
    /*
     * The system fill, and NO border — the design's `.fld`. A native text field
     * is a filled well, not an outlined box; the outline is a web convention
     * that reads as a form control dropped into an app. The fill alone still
     * says "type here" because it is sunken against the card.
     */
    backgroundColor: color.fill,
    borderRadius: radius.control,
    borderCurve: "continuous",
    paddingHorizontal: space.md,
    // Explicit, because Android's default TextInput padding top-aligns the text
    // in a fixed-height box. 12 + the 24 line box + 12 is exactly target.min,
    // so the tap target and the drawn field are the same rectangle.
    paddingVertical: space.md,
    minHeight: target.min,
  },
  /**
   * Mono because it is a code, not prose, and a misread character costs a retry.
   * Taller than a one-line field: 43 characters wrap at 360pt.
   */
  codeInput: { fontFamily: font.mono, minHeight: target.min * 1.5 },
  note: { ...text.meta, color: color.muted, marginTop: space.sm },

  /**
   * The ember signature, on the one thing you tap — one primary action per mode.
   * The gradient is laid in absolutely over this ground, so `brandStrong` is
   * both the pressed state and the fallback if the gradient ever fails to draw.
   */
  action: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    borderCurve: "continuous",
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
  /**
   * A numeral inside one of those sentences. Nested in the surrounding `Text`,
   * so it inherits that line's size, leading and colour and changes only the
   * face — which is the whole rule: if it is a number, it is mono and tabular,
   * prose included.
   */
  figure: { fontFamily: font.mono, ...tabular },
  quiet: {
    minHeight: target.min,
    justifyContent: "center",
    marginTop: target.gap,
  },
  quietLabel: { ...text.baseSemi, color: color.muted },
  /**
   * The other door, one section below the card. The row carries its own 52pt
   * height, so nothing here spaces it — this is only the gap BETWEEN sections.
   */
  footer: { marginTop: layout.section },
});
