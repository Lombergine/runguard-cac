/**
 * "Does this person want less movement?" — one answer, everywhere.
 *
 * The spec's quality floor asks for reduced motion to be respected, and until
 * now exactly one screen did: `app/(tabs)/index.tsx` read
 * `AccessibilityInfo.isReduceMotionEnabled()` inside its data-loading effect and
 * used the result to collapse one duration to zero. That had two problems worth
 * fixing rather than copying:
 *
 *  1. It was a ONE-SHOT promise. Turning the setting on in Settings and coming
 *     back did not change anything until that effect happened to re-run, so the
 *     app kept animating for someone who had just asked it not to.
 *  2. It lived in a screen. Any second animated surface would have duplicated
 *     the block, and the copies would drift the way the panel heads did.
 *
 * This subscribes instead, so the answer tracks the OS setting live.
 *
 * HOW TO USE IT. The house style is to keep the animation and collapse its
 * DURATION to zero, rather than branching around it:
 *
 *     duration: reduced ? 0 : duration.reveal
 *
 * That keeps one code path, so the reduced case cannot drift into rendering
 * something different from the animated one — it renders the same thing, just
 * arrived at instantly.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;

    // The current value, for this mount.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      // A refusal is not a reason to animate at someone; it is also not a
      // reason to crash. Leave the default and carry on.
      .catch(() => {});

    // ...and every change after it.
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
      if (alive) setReduced(on);
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
