/**
 * The soreness picker. See ../../../docs/visual-spec.md § "Components → Body map".
 *
 * A flat, front-facing figure drawn like a PRINTED ANATOMY KEY, not a rendered
 * illustration: one line weight (`ruleWidth`, the same rule that draws every
 * card), no gradient, no shading, no depth. An app that can surface a crisis
 * reply cannot also look cartoonish.
 *
 * REGIONS COME FROM `lib/bodyParts`. They are never re-listed here — the same
 * twelve the coach's injury form offers, or the map lights up differently
 * depending on which form an entry came through. Only the *geometry* lives in
 * this file, in `GEO`, keyed by those same keys.
 *
 * THE HIT AREA IS NOT THE DRAWING. An achilles is ten points wide on a figure
 * this size. Every region therefore carries an invisible Pressable sized from
 * `target.min`, laid over the figure and merely *containing* its marker. The
 * SVG takes no touches at all. Every hit box is ≥48×48 with ≥8pt between
 * neighbours; the geometry table below is tuned to that and little else, so
 * moving a box means re-checking its neighbours.
 *
 * SUPPORT COLOUR, NOT THE BRAND — and this survives the sunrise re-skin
 * unchanged. Selection fills `trackSoft` behind a `track` outline. Sunrise stops
 * rationing colour and makes the ember visible almost everywhere, which makes
 * this the one place it must be argued for rather than assumed: a tapped region
 * is the athlete describing their body, not actuating the system, and a region
 * wearing the brand would read as a control that had fired. `track` is the same
 * warm family as the ember and unmistakably not it, so the figure still belongs
 * on the cream ground without ever borrowing the signature.
 *
 * The distinction also has to survive greyscale, so it is never carried by hue
 * alone: an unselected marker has no fill at all and a `rule` outline, a
 * selected one is filled and outlined at full weight.
 *
 * LATERAL PARTS GET TWO HIT REGIONS, ONE STATE. The contract's `onToggle`
 * takes a bare part key and `selected` holds bare part keys, so both the left
 * and the right marker for a lateral part toggle — and fill — together. The
 * pair exists so a runner reaches for the sore side and finds a target there.
 */
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Ellipse, G, Path, Rect } from "react-native-svg";

import { BODY_PARTS } from "../lib/bodyParts";
import { BodyMapProps } from "../lib/types";
import { ruleWidth, target } from "../theme/space";
import { color } from "../theme/tokens";

/**
 * Fixed size, deliberately not responsive: one SVG unit is one point, which is
 * the only way a 48-unit hit box is honestly a 48pt tap target. 320 is the
 * 360pt minimum width less the 20pt page inset on each side.
 */
const W = 320;
const H = 540;

/** Mirrors the drawn left half onto the right. */
const MIRROR = `translate(${W}, 0) scale(-1, 1)`;

/** Severity floor for the selected fill, so a 1/10 report still reads as filled. */
const MIN_FILL = 0.45;

const MAX_SEVERITY = 10;

type Box = { x: number; y: number; w: number; h: number };

type Geo = {
  /** The visible marker. */
  patch: Box;
  /** The tap target. Must contain `patch`, and never overlap a neighbour. */
  hit: Box;
};

const hit = (x: number, y: number, w: number = target.min): Box => ({
  x,
  y,
  w,
  h: target.min,
});

/**
 * Geometry per part key. Lateral parts are described on the left half only and
 * mirrored; non-lateral parts sit on the centreline and are drawn once.
 *
 * The eight tap rows are pitched 56 apart (48 target + 8 minimum gap):
 * 84 · 140 · 196 · 252 · 308 · 364 · 420 · 476.
 */
