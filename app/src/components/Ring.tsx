/**
 * A measured value as an arc. Sleep against a night's worth, readiness out of
 * 100, a week against its target.
 *
 * `frac === null` is the absent state, and it is drawn as a DASHED ring with
 * whatever the caller puts in the middle — a `—`, by convention. That is the
 * one place this component touches the visual spec's floor: a blank must never
 * read as a low-but-present value, so an empty ring is never a solid track with
 * nothing on it. It is visibly a different object.
 *
 * SVG takes plain hex, so colours come from `useColors()` rather than the
 * dynamic `color` object — see theme/tokens.ts for the split.
 */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "../theme/tokens";

type RingProps = {
  size: number;
  /** 0..1, or `null` for "not measured". */
  frac: number | null;
  /** Hex only — a palette key from `useColors()`. */
  color: string;
  strokeWidth?: number;
  children?: ReactNode;
};

export function Ring({ size, frac, color, strokeWidth = 9, children }: RingProps) {
  const c = useColors();
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const known = frac !== null;
  const shown = known ? Math.max(0, Math.min(1, frac)) : 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Start at twelve o'clock.
        style={styles.rotated}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={known ? c.rule : c.unknown}
          strokeWidth={known ? strokeWidth : Math.max(2, strokeWidth / 3)}
          strokeDasharray={known ? undefined : "3 4"}
        />
        {known ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circ * shown} ${circ}`}
          />
        ) : null}
      </Svg>
      {/*
        Inset by the stroke so the label can never sit under the arc, and the
        callers below render their text with `allowFontScaling={false}`: a fixed
        circle cannot grow with Dynamic Type, so a scaled numeral would spill
        out of it. This is the one place in the app where type does not scale,
        and the value is always repeated in the prose beside the ring.
      */}
      <View
        style={[styles.centre, { padding: strokeWidth + 2 }]}
        pointerEvents="none"
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rotated: { transform: [{ rotate: "-90deg" }] },
  centre: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
