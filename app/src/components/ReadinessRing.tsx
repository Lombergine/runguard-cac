/**
 * The readiness ring — 104pt, a 270° arc, the figure in the middle.
 *
 * From the Claude Design study, which draws it as the one instrument on the
 * home screen. Geometry is the mockup's, verbatim: r45 on a 104 box, stroke 9,
 * round caps, the whole thing rotated 135° so the gap sits at the bottom, and a
 * `212 283` dash array — 283 is the circumference (2πr ≈ 282.7) and 212 is
 * three-quarters of it, which is what makes the arc 270° rather than a circle.
 *
 * ── WHY THIS IS BACK ────────────────────────────────────────────────────────
 *
 * `app/(tabs)/index.tsx` used to say the home hero was "the website's shape
 * minus the gauge", and printed the number as plain type. That was a reasonable
 * reading of "there is no composite score anywhere" in the visual spec — but
 * that rule is about not inventing an authoritative-looking number, not about
 * the shape it is drawn in. The design study puts the ring back, and a ring is
 * a better honest reading than a bare numeral: it shows the figure AGAINST its
 * range, so 73 reads as "most of the way" rather than as a grade.
 *
 * ── THE PART THAT IS NOT DECORATION ─────────────────────────────────────────
 *
 * This component takes a NUMBER, never a `ReadinessState`, and the caller must
 * not render it when readiness is unknown. That is deliberate and it is the
 * whole safety argument: the engine returns 100 for an athlete it knows nothing
 * about, so a ring that could accept "unknown" would eventually be handed one
 * and would draw a full, confident circle from no data — non-negotiable #6, and
 * the exact failure `lib/readiness.ts` exists to prevent. An absent readiness
 * has no ring at all, not a grey one: a grey ring still reads as a reading.
 *
 * The design agrees — its gauge lives only inside the `didCheckIn` branch.
 */
import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { useReducedMotion } from "../lib/useReducedMotion";
import { color, staticColor } from "../theme/tokens";
import { duration } from "../theme/space";
import { font, tabular, text } from "../theme/type";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The mockup's box, radius and stroke. */
const SIZE = 104;
const R = 45;
const STROKE = 9;
/** 2πr, and the three-quarters of it the arc actually occupies. */
const CIRCUMFERENCE = 283;
const ARC = 212;

/**
 * Readiness is 0–100, and the arc is the fraction of ARC that is filled.
 * `dashoffset` counts DOWN from ARC as the value rises, which is why a full
 * score is an offset of 0.
 */
function offsetFor(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return ARC - (ARC * clamped) / 100;
}

export type ReadinessRingProps = {
  /** 0–100. Only ever a real, gated reading — see the note above. */
  value: number;
  /** The verdict's colour. A GLYPH colour, so callers pass a `…Text` token. */
  tint: string;
};

export function ReadinessRing({ value, tint }: ReadinessRingProps) {
  const reduced = useReducedMotion();
  /*
     Starts empty and draws in. Under reduced motion the duration collapses to
     zero, so it arrives complete rather than not arriving.

     `useState` with a lazy initialiser rather than `useRef(...).current`: the
     latter reads a ref during render, which `react-hooks/refs` flags and which
     is genuinely unsafe under concurrent rendering. This constructs the value
     exactly once and never re-reads it during render.
  */
  const [progress] = useState(() => new Animated.Value(ARC));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: offsetFor(value),
      duration: reduced ? 0 : duration.reveal * 5,
      /* `stroke-dashoffset` is not a transform or an opacity, so it cannot run
         on the native driver. It animates one SVG attribute on one element. */
      useNativeDriver: false,
    }).start();
  }, [progress, value, reduced]);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      /* One announcement. A screen reader should hear the reading, not the
         geometry — and never the bare number without its scale. */
      accessibilityLabel={`Readiness ${value} out of 100.`}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* 135° puts the 90° gap at the bottom, centred. */}
        <G rotation={135} origin={`${SIZE / 2}, ${SIZE / 2}`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={staticColor.rule}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={tint}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
            strokeDashoffset={progress}
          />
        </G>
      </Svg>

      {/* Centred over the ring rather than inside the SVG: RN's <Text> in SVG
          cannot take the app's font stack, and every numeral here is mono. */}
      <View style={styles.centre} pointerEvents="none">
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.caption}>readiness</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
  centre: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Mono and tabular, like every figure in this app. */
  value: {
    fontFamily: font.mono,
    fontSize: 30,
    lineHeight: 32,
    color: color.ink,
    ...tabular,
  },
  caption: { ...text.micro, color: color.muted, marginTop: 3 },
});

export default ReadinessRing;
