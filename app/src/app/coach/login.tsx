/**
 * Coach sign-in.
 *
 * The coach twin of `/login`, and deliberately a separate screen rather than a
 * mode on it. The two produce DIFFERENT credentials with different reach — an
 * athlete device token opens one person's data, a coach token opens a whole
 * team's — and a single screen with a toggle is one wrong branch away from
 * storing one under the other's key.
 *
 * There is no pairing-code path and no dev-token button here. `/login` has both
 * because an athlete may be handed a token by their coach and because a dev
 * build should run without a pairing step; neither reasoning survives being
 * pointed at a team's health records. A coach signs in with their own account —
 * including in development, where the only concession is that the two fields
 * can arrive pre-typed (see DEV_EMAIL) and are still verified server-side.
 *
 * The token is written to the Keychain and then dropped: never logged, never
 * put in an error message, never rendered — not even as a success confirmation.
 * Neither is the password. `coachApi.coachLogin` returns it rather than storing
 * it so that this screen decides when the session begins, which means an
 * unproven credential never reaches storage.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { Card } from "../../components/Card";
import { Press } from "../../components/Press";
import { setCoachToken } from "../../lib/auth";
import { coachLogin } from "../../lib/coachApi";
import { useSession } from "../../lib/session";
import { color } from "../../theme/tokens";
import { font, text } from "../../theme/type";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";

/** The route's own check, so an obvious typo costs no round trip. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Dev-only prefill, so a local build does not need two fields typed on a
 * simulator keyboard every reload.
 *
 * This is TYPING, not a credential. Both values still go to
 * `/api/mobile/coach/login` and are still checked by scrypt against the real
 * account — a wrong password here fails exactly as a typed one would. That is
 * the difference between this and the athlete screen's `EXPO_PUBLIC_DEV_TOKEN`
 * button, which spends a token that is already valid and therefore skips auth
 * altogether.
 *
 * Static dot paths: Expo inlines `EXPO_PUBLIC_*` by textual substitution at
 * build time, so a computed lookup comes back undefined. The `__DEV__` guard is
 * a compile-time constant, so in a release bundle both fold to null and neither
 * the address nor the password reaches the shipped JavaScript.
 */
const DEV_EMAIL = __DEV__ ? process.env.EXPO_PUBLIC_COACH_EMAIL || "" : "";
const DEV_PASSWORD = __DEV__ ? process.env.EXPO_PUBLIC_COACH_PASSWORD || "" : "";

/** The website's `--ember` stops and its 135°, which points down-and-right. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

export default function CoachLoginScreen() {
  const router = useRouter();
  const { refreshCoach } = useSession();

  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = EMAIL_SHAPE.test(email.trim()) && password.length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token } = await coachLogin(email.trim(), password);
      await setCoachToken(token);
      // Flip the gate before navigating. `coach/index` lives inside
      // `Stack.Protected guard={coachIn}`, so it is not in the navigator's
      // route names until the session resolves — navigating first would name a
      // route that does not exist yet and the action would be dropped.
      await refreshCoach();
      router.replace("/coach");
    } catch (e) {
      // Whatever the client threw, the message shown is the server's own or a
      // generic one. It never carries the password or the token.
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Press
            onPress={() => router.replace("/login")}
            accessibilityRole="button"
            style={styles.back}
            pressedStyle={styles.pressed}
          >
            <Text style={styles.backLabel}>← Athlete sign-in</Text>
          </Press>

          <Card>
            <Text style={styles.eyebrow}>FOR COACHES</Text>
            <Text style={styles.title}>Open your roster</Text>
            <Text style={styles.blurb}>
              Sign in with the account you use on the RunGuard dashboard.
            </Text>

            <Text style={styles.label}>Coach email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@school.edu"
              placeholderTextColor={color.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Coach email"
              editable={!busy}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={color.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              accessibilityLabel="Password"
              editable={!busy}
              onSubmitEditing={submit}
            />

            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Press
              onPress={submit}
              disabled={!ready || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || busy }}
              accessibilityLabel="Open dashboard"
              style={styles.submitWrap}
              pressedStyle={styles.pressed}
            >
              {ready && !busy ? (
                <LinearGradient
                  colors={color.ember}
                  locations={EMBER_STOPS}
                  start={EMBER_START}
                  end={EMBER_END}
                  style={styles.submit}
                >
                  {/* `ink`, never white: the ember stops run 5.9:1 to 10.0:1
                      against ink and only 1.7:1 to 2.8:1 against white. */}
                  <Text style={styles.submitLabel}>Open dashboard</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.submit, styles.submitOff]}>
                  <Text style={styles.submitLabelOff}>
                    {busy ? "Signing in…" : "Open dashboard"}
                  </Text>
                </View>
              )}
            </Press>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  safe: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  page: { padding: layout.page, gap: space.lg },
  back: { minHeight: target.min, justifyContent: "center" },
  backLabel: { ...text.base, color: color.muted },
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.prompt, color: color.ink, marginTop: space.sm },
  blurb: { ...text.base, color: color.ink2, marginTop: space.sm },
  label: { ...text.micro, color: color.muted, marginTop: space.xl, marginBottom: space.sm },
  input: {
    ...text.base,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    minHeight: target.min,
  },
  error: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.control,
    borderWidth: ruleWidth,
    borderColor: color.unusualText,
    backgroundColor: color.well,
  },
  errorText: { ...text.meta, color: color.unusualText },
  submitWrap: { marginTop: space.xl },
  submit: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
  },
  submitOff: {
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
  },
  submitLabel: { fontFamily: font.bodySemi, fontSize: 16.5, color: color.bg },
  submitLabelOff: { fontFamily: font.bodySemi, fontSize: 16.5, color: color.muted },
});
