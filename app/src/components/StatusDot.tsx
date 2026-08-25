/**
 * The advisory shape. See ../../../docs/visual-spec.md § "Status and advisory".
 *
 * SHAPE carries the meaning; colour is applied last and never alone. A
 * screenshot converted to greyscale must still separate all four states, so the
 * four glyphs differ in fill topology, not just hue:
 *
 *   clear    whole disc filled
 *   watch    ring, left half filled
 *   unusual  two opposing quadrants, nothing else — visibly split in two
 *   unknown  dashed ring, nothing filled
 *
 * These are SHAPES, not glyphs, so they take the fill tokens (`ok`, `watch`,
 * `unusual`) rather than the `…Text` variants. The word beside the dot is what
 * needs a text-safe colour, and Advisory handles that.
 *
 * ── The `unusual` fix ──────────────────────────────────────────────────────
 * `unusual` used to draw the two opposing quadrants ON TOP OF a full ring. The
 * ring closed the outline and the two quadrants met at the centre, so the
 * coloured area was one connected mass and the only thing left uncoloured was
 * two small wedges: rendered, it read as a filled disc with a white cross
 * scratched through it, not as a split dot. Worse, at the default 12px that
 * made it a near-twin of `clear` (also a filled disc) in greyscale — the exact
 * failure the shape system exists to prevent.
 *
 * The ring is gone. `unusual` is now two opposing sectors and nothing else,
 * drawn out to the same outer radius as `clear`'s disc so the glyph keeps its
 * footprint and its optical centre next to a line of text.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Drawn in a fixed 24-unit viewBox and scaled to `size`, so the stroke stays
 * proportional at any diameter.
 */
import Svg, { Circle, Path } from "react-native-svg";

import { StatusDotProps } from "../lib/types";
import { space } from "../theme/space";
import { color } from "../theme/tokens";

const BOX = 24;
const C = BOX / 2;
const R = 9.5;
const STROKE = 3;
/** Outer edge of a stroked ring — the radius a filled glyph must reach to match it. */
const RO = R + STROKE / 2;
/** 24 dashes around the ring, so the pattern closes evenly. */
const DASH = (2 * Math.PI * R) / 24;

/**
 * The rendered diameter beside a line of body text — a real dimension, so it
 * comes off the 4px scale rather than being typed in here. `space.md` is 12,
 * which is the size the contract in lib/types documents as the default.
 */
const SIZE = space.md;

/** A quarter-disc of radius `RO`, swept clockwise from `from` to the next axis. */
const quadrant = (fromX: number, fromY: number, toX: number, toY: number) =>
  `M ${C} ${C} L ${fromX} ${fromY} A ${RO} ${RO} 0 0 1 ${toX} ${toY} Z`;

/** Top → right. */
const TOP_RIGHT = quadrant(C, C - RO, C + RO, C);
/** Bottom → left, the quadrant diagonally opposite. */
const BOTTOM_LEFT = quadrant(C, C + RO, C - RO, C);

export function StatusDot({ flag, size = SIZE }: StatusDotProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {flag === "clear" ? (
        <Circle cx={C} cy={C} r={RO} fill={color.ok} />
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

      {/* Two opposing quadrants and NO ring — see the header. The pair touches
          only at the centre point, which is what makes it read as split. */}
      {flag === "unusual" ? (
        <>
          <Path d={TOP_RIGHT} fill={color.unusual} />
          <Path d={BOTTOM_LEFT} fill={color.unusual} />
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
