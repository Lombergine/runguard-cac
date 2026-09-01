/**
 * The front door. One screen, two people, two ways in.
 *
 * There used to be three doors — this one, `/pair` (paste a device token) and
 * `/signup` — and nothing told a new athlete which was theirs. `/signup` is
 * genuinely a different act, so it stays a separate screen with a link both
 * ways. `/pair` IS GONE: `athletes.device_token` has been removed from the
 * product, so there is no permanent code to paste, no screen to paste it into,
 * and no way to hold a credential without having signed in for it. An athlete
 * signs in exactly the way a coach does.
 *
 *   Athlete   POST /api/athlete-login       → { ok, name, token }
 *   Coach     POST /api/mobile/coach-login  → { token }
 *
 * Both tokens are SESSION tokens — `a.<athleteId>.<hmac>` and
 * `<teamId>.<hmac>`, signed server-side, obtainable only here or at `/signup`.
 * The coach is a DOOR, not a mode: it asks WHO is signing in rather than how,
 * and it swaps the card in place from a grouped row underneath. The two forms
 * are otherwise the same form, which is why the screen no longer carries a
 * segmented control — there is only one way in per person.
 *
 * The coach credential opens a whole roster rather than one athlete, which is
 * why there is no dev-token shortcut for it anywhere in this file.
 *
 * Either token is written to the Keychain and then dropped: never logged, never
 * put in an error message, never rendered — not even as a success confirmation.
 * Neither is the password.
 *
 * `lib/api` cannot do the athlete call: `request()` reads a token out of
 * SecureStore and refuses without one, and the entire point here is to obtain
 * the first one. So this issues that request itself. `coachLogin` lives in
 * `lib/api` because it is the only door to a set of endpoints that module owns,
 * and it issues its own fetch there for exactly the same reason.
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
import { ApiError, BASE_URL, coachLogin, googleExchange } from "../lib/api";
import { setCoachToken, setToken } from "../lib/auth";
import { useSession } from "../lib/session";
import { GOOGLE_CONFIGURED, type GoogleAttempt } from "../lib/googleSignIn";
import { GoogleButton } from "../components/GoogleButton";
import { useBackOnlyHeader } from "../theme/header";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, space, target } from "../theme/space";

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

/** The route's own check, so an obvious typo costs no round trip. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The website's `--ember` stops and its 135°, which points down-and-right. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/**
 * Which sign-in the card is showing. The two doors are the same form asked of
 * two different people; neither has a mode of its own.
 */
type Door = "athlete" | "coach";

/**
 * The outcomes worth telling apart, covering both doors. Each kind has a
 * different fix, and collapsing any two of them leaves the athlete guessing:
 *
 *   rejected      the server refused the sign-in and SAID WHY. It carries the
 *                 server's own sentence rather than a rewrite: 401 "Email or
 *                 password is incorrect." and 400 "This account can't be opened
 *                 yet — contact your coach." look identical from here, and only
 *                 the second is a dead end retyping cannot fix. Those strings
 *                 are fixed copy from the handler; they never contain the
 *                 password or the token.
 *   noToken       the sign-in succeeded but sent nothing usable back
 */
type Problem =
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "rejected"; message: string }
  | { kind: "network" }
  | { kind: "server"; status: number }
  | { kind: "noToken" }
  | { kind: "storage" };

/**
 * Returns a NODE rather than a string because one of these sentences contains a
 * figure — the server's status — and every numeral in this app is mono and
 * tabular (visual-spec non-negotiable #3), prose included. The nested `Text`
 * changes the face and nothing else; the sentence still renders as one paragraph
 * in one line style.
 */
