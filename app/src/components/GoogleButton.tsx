/**
 * "Continue with Google", for whichever door the login screen is showing.
 *
 * A COMPONENT RATHER THAN A BRANCH INSIDE THE SCREEN, and that is structural
 * rather than tidiness. `useAuthRequest` throws a render error on an empty
 * `redirectUri`, and a hook cannot be called conditionally — so the only way to
 * make "no client id configured" safe is for the thing that calls the hook to
 * not exist. The screen renders this behind `GOOGLE_CONFIGURED`; nothing else
 * may call `useGoogleSignIn`.
 */
import { Pressable, StyleSheet, Text } from "react-native";

import { useGoogleSignIn, type GoogleAttempt } from "../lib/googleSignIn";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { radius, space, target } from "../theme/space";

export function GoogleButton({
  busy,
  onAttempt,
}: {
  busy: boolean;
  /** Receives the outcome; the screen owns the exchange and the keychain. */
  onAttempt: (run: () => Promise<GoogleAttempt>) => void;
}) {
  const google = useGoogleSignIn();

  return (
    <Pressable
      style={styles.google}
      onPress={() => onAttempt(google.attempt)}
      // `ready` is false for the first frame or two while the request is built.
      // Pressing then would silently do nothing, which reads as a dead button.
      disabled={busy || !google.ready}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || !google.ready }}
    >
      {({ pressed }) => (
        <Text style={[styles.googleLabel, pressed && styles.googlePressed]}>
          Continue with Google
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * Secondary to the ember: an outline, not a second filled button. Two solid
   * actions stacked would read as a choice between equals, and for anyone who
   * already has a password the form above is the primary path.
   */
  google: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.rule,
    marginTop: space.md,
  },
  googleLabel: { ...text.baseSemi, color: color.ink },
  /** Press feedback without a fill, matching the outline's weight. */
  googlePressed: { color: color.ink2 },
});
