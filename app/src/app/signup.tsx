/**
 * Athlete signup. Creates the account and pairs the device in one step.
 *
 * `POST /api/athlete-signup` (website/src/app/api/athlete-signup/route.ts) mints
 * the athlete's device token as part of creating the row and returns it —
 * `token: athlete.device_token`, commented there as "lets the iOS app sign up
 * directly". So a fresh install needs no web app, no copy-paste, no `/pair`.
 *
 * That token is the SAME permanent, non-revocable credential `lib/auth.ts`
 * describes. It goes to the Keychain and nowhere else: never logged, never held
 * in component state, never in an error message, never rendered — not even as a
 * success confirmation. Neither is the password.
 *
 * Two things the route decides that this form must not contradict:
 *  - The team code is OPTIONAL. `teamId` stays null when it is blank and the
 *    athlete trains solo; a wrong code is a 404, not a silent solo signup.
 *  - `grade` must be an integer or null — `Number.isInteger(body.grade)`, so
 *    "10th" or "" would be dropped without a word. The input only accepts
 *    digits so it cannot produce anything else.
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
import { Stack, useRouter } from "expo-router";

import { Card } from "../components/Card";
import { BASE_URL } from "../lib/api";
import { setToken } from "../lib/auth";
import { useSession } from "../lib/session";
import { backOnlyHeader } from "../theme/header";
import { color } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

/** The route's own checks, so obvious mistakes cost no round trip. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

/** The website's `--ember` stops and its 135°, which points down-and-right. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/**
 * The three the server accepts, with the website's own labels
 * (website/src/app/athlete/signup/page.tsx:7-11). The route defaults to
 * "distance", so this starts there rather than empty — an unset radio group
 * would misreport what the server is about to store.
 */
const EVENT_GROUPS = [
  { id: "distance", label: "Distance (5K / XC)" },
  { id: "mid", label: "Mid (800 / Mile)" },
  { id: "sprint", label: "Sprint" },
] as const;

type EventGroup = (typeof EVENT_GROUPS)[number]["id"];

/**
 * The outcomes worth telling apart, in the shape `pair.tsx` uses.
 *
 * `rejected` carries the SERVER's sentence rather than a rewrite of it. This
 * route refuses in four different ways — a bad email, a short password, an
 * unknown team code (404), an email already registered (409, "log in instead")
 * — and each has a different fix. Flattening them into one "signup failed"
 * would hide the only one that is not a typo. Those strings are fixed copy from
 * the handler; none of them echoes the password or the token.
 */
type Problem =
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "shortPassword" }
  | { kind: "rejected"; message: string }
  | { kind: "network" }
  | { kind: "server"; status: number }
  | { kind: "noToken" }
  | { kind: "storage" };

function explain(problem: Problem): string {
  switch (problem.kind) {
    case "empty":
      return "Fill in your name, email, and password.";
    case "malformed":
      return "That email doesn't look right. Check it and try again.";
    case "shortPassword":
      return `Use at least ${MIN_PASSWORD} characters for your password.`;
    case "rejected":
      return problem.message;
    case "network":
      // The base URL is shown deliberately: a wrong EXPO_PUBLIC_API_URL, or
      // `localhost` on a physical phone, is otherwise invisible from here.
      return `Could not reach the server at ${BASE_URL}. On a phone that address must be the computer's LAN address, not localhost.`;
    case "server":
      return `The server answered with ${problem.status}. No account was created.`;
    case "noToken":
      return "Your account was created, but the server sent nothing this app can use to sign in. Log in with your email and password.";
    case "storage":
      return "Your account was created, but it could not be saved to this device's keychain. Log in to try again.";
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

type Draft = {
  joinCode: string;
  name: string;
  email: string;
  password: string;
  grade: string;
  eventGroup: EventGroup;
};

/**
 * POST /api/athlete-signup. Resolves to the token, or to the reason there isn't
 * one. The caller stores the token and forgets it; `name` and `team` come back
 * too and are deliberately not read — the home screen fetches its own profile.
 */
async function signUp(
  draft: Draft
): Promise<{ token: string } | { problem: Problem }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/athlete-signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        password: draft.password,
        joinCode: draft.joinCode,
        // Integer or null; the field cannot hold anything else.
        grade: draft.grade ? Number(draft.grade) : null,
        eventGroup: draft.eventGroup,
      }),
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

  // `createAthleteAccount()` always mints a token, so this is the branch the
  // types force rather than one the current server can reach. It exists so a
  // contract change degrades into a sentence instead of a crash — and it says
  // the account WAS created, because by this point it was.
  const token = tokenOf(body);
  return token ? { token } : { problem: { kind: "noToken" } };
}