function explain(problem: Problem): ReactNode {
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
 * `coachLogin` throws `ApiError`; this screen speaks `Problem`. One translation,
 * so the coach path shows the same sentences in the same place as the athlete
 * one.
 *
 * 4xx carries the server's own sentence — the handler writes the one that is
 * actually useful, and it never contains the password or the token. Everything
 * else is either the transport (status 0) or a server fault worth naming by its
 * number.
 */
function problemOf(err: unknown): Problem {
  if (!(err instanceof ApiError)) return { kind: "network" };
  if (err.status === 0) return { kind: "network" };
  if (err.status >= 400 && err.status < 500) {
    return { kind: "rejected", message: err.message };
  }
  return { kind: "server", status: err.status };
}

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [door, setDoor] = useState<Door>("athlete");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Changing door wipes every field and the error line. An "email doesn't look
   * right" left standing under a form the athlete has just left describes a
   * field they are no longer looking at — and a typed password has no business
   * surviving into a coach form, or the other way round.
   */
  function switchDoor(next: Door) {
    if (busy || next === door) return;
    setEmail("");
    setPassword("");
    setProblem(null);
    setDoor(next);
  }

  /**
   * Common tail: store, then leave. The token is dropped either way.
   *
   * `store` is the WRITER rather than a role flag, so the two credentials keep
   * separate functions all the way down to the keychain — `setToken` and
   * `setCoachToken` each delete the other key before writing their own, and
   * neither this screen nor anything below it can end up holding both.
   */
  async function adopt(token: string, store: (value: string) => Promise<void>) {
    try {
      await store(token);
    } catch {
      // SecureStore rejects on web and on a locked keychain. The error object
      // can carry the value, so it is swallowed like it is in lib/auth.
      setProblem({ kind: "storage" });
      setBusy(false);
      return;
    }
    // Clear the secret out of component state on the way out, so no render
    // after this point can put it back on screen.
    setPassword("");
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
      await adopt(result.token, setToken);
    })();
  }

  /**
   * The coach's only path. Same two client-side checks as the athlete password
   * form — a blank field and an obvious typo cost no round trip — and then the
   * server's answer, verbatim.
   */
  function attemptCoach() {
    if (busy) return;
    const address = email.trim();
    if (!address || !password) return setProblem({ kind: "empty" });
    if (!EMAIL_SHAPE.test(address)) return setProblem({ kind: "malformed" });

    setProblem(null);
    setBusy(true);
    void (async () => {
      let token: string;
      try {
        ({ token } = await coachLogin(address, password));
      } catch (err) {
        // The thrown value is mapped, never logged: it can echo the request,
        // and this request body holds the password.
        setProblem(problemOf(err));
        setBusy(false);
        return;
      }
      await adopt(token, setCoachToken);
    })();
  }

  /**
   * The Google door, for whichever form is showing.
   *
   * The code and its PKCE verifier go to the server, which redeems them — this
   * screen never sees an id_token. Cancelling the sheet resets in silence: a
   * dismissal is a decision, and an error line under a form nobody submitted is
   * noise. Everything else lands in `problemOf`, so a 404 ("no RunGuard account
   * uses that Google address") surfaces as the server's own sentence.
   */
  function attemptGoogle(run: () => Promise<GoogleAttempt>) {
    if (busy) return;
    setProblem(null);
    setBusy(true);
    void (async () => {
      const attempt = await run();
      if (attempt.kind === "cancelled") {
        setBusy(false);
        return;
      }
      if (attempt.kind === "failed") {
        setProblem({ kind: "rejected", message: "That Google sign-in didn't complete." });
        setBusy(false);
        return;
      }

      let token: string;
      try {
        ({ token } = await googleExchange(
          attempt.code,
          attempt.codeVerifier,
          attempt.redirectUri,
          door
        ));
      } catch (err) {
        // Mapped, never logged — the thrown value can echo a request carrying
        // the authorization code.
        setProblem(problemOf(err));
        setBusy(false);
        return;
      }
      await adopt(token, door === "coach" ? setCoachToken : setToken);
    })();
  }

  const coach = door === "coach";
  const submit = coach ? attemptCoach : attemptPassword;
  const actionLabel = busy ? "Logging in…" : "Log in";

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
              {coach ? "Coach sign-in" : "Welcome back"}
            </Text>
            <Text style={styles.body}>
              {coach
                ? "Use the email and password from the RunGuard dashboard. Signing in here shows your team's roster, calendar and data sources on this phone."
                : "Use the email and password from your RunGuard account. Signing in is the only way onto this phone — there is no code to copy from anywhere."}
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
              onSubmitEditing={submit}
            />

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

            {/* NOT MOUNTED — not merely hidden — when no client id is
                configured. The hook inside throws a render error on an empty
                redirect, so a mounted-but-hidden button takes the whole login
                screen down on every build without one. Serves both doors:
                `door` decides which account the server looks for. */}
            {GOOGLE_CONFIGURED ? (
              <GoogleButton busy={busy} onAttempt={attemptGoogle} />
            ) : null}

            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {/* Both doors are the same form, so both read the same
                    sentences. */}
                {explain(problem)}
              </Text>
            ) : null}
          </Card>

          {/* The other doors, as grouped cards under muted eyebrows — the same
              shape `signup` uses for its, rather than the tinted text link this
              was. Three reasons they sit OUTSIDE the card: they
              are not part of the form above them, iOS says "another screen is
              beneath this" with a chevron rather than with colour, and `List`
              owns the row's press flash so they stop being bare tappables.

              `replace`, not `push` — the entry points are equivalent rather
              than nested, and a back stack of half-filled sign-in forms is not
              worth preserving. No `onPress` while `busy` renders a row
              genuinely inert, which is what `disabled` used to say here. */}
          {coach ? (
            <Section label="Not a coach" style={styles.footer}>
              <List>
                <ListRow
                  title="Athlete sign-in"
                  onPress={busy ? undefined : () => switchDoor("athlete")}
                  isLast
                />
              </List>
            </Section>
          ) : (
            <>
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

              {/* No chevron on either of these, and that is the rule rather
                  than an omission: a chevron means a screen is underneath, and
                  these swap the card in place. Signing up genuinely pushes one,
                  so it keeps its. */}
              <Section label="Coaches" style={styles.footer}>
                <List>
                  <ListRow
                    title="Sign in as a coach"
                    sub="Your team's roster, calendar and data sources."
                    onPress={busy ? undefined : () => switchDoor("coach")}
                    isLast
                  />
                </List>
              </Section>
            </>
          )}
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
  /**
   * The other door, one section below the card. The row carries its own 52pt
   * height, so nothing here spaces it — this is only the gap BETWEEN sections.
   */
  footer: { marginTop: layout.section },
});