const GEO: Record<string, Geo> = {
  shoulder: { patch: { x: 96, y: 92, w: 30, h: 30 }, hit: hit(88, 84) },
  "lower back": {
    patch: { x: 128, y: 146, w: 64, h: 36 },
    hit: hit(126, 140, 68),
  },
  hip: { patch: { x: 100, y: 200, w: 26, h: 38 }, hit: hit(80, 196) },
  groin: { patch: { x: 146, y: 196, w: 28, h: 32 }, hit: hit(136, 196) },
  quad: { patch: { x: 108, y: 256, w: 28, h: 40 }, hit: hit(108, 252) },
  hamstring: { patch: { x: 88, y: 256, w: 12, h: 40 }, hit: hit(52, 252) },
  knee: { patch: { x: 94, y: 314, w: 32, h: 36 }, hit: hit(86, 308, 64) },
  shin: { patch: { x: 104, y: 368, w: 18, h: 40 }, hit: hit(104, 364) },
  calf: { patch: { x: 84, y: 368, w: 12, h: 40 }, hit: hit(48, 364) },
  achilles: { patch: { x: 88, y: 424, w: 10, h: 34 }, hit: hit(56, 420, 56) },
  heel: { patch: { x: 98, y: 478, w: 18, h: 26 }, hit: hit(96, 476, 56) },
  foot: { patch: { x: 60, y: 496, w: 28, h: 22 }, hit: hit(40, 476) },
};

/** Two strokes only — the head is drawn over their tops. */
const NECK = "M 151 54 L 151 78 M 169 54 L 169 78";

const TORSO =
  "M 151 76 L 118 90 L 110 120 L 122 158 L 112 218 L 146 218 L 160 206 " +
  "L 174 218 L 208 218 L 198 158 L 210 120 L 202 90 L 169 76 Z";

/** Open paths: the unstroked closing segment is what keeps the shoulder and
 *  hip joints from picking up a line the anatomy does not have. */
const ARM = "M 116 92 L 100 98 L 84 152 L 72 196 L 82 200 L 96 156 L 112 106";

const LEG =
  "M 112 218 L 96 262 L 92 314 L 90 356 L 90 420 L 92 462 L 86 486 " +
  "L 56 506 L 58 520 L 104 518 L 122 496 L 120 462 L 124 420 L 126 356 " +
  "L 132 314 L 146 262 L 146 218";

function fillOpacity(severity: number | undefined): number {
  if (severity === undefined) return 1;
  const clamped = Math.max(0, Math.min(MAX_SEVERITY, severity));
  return MIN_FILL + (clamped / MAX_SEVERITY) * (1 - MIN_FILL);
}

function Marker({ patch, on, severity }: { patch: Box; on: boolean; severity?: number }) {
  return (
    <Rect
      x={patch.x}
      y={patch.y}
      width={patch.w}
      height={patch.h}
      rx={Math.min(patch.w, patch.h) / 3}
      fill={on ? color.trackSoft : "none"}
      fillOpacity={on ? fillOpacity(severity) : undefined}
      stroke={on ? color.track : color.rule}
      strokeWidth={ruleWidth}
    />
  );
}

export function BodyMap({ selected, onToggle, severity }: BodyMapProps) {
  const isOn = (key: string) => selected.includes(key);

  const markers = (lateral: boolean) =>
    BODY_PARTS.filter((p) => p.lateral === lateral).map((p) => (
      <Marker
        key={p.key}
        patch={GEO[p.key].patch}
        on={isOn(p.key)}
        severity={severity?.[p.key]}
      />
    ));

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none">
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <G stroke={color.ink2} strokeWidth={ruleWidth} fill={color.card}>
            <Path d={NECK} fill="none" />
            <Ellipse cx={160} cy={32} rx={21} ry={25} />
            <Path d={TORSO} />
            <Path d={ARM} />
            <Path d={LEG} />
            <G transform={MIRROR}>
              <Path d={ARM} />
              <Path d={LEG} />
            </G>
          </G>

          {markers(false)}
          {markers(true)}
          <G transform={MIRROR}>{markers(true)}</G>
        </Svg>
      </View>

      {BODY_PARTS.flatMap((p) => {
        const box = GEO[p.key].hit;
        const on = isOn(p.key);
        const sev = severity?.[p.key];
        const boxes = p.lateral
          ? [box, { ...box, x: W - box.x - box.w }]
          : [box];

        return boxes.map((b, i) => (
          <Pressable
            key={`${p.key}-${i}`}
            onPress={() => onToggle(p.key)}
            accessibilityRole="button"
            accessibilityLabel={p.label}
            accessibilityState={{ selected: on }}
            accessibilityValue={
              on && sev !== undefined
                ? { text: `severity ${sev} of ${MAX_SEVERITY}` }
                : undefined
            }
            style={[
              styles.hit,
              { left: b.x, top: b.y, width: b.w, height: b.h },
            ]}
          />
        ));
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: W,
    height: H,
    alignSelf: "center",
  },
  hit: {
    position: "absolute",
  },
});

export default BodyMap;
