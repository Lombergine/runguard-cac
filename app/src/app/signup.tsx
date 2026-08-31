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
 *
 * NO "I AM A — ATHLETE / COACH" SEGMENTED CONTROL, deliberately. The design
 * opens this screen with one, and there is no coach signup on the phone for its
 * second segment to reach: `POST /api/athlete-signup` is the only account route
 * the app can call, `_layout.tsx` declares no coach group, and coaches are
 * created on the website. A two-segment control with one live segment is a
 * choice that is not one, and picking the dead half would have to fail with a
 * sentence explaining that the control should not have been there.
 *
 * THE FORM IS LONGER THAN THE DESIGN'S. The design draws four fields; the route
 * also takes `grade` and `eventGroup`, and it DEFAULTS `eventGroup` to
 * "distance", so leaving the control off would not leave the value unset — it
 * would store a guess the athlete never saw. Each field keeps its label and its
 * caveat above the input rather than collapsing into the design's
 * placeholder-only card: a placeholder disappears the moment you type, and
 * "optional" and the password floor are exactly the things you want to re-read
 * while the field is full.
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
import { rowPress } from "../theme/press";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
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
 *
 * The website writes each one as a single string, "Distance (5K / XC)". It is
 * split here so the parenthetical can render in the mono face: "5K" and "800"
 * are figures, and non-negotiable #3 does not exempt a figure for sitting
 * inside a name. `events` holds the whole parenthetical rather than the digits
 * alone — it reads as an event code, the same class of thing as the team code
 * field above, and carving "5K" out of "5K / XC" would put two faces inside one
 * two-word phrase. The accessibility label recomposes the website's sentence,
 * because VoiceOver hears no font.
 */
const EVENT_GROUPS = [
  { id: "distance", label: "Distance", events: "5K / XC" },
  { id: "mid", label: "Mid", events: "800 / Mile" },
  { id: "sprint", label: "Sprint", events: null },
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

function explain(problem: Problem): ReactNode {
  switch (problem.kind) {
    case "empty":
      return "Fill in your name, email, and password.";
    case "malformed":
      return "That email doesn't look right. Check it and try again.";
    case "shortPassword":
      return (
        <>
          Use at least <Text style={styles.figure}>{MIN_PASSWORD}</Text>{" "}
          characters for your password.
        </>
      );
    case "rejected":
      // The server's own sentence, unaltered — including any figure in it.
      return problem.message;
    case "network":
      // The base URL is shown deliberately: a wrong EXPO_PUBLIC_API_URL, or
      // `localhost` on a physical phone, is otherwise invisible from here. Mono
      // for the same reason the team code field is: this is an address being
      // proof-read character by character against another screen.
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
          <Text style={styles.figure}>{problem.status}</Text>. No account was
          created.
        </>
      );
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
              Create account
            </Text>
            <Text style={styles.body}>Two minutes, then it syncs itself</Text>

            {/* The design's order — who you are, then how to reach you, then
                the secret, and the team code LAST. The team code used to lead
                this form, which opened the account on the one field that is
                optional and that an athlete signing up alone does not have. */}
            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              editable={!busy}
              placeholder="Full name"
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
              note={
                <>
                  <Text style={styles.figure}>{MIN_PASSWORD}+</Text> characters
                </>
              }
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              placeholder="Choose a password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />

            <Field
              label="Team code"
              note="optional"
              value={joinCode}
              onChangeText={setJoinCode}
              editable={!busy}
              placeholder="Team code from your coach"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              returnKeyType="next"
              // A code, not prose: mono so a misread character costs no retry.
              style={styles.codeInput}
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
                      // A row is a SURFACE, so it FLASHES a fill across its full
                      // width rather than dimming — dimming would take the dot
                      // and the label down with it. `radios` clips the flash to
                      // the track's corners.
                      style={({ pressed }) => [
                        styles.radio,
                        index > 0 && styles.radioRuled,
                        rowPress({ pressed }),
                      ]}
                      onPress={() => setEventGroup(group.id)}
                      disabled={busy}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: busy }}
                      accessibilityLabel={
                        group.events
                          ? `${group.label} (${group.events})`
                          : group.label
                      }
                    >
                      {/* The dot is the ember as a SHAPE, never under a glyph.
                          The ring stays drawn when unselected, so the row is a
                          choice even before one is made. */}
                      <View style={[styles.dot, selected && styles.dotOn]} />
                      <Text
                        style={selected ? styles.radioLabelOn : styles.radioLabel}
                      >
                        {group.label}
                        {group.events ? (
                          <Text style={styles.figure}> ({group.events})</Text>
                        ) : null}
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

            {/*
              The design's note under the button, with one clause corrected.

              It reads there: "They see your training load, soreness and
              check-ins — not your messages with RunGuard." That is not true of
              this product. `website/src/lib/profile.ts:200` selects the
              athlete's last five chat messages and the coach dashboard renders
              them verbatim, in quotes, under "What they've been asking"
              (`website/src/app/dashboard/athlete/[id]/page.tsx:414`); the only
              exclusion is the safety-intercepted ones. `privacy.tsx` already
              says so in the athlete's own words — "They are stored so you and
              your coach can see the conversation."
              A false privacy promise made to a minor at the moment they hand
              over an email and a password is the worst place in the app to put
              one, so the clause states what the coach actually sees.

              It sits BELOW the error line rather than directly under the button
              as the design draws it: a failure has to be adjacent to the
              control that produced it, and this note is a standing condition on
              the whole form rather than a response to anything.
            */}
            <Text style={styles.note}>
              Under 18? Your coach&apos;s team code links you to their roster.
              They see your training load, soreness, check-ins and the questions
              you ask RunGuard.
            </Text>
          </Card>

          {/* The other two doors. `replace`, not `push`, because the three
              entry points are equivalent rather than nested — a back stack of
              half-filled sign-in forms is not worth preserving.

              A grouped list on the page ground, OUTSIDE the card, rather than
              two ember links inside it. Two reasons: the screen already spends
              its one ember on the button above, and iOS says "another screen is
              under this" with a chevron rather than with colour. `List` also
              owns the row's press flash, so these stop being the bare tappables
              they were.

              No `onPress` while `busy` renders the rows genuinely inert — no
              chevron, no flash, no role — which is what `disabled` used to say
              here. A row that keeps its chevron while it cannot be followed is
              the lie `List`'s header describes.

              The eyebrow is a `Section` label rather than `List`'s own `header`,
              so every eyebrow on the four signed-out screens is the same node at
              the same rank. Sentence case in source: `text.micro` uppercases it,
              and a hand-typed "SIGN IN" would be the app's one eyebrow that does
              not. */}
          <Section label="Sign in" style={styles.footer}>
            <List>
              <ListRow
                title="Log in with email"
                onPress={busy ? undefined : () => router.replace("/login")}
                chevron
              />
              <ListRow
                title="Use a pairing code"
                onPress={busy ? undefined : () => router.replace("/pair")}
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
 * right, content underneath. Here the note is the field's caveat — "optional",
 * the password floor — which is where the athlete looks for it.
 *
 * A NODE rather than a string, for the same reason `PanelProps.note` is one:
 * the password floor is a figure, and a figure is mono even inside a caveat.
 */
