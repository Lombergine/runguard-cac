/**
 * The advisory shape. See ../../../docs/visual-spec.md § "Status and advisory".
 *
 * SHAPE carries the meaning; colour is applied last and never alone. A
 * screenshot converted to greyscale must still separate all four states, so the
 * four glyphs differ in fill topology, not just hue:
 *
 *   clear    whole disc filled
 *   watch    ring, left half filled
 *   unusual  ring, two opposing quadrants filled — visibly broken into pieces
 *   unknown  dashed ring, nothing filled
 *
 * Drawn in a fixed 24-unit viewBox and scaled to `size`, so the stroke stays
 * proportional at any diameter.
 */
import Svg, { Circle, Path } from "react-native-svg";

import { StatusDotProps } from "../lib/types";
import { color } from "../theme/tokens";

const BOX = 24;
const C = BOX / 2;
const R = 9.5;
const STROKE = 3;
/** 24 dashes around the ring, so the pattern closes evenly. */
const DASH = (2 * Math.PI * R) / 24;

export function StatusDot({ flag, size = 12 }: StatusDotProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {flag === "clear" ? (
        <Circle cx={C} cy={C} r={R + STROKE / 2} fill={color.ok} />
      ) : null}

      {flag === "watch" ? (
        <>
          <Circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={color.watch}
            strokeWidth={STROKE}
          />
          <Path
            d={`M ${C} ${C - R} A ${R} ${R} 0 0 0 ${C} ${C + R} Z`}
            fill={color.watch}
          />
        </>
      ) : null}

      {flag === "unusual" ? (
        <>
          <Circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={color.unusual}
            strokeWidth={STROKE}
          />
          <Path
            d={`M ${C} ${C} L ${C} ${C - R} A ${R} ${R} 0 0 1 ${C + R} ${C} Z`}
            fill={color.unusual}
          />
          <Path
            d={`M ${C} ${C} L ${C} ${C + R} A ${R} ${R} 0 0 1 ${C - R} ${C} Z`}
            fill={color.unusual}
          />
        </>
      ) : null}

      {flag === "unknown" ? (
        <Circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke={color.unknown}
          strokeWidth={STROKE}
          strokeDasharray={[DASH, DASH]}
        />
      ) : null}
    </Svg>
  );
}

export default StatusDot;
