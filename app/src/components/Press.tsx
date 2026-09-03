/**
 * The app's touchable. See ../../../docs/visual-spec.md → "Motion" and "Stance".
 *
 * Every interactive surface should answer the finger inside one frame. Bare
 * `Pressable` does not: 14 of the 32 files with interactive elements shipped
 * with no pressed state at all, so a tap produced nothing until the next screen
 * mounted. That gap — not the palette — is what reads as unresponsive.
 *
 * Two channels, because one is not always available:
 *
 *   • SCALE, on the UI thread via `useNativeDriver`. Suppressed under Reduce
 *     Motion, which is the whole reason the colour channel also exists.
 *   • FILL, via `pressedStyle` — normally the `press` token, which the palette
 *     already defines as "a list row under the finger". This survives Reduce
 *     Motion, so the control still confirms the touch for a user who has turned
 *     movement off.
 *
 * ── WHY `style` IS NOT THE FUNCTION FORM ───────────────────────────────────
 * `Pressable` accepts `style={({pressed}) => …}`, and 19 files use it that way.
 * `Animated` cannot traverse a function to find the animated node inside it, so
 * a component that animates has to hand `Animated` a plain array. `pressed` is
 * therefore tracked here and exposed as `pressedStyle`. Call sites already
 * written in the function form keep working untouched — they simply do not
 * animate — so this is additive rather than a migration.
 */
import { useMemo, useState, type Ref } from "react";
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";

import { duration } from "../theme/space";
import { selected, tapped, useReduceMotion } from "../lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** How far a pressed surface travels. Small enough to read as pressure. */
const PRESSED_SCALE = 0.97;

export type PressProps = Omit<PressableProps, "style"> & {
  /** React 19 passes `ref` as a plain prop; InfoDot measures the dot through it. */
  ref?: Ref<View>;
  /** Plain style only — see the note above on why this is not the function form. */
  style?: StyleProp<ViewStyle>;
  /** Applied while the finger is down. Usually `{ backgroundColor: color.press }`. */
  pressedStyle?: StyleProp<ViewStyle>;
  /**
   * `tap` for something that does one thing, `select` for a value changing
   * within a set, `none` where the press is not itself the commitment — a
   * disclosure that only opens a sheet, say.
   */
  haptic?: "tap" | "select" | "none";
  /** Pass `false` for surfaces large enough that scaling reads as wobble. */
  scale?: boolean;
};

export function Press({
  ref,
  style,
  pressedStyle,
  haptic = "tap",
  scale = true,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressProps) {
  const reduceMotion = useReduceMotion();
  const [pressed, setPressed] = useState(false);
  // Held in state, not a ref: read during render for the transform, and the
  // same idiom the home screen uses for its reveal.
  const [value] = useState(() => new Animated.Value(1));

  const animate = useMemo(
    () => (to: number) => {
      if (!scale || reduceMotion) return;
      Animated.timing(value, {
        toValue: to,
        duration: duration.state,
        useNativeDriver: true,
      }).start();
    },
    [scale, reduceMotion, value]
  );

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        animate(PRESSED_SCALE);
        // On press-IN, not on press. The confirmation has to arrive with the
        // touch; fired on release it lands after the eye has already moved on.
        if (!disabled) {
          if (haptic === "tap") tapped();
          else if (haptic === "select") selected();
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        animate(1);
        onPressOut?.(e);
      }}
      style={[
        style,
        pressed && !disabled ? pressedStyle : null,
        // Never under Reduce Motion, and never while disabled — a disabled
        // control that still flinches reads as broken rather than as inert.
        { transform: [{ scale: disabled || reduceMotion ? 1 : value }] },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