function Field({
  label,
  note,
  style,
  ...input
}: { label: string; note?: ReactNode } & TextInputProps) {
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
  codeInput: { fontFamily: font.mono },
  /** Two digits never need the full width, and a short field says so. */
  gradeInput: { fontFamily: font.mono, alignSelf: "flex-start", minWidth: target.min * 2 },

  /**
   * The system fill and NO border — the same well the text fields sit in. The
   * three choices are one control, and an outline drawn around it is exactly
   * the web convention `input` above already dropped; leaving it here would put
   * two different ideas of "form control" on one screen.
   *
   * `overflow: "hidden"` was already load-bearing for the rules and is now also
   * what clips a row's press flash to the track's rounded corners — an
   * unclipped flash paints square corners over a rounded track.
   */
  radios: {
    backgroundColor: color.fill,
    borderRadius: radius.control,
    borderCurve: "continuous",
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
   * The standing note about what a team code shares. The design sets it at
   * 12.5; `text.meta` (14) is the app's note rank and there is no step between
   * it and `micro`, which is an uppercase mono eyebrow and not prose. Muted, so
   * it reads as a condition rather than as a warning — nothing in this app is
   * styled to shout.
   */
  note: { ...text.meta, color: color.muted, marginTop: space.lg },
  /**
   * A figure sitting inside a body-face sentence — the password floor, an HTTP
   * status, the event codes in a radio label, the LAN address. Non-negotiable
   * #3 has no prose exemption: if it is a number it is mono and tabular. Colour
   * is inherited, so one style serves a note, an error line and a label.
   */
  figure: { fontFamily: font.mono, ...tabular },
  /**
   * The two alternate doors, now a grouped list on the page ground below the
   * card. `layout.section` is the gap BETWEEN sections, which is what this is
   * now; the rows are `target.row` tall and separated by the slab's own rule,
   * so they no longer need `target.gap` to keep their taps apart.
   */
  footer: { marginTop: layout.section },
});
