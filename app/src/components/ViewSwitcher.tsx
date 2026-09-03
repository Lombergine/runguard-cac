/**
 * The one control that moves between the coach side and the athlete side.
 *
 * WHY IT EXISTS. The app carries two products behind two independent
 * credentials, and before this the only way across was to sign out — which is
 * not a switch, it is a departure, and on the coach side it threw away a
 * session that a phone may legitimately hold alongside an athlete one. There
 * was no affordance anywhere that said "the other side is here", so the two
 * halves read as two apps that happened to share an icon.
 *
 * WHAT IT PROMISES. It always names the DESTINATION, never the current state:
 * "Coach view" on an athlete screen, "Athlete view" on a coach screen. A
 * control labelled with where you already are is the single most reliable way
 * to make someone tap it by mistake.
 *
 * WHAT IT DOES NOT DO. It never signs anything out. Switching with both
 * sessions present is instant and lossless; switching without the destination
 * session opens that side's sign-in, leaving the session you came from intact
 * so that cancelling puts you back exactly where you were. Sign-out stays a
 * separate, deliberate control — see `settings.tsx` and the coach header.
 */
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";

import { useSession } from "../lib/session";
import { Press } from "./Press";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { radius, ruleWidth, space, target } from "../theme/space";

export function ViewSwitcher({ to }: { to: "coach" | "athlete" }) {
  const router = useRouter();
  const { status, coachStatus } = useSession();

  // Whether the side we are offering to move to already has a session. This
  // decides the destination, not whether the control appears: a coach with no
  // athlete pairing should still be told the athlete side exists.
  const ready = to === "coach" ? coachStatus === "in" : status === "in";

  const label = to === "coach" ? "Coach view" : "Athlete view";
  const hint = ready ? "→" : "· sign in";

  return (
    <Press
      onPress={() => {
        if (to === "coach") {
          // `replace`, not `push`: the two sides are peers, not a stack. Pushing
          // would let someone swipe back into a screen belonging to the other
          // product, which is exactly the confusion this control exists to end.
          router.replace(ready ? "/coach" : "/coach/login");
        } else {
          router.replace(ready ? "/(tabs)" : "/login");
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={
        ready ? `Switch to the ${label.toLowerCase()}` : `Sign in to the ${label.toLowerCase()}`
      }
      style={styles.pill}
      pressedStyle={styles.pressed}
    >
      <Text style={styles.label}>
        {label} {hint}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  pill: {
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    backgroundColor: color.card,
  },
  label: { ...text.meta, color: color.brandText },
});

export default ViewSwitcher;
