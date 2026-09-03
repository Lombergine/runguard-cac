/**
 * The iOS large title — a heading that starts big and becomes the nav bar.
 *
 * The mock's first line about the rebuild is "large titles", and it is doing
 * more than setting a font size. On the web every screen carried its own
 * heading inside the scroll, which means once you scroll past it nothing on
 * screen says where you are. A large title solves that by being two things at
 * once: a display heading at rest, and — as it scrolls away — a compact bar
 * that stays. § "Coach dashboard" in the visual spec asks for exactly that
 * guarantee on any detail surface ("never rely on the user remembering which
 * row they clicked"), and this is the native way to give it.
 *
 * ── DRIVEN ON THE UI THREAD ────────────────────────────────────────────────
 * The crossfade is an `Animated` interpolation over the scroll offset with
 * `useNativeDriver`, so it does not re-render this component or its children
 * as the finger moves. Driving it from React state would run a render per
 * scroll frame, and on a list of fourteen athletes with sparklines that is
 * exactly where a native-feeling screen starts to feel like a web page.
 *
 * Callers own the ScrollView, because they also own its refresh control and
 * content; this only needs the offset. `useScrollTitle()` returns the value to
 * pass and the handler to attach.
 */
import { useState, type ReactNode } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, ruleWidth, space } from "../theme/space";

/** Distance over which the big title hands off to the bar. */
const HANDOFF = 44;

export function useScrollTitle() {
  /*
    `useState` initialiser, not `useRef(new Animated.Value(0)).current`.
    The classic RN idiom reads `.current` during render, which the React
    compiler's refs rule rejects — a ref read while rendering is the shape that
    silently fails to update. A lazy `useState` gives the same "construct once,
    never re-construct" guarantee without touching a ref in render, and the
    value is never set again so the setter is dropped.
  */
  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );
  return { scrollY, onScroll };
}

export function LargeTitle({
  title,
  subtitle,
  scrollY,
  /** Nav-bar buttons — where chat and settings live now. */
  actions,
}: {
  title: string;
  subtitle?: string;
  scrollY: Animated.Value;
  actions?: ReactNode;
}) {
  // The compact title fades IN as the big one leaves, so exactly one of them
  // is legible at any offset and they never read as a duplicate heading.
  const compactOpacity = scrollY.interpolate({
    inputRange: [HANDOFF * 0.4, HANDOFF],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const largeOpacity = scrollY.interpolate({
    inputRange: [0, HANDOFF * 0.7],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const borderOpacity = compactOpacity;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.bar}>
        <Animated.Text
          style={[styles.compact, { opacity: compactOpacity }]}
          numberOfLines={1}
          /* Hidden from assistive tech: it is the same string as the large
             title below, and announcing both reads the screen name twice. */
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {title}
        </Animated.Text>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>

      <Animated.View style={{ opacity: largeOpacity }}>
        <Text style={styles.large} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </Animated.View>

      {/* The hairline only exists once the bar is carrying the title. */}
      <Animated.View style={[styles.hairline, { opacity: borderOpacity }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: color.bg,
    paddingHorizontal: layout.page,
    paddingBottom: space.sm,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: Platform.OS === "ios" ? 32 : 40,
    gap: space.md,
  },
  compact: { ...text.baseSemi, color: color.ink, flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md },
  large: { ...text.prompt, color: color.ink, marginTop: space.xs },
  subtitle: { ...text.meta, color: color.muted, marginTop: 2 },
  hairline: {
    height: ruleWidth,
    backgroundColor: color.sep,
    marginHorizontal: -layout.page,
    marginTop: space.sm,
  },
});

export default LargeTitle;