export default function SignupScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState("");
  const [eventGroup, setEventGroup] = useState<EventGroup>("distance");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  function attempt() {
    if (busy) return;
    const draft: Draft = {
      joinCode: joinCode.trim(),
      name: name.trim(),
      email: email.trim(),
      password,
      grade,
      eventGroup,
    };
    if (!draft.name || !draft.email || !draft.password) {
      return setProblem({ kind: "empty" });
    }
    if (!EMAIL_SHAPE.test(draft.email)) return setProblem({ kind: "malformed" });
    if (draft.password.length < MIN_PASSWORD) {
      return setProblem({ kind: "shortPassword" });
    }

    setProblem(null);
    setBusy(true);
    void (async () => {
      const result = await signUp(draft);
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
      <Stack.Screen options={backOnlyHeader()} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={styles.eyebrow}>CREATE ACCOUNT</Text>
            <Text style={styles.title}>Set up RunGuard</Text>
            <Text style={styles.body}>
              This creates your account and signs this device in. You can join a team
              now or on your own later.
            </Text>

            <Field
              label="Team code"
              note="optional"
              value={joinCode}
              onChangeText={setJoinCode}
              editable={!busy}
              placeholder="Leave blank to train solo"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              returnKeyType="next"
              // A code, not prose: mono so a misread character costs no retry.
              style={styles.codeInput}
            />

            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              editable={!busy}
              placeholder="First and last"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />

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
              note={`${MIN_PASSWORD}+ characters`}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />

            <Field
              label="Grade"
              note="optional"
              // Digits only, so `Number()` can never produce a non-integer the
              // route would silently store as null.
              value={grade}
              onChangeText={(next) => setGrade(next.replace(/[^0-9]/g, ""))}
              editable={!busy}
              placeholder="9–12"
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="done"
              style={styles.gradeInput}
            />

            <View style={styles.field}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Event group</Text>
                <Text style={styles.panelNote}>pick one</Text>
              </View>
              {/* Ruled rows rather than a picker wheel: all three choices stay
                  readable at arm's length, and the selected one is visible
                  without opening anything. */}
              <View style={styles.radios} accessibilityRole="radiogroup">
                {EVENT_GROUPS.map((group, index) => {
                  const selected = group.id === eventGroup;
                  return (
                    <Pressable
                      key={group.id}
                      style={[styles.radio, index > 0 && styles.radioRuled]}
                      onPress={() => setEventGroup(group.id)}
                      disabled={busy}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: busy }}
                      accessibilityLabel={group.label}
                    >
                      {/* The dot is the ember as a SHAPE, never under a glyph.
                          The ring stays drawn when unselected, so the row is a
                          choice even before one is made. */}
                      <View style={[styles.dot, selected && styles.dotOn]} />
                      <Text
                        style={selected ? styles.radioLabelOn : styles.radioLabel}
                      >
                        {group.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

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
                    {busy ? "Creating…" : "Create my account"}
                  </Text>
                </>
              )}
            </Pressable>

            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {explain(problem)}
              </Text>
            ) : null}

            {/* The other two doors. `replace`, not `push`, because the three
                entry points are equivalent rather than nested — a back stack of
                half-filled sign-in forms is not worth preserving. */}
            <View style={styles.footer}>
              <Pressable
                style={styles.alt}
                onPress={() => router.replace("/login")}
                disabled={busy}
                accessibilityRole="link"
                accessibilityState={{ disabled: busy }}
              >
                <Text style={styles.altLabel}>Already have an account? Log in</Text>
              </Pressable>

              <Pressable
                style={styles.alt}
                onPress={() => router.replace("/pair")}
                disabled={busy}
                accessibilityRole="link"
                accessibilityState={{ disabled: busy }}
              >
                <Text style={styles.altLabel}>Use a pairing code</Text>
              </Pressable>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * One form row in the website's Panel hierarchy (`Panel`,
 * website/src/components/athlete/tabs.tsx:22): semibold title left, muted note
 * right, content underneath. Here the note is the field's caveat — "optional",
 * the password floor — which is where the athlete looks for it.
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
  /**
   * TOP-ALIGNED, unlike `login` and `pair`, which centre.
   *
   * Those two fit on one screen, so centring reads as deliberate placement.
   * This screen does not: six fields and a three-row radio group run to roughly
   * one and a half viewports. `flexGrow: 1` with `justifyContent: "center"`
   * centres content that OVERFLOWS its container by pushing equal amounts off
   * both ends — and the amount pushed off the top is unreachable, because a
   * ScrollView cannot scroll above its content origin. The eyebrow, the heading
   * and the first line of the lede were simply gone.
   *
   * It was latent before and became visible when the back header took ~96pt out
   * of the viewport. Top-aligning is the fix at every height.
   */
  page: {
    flexGrow: 1,
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
  codeInput: { fontFamily: font.mono },
  /** Two digits never need the full width, and a short field says so. */
  gradeInput: { fontFamily: font.mono, alignSelf: "flex-start", minWidth: target.min * 2 },

  radios: {
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  radio: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min,
    paddingHorizontal: space.md,
  },
  /** The rule between rows, not around them — one control, three choices. */
  radioRuled: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  dot: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.pill,
    borderWidth: ruleWidth,
    borderColor: color.ruleStrong,
    backgroundColor: color.card,
  },
  /** FILL, not text: the ember is 2.01:1 and nothing legible sits on it. */
  dotOn: { backgroundColor: color.brand, borderColor: color.brandStrong },
  radioLabel: { ...text.base, color: color.ink2 },
  radioLabelOn: { ...text.baseSemi, color: color.ink },

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
  /** `target.gap` between the two links, so neither steals the other's tap. */
  footer: { marginTop: target.gap, gap: target.gap },
  alt: { minHeight: target.min, justifyContent: "center" },
  altLabel: { ...text.baseSemi, color: color.brandText },
});
