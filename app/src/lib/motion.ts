/**
 * Motion and touch feedback. See ../../../docs/visual-spec.md → "Motion".
 *
 * The spec budgets 140ms for a state change and 180ms for a reveal, and
 * requires reduced motion to be respected. Both numbers already lived in
 * `theme/space.ts`; before this module they were read exactly once in the whole
 * app, so 14 of the 32 files with interactive elements answered a finger with
 * nothing at all until the next screen appeared.
 *
 * ── WHY `Animated` AND NOT REANIMATED ──────────────────────────────────────
 * `react-native-reanimated` is present in node_modules, but only as a
 * transitive dependency of expo-router, and this project has no
 * `babel.config.js` — so its worklet plugin is not installed and a direct
 * import would fail at runtime rather than at build. RN's own `Animated` with
 * `useNativeDriver: true` runs the transform on the UI thread, which is the
 * property that actually matters here, and it is already the idiom on the home
 * screen.
 *
 * ── WHY HAPTICS ARE NOT GATED ON REDUCED MOTION ────────────────────────────
 * "Reduce Motion" is a vestibular accommodation — it is about things moving in
 * the visual field. A haptic is not motion in that sense, and silencing it
 * would remove confirmation from precisely the users who have turned down the
 * visual confirmation. The two settings stay independent.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Whether the user has asked for reduced motion.
 *
 * Subscribes, rather than reading once at mount. The home screen's inline
 * version only ever read the value in its initial effect, so toggling the
 * setting while the app was foregrounded left the old answer in place until a
 * remount.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (on) => setReduced(on)
    );

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/**
 * Haptics are iOS-only here for the same reason the dark theme is: the iOS
 * build is the one that ships, and Android's generic vibrate is a different
 * physical sensation that reads as an error rather than as confirmation.
 *
 * Every call is fire-and-forget and swallows its rejection. A haptic that
 * throws — no Taptic engine, a simulator, the setting disabled — must never
 * take a check-in down with it.
 */
function fire(run: () => Promise<void>): void {
  if (Platform.OS !== "ios") return;
  void run().catch(() => {});
}

/** A tap landed on something that does one thing. Buttons, rows, cards. */
export function tapped(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A value changed within a set — a segment, a severity, a check-in answer. */
export function selected(): void {
  fire(() => Haptics.selectionAsync());
}

/**
 * A submission landed. Deliberately reserved for the check-in and nothing
 * else: this is the app's one moment of completion, and spending the success
 * haptic anywhere else is what makes an app feel like it is congratulating
 * itself.
 */
export function committed(): void {
  fire(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}

/**
 * A submission failed. Warning, never Error: `Error` is the heaviest pattern
 * iOS has, and the spec's advisory rule — nothing shouts — applies to what the
 * phone does in your hand as much as to what it puts on screen.
 */
export function failed(): void {
  fire(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  );
}
