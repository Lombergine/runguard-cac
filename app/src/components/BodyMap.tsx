/**
 * The body figure, in its two modes. See ../../../docs/visual-spec.md
 * § "Components → Body map" and § "Imagery".
 *
 * A flat, front-facing figure drawn like a PRINTED ANATOMY KEY, not a rendered
 * illustration: one line weight (`ruleWidth`, the same rule that draws every
 * card), no gradient, no shading, no depth. An app that can surface a crisis
 * reply cannot also look cartoonish.
 *
 * TWO MODES, ONE FIGURE, AND THE TYPE DECIDES WHICH.
 *   - PICKER    — `selected` + `onToggle`. Every region carries a hit box.
 *   - READ-ONLY — `marks` + `accessibilityLabel`. NO `Pressable` is created at
 *                 all; there is nothing to press and nothing that looks
 *                 pressable.
 * `BodyMapProps` (../lib/types) is a union, not a `readonly` boolean, so a
 * display map cannot be handed an `onToggle` and a picker cannot forget one.
 * Read the docblock there before changing either member.
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
 * selected one is filled and outlined at full weight. The read-only marks obey
 * the same rule — see `MARK_COLOR`.
 *
 * LATERAL PARTS GET TWO HIT REGIONS, ONE STATE. The picker's `onToggle` takes a
 * bare part key and `selected` holds bare part keys, so both the left and the
 * right marker for a lateral part toggle — and fill — together. The pair exists
 * so a runner reaches for the sore side and finds a target there. Read-only
 * marks are the opposite: they name their side, because a scan that lit both
 * shins for one sore shin would be reporting something that was never recorded.
 *
 * THE PICKER THEREFORE NAMES A PART, NEVER A SIDE, and a caller that records
 * sides must say so in words next to the figure. CheckInCard does: it passes
 * the WORST score across a part's sides as that part's `severity`, exactly as
 * the website's twelve chips do (`widgets.tsx:206-209`), and the side and its
 * own score are named in the controls and the readout beneath the drawing.
 * This is a resolution limit of the picker, not a licence to imply two sore
 * shins — do not let a surface report from the fill alone.
 *
 * WHAT A FILL MEANS, AND WHAT IT MUST NOT. `on` is what draws a fill at all and
 * `severity` only sets its density (0.45 at 0/10, 1.0 at 10/10). So a part
 * scored ZERO is filled, faintly, inside a `track` outline, and a part never
 * answered for has no fill and a plain `rule` outline: the two are separated by
 * the presence of the fill and by the colour and contrast of the stroke, not by
 * density alone. A caller must never pass a part as `selected` with no entry in
 * `severity` when the number is genuinely unknown — that draws at FULL
 * intensity and would be a blank rendered as the worst possible reading.
 */
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { BODY_PARTS } from "../lib/bodyParts";
import { BodyMapProps, BodyMark } from "../lib/types";
import { ruleWidth, target } from "../theme/space";
import { color } from "../theme/tokens";

/**
 * Fixed size, deliberately not responsive: one SVG unit is one point, which is
 * the only way a 48-unit hit box is honestly a 48pt tap target. 320 is the
 * 360pt minimum width less the 20pt page inset on each side.
 */
const W = 320;
const H = 540;

/**
 * The READ-ONLY figure's drawn height.
 *
 * The picker is fixed at 320 × 540 because one SVG unit must be one point there
 * — that is the only way a 48-unit hit box is honestly a 48pt tap target. The
 * read-only scan has no hit boxes, so nothing ties it to that size, and at full
 * size it filled an entire phone screen: on the Stats tab the figure pushed the
 * five tiles, the heart-rate zones, the PR table, five charts and the training
 * year all below the fold, so the screen opened on a drawing and nothing else.
 * Caught by screenshot, not by diff.
 *
 * 300 keeps the same viewBox — every mark, outline and proportion scales with
 * it — and leaves the tiles visible on first paint. The website draws its own
 * body scan at 220 × 320 for the same reason.
 */
const READ_H = 300;
const READ_W = Math.round((W * READ_H) / H);

/** Mirrors the drawn left half onto the right. */
const MIRROR = `translate(${W}, 0) scale(-1, 1)`;

/** Severity floor for the selected fill, so a 1/10 report still reads as filled. */
const MIN_FILL = 0.45;

const MAX_SEVERITY = 10;

/**
 * What an unstated severity is worth. Mirrors the website's `?? 5`
 * (website/src/components/athlete/AthleteModel.tsx:38,46) so the two surfaces
 * band the same row identically. Injuries never reach it — they have their own
 * treatment.
 */
const ASSUMED_SEVERITY = 5;

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

/** The figure itself. Identical in both modes — the modes differ only in what
 *  is laid over it. */
function Figure() {
  return (
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
  );
}

function fillOpacity(severity: number | undefined): number {
  if (severity === undefined) return 1;
  const clamped = Math.max(0, Math.min(MAX_SEVERITY, severity));
  return MIN_FILL + (clamped / MAX_SEVERITY) * (1 - MIN_FILL);
}

/* ------------------------------------------------------------------ *
 * Picker
 * ------------------------------------------------------------------ */

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

function Picker({
  selected,
  onToggle,
  severity,
}: {
  selected: string[];
  onToggle: (partKey: string) => void;
  severity?: Record<string, number>;
}) {
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
          <Figure />

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

/* ------------------------------------------------------------------ *
 * Read-only marks
 *
 * The severity bands are the website's (AthleteModel.tsx:31-48): an injury and
 * a ≥7 soreness are the same top tone, ≥4 the middle one, below that the
 * lowest. The website's red/amber/gold become this app's three declared status
 * tones so the ramp is the same three steps in the app's own palette.
 *
 * COLOUR IS THE LAST CHANNEL, NEVER THE ONLY ONE (non-negotiable #4's
 * reasoning). Desaturate the figure and three things still separate:
 *
 *   injury            a DIAMOND core, on a DOUBLE-WEIGHT outline, full fill
 *   severe soreness   a ROUND core, near the largest radius, dense fill
 *   mild soreness     a ROUND core, near the smallest radius, faint fill
 *
 * so injury-vs-soreness is shape plus stroke weight, and severe-vs-mild is core
 * radius plus fill density. The tone only repeats what the drawing already
 * says.
 * ------------------------------------------------------------------ */

const MARK_COLOR: Record<"injury" | "severe" | "moderate" | "mild", string> = {
  injury: color.unusual,
  severe: color.unusual,
  moderate: color.serious,
  mild: color.watch,
};

/** Core radius, mild → severe. The website grows its glow the same way. */
const CORE_MIN_R = 3;
const CORE_MAX_R = 7;

/** Across the points, not the flats. */
const DIAMOND = 10;

function band(severity: number | undefined): "severe" | "moderate" | "mild" {
  const s = severity ?? ASSUMED_SEVERITY;
  if (s >= 7) return "severe";
  if (s >= 4) return "moderate";
  return "mild";
}

function coreRadius(severity: number | undefined): number {
  const s = Math.max(0, Math.min(MAX_SEVERITY, severity ?? ASSUMED_SEVERITY));
  return CORE_MIN_R + (s / MAX_SEVERITY) * (CORE_MAX_R - CORE_MIN_R);
}

/**
 * One mark: the region wash saying WHERE, and a core saying WHAT and HOW MUCH.
 * Shared with the legend key below, so the key is drawn by the same code as the
 * thing it explains and cannot drift from it.
 */
function Mark({
  patch,
  kind,
  severity,
}: {
  patch: Box;
  kind: BodyMark["kind"];
  severity?: number;
}) {
  const injury = kind === "injury";
  const tone = MARK_COLOR[injury ? "injury" : band(severity)];
  const cx = patch.x + patch.w / 2;
  const cy = patch.y + patch.h / 2;

  return (
    <G>
      <Rect
        x={patch.x}
        y={patch.y}
        width={patch.w}
        height={patch.h}
        rx={Math.min(patch.w, patch.h) / 3}
        fill={color.trackSoft}
        fillOpacity={injury ? 1 : fillOpacity(severity)}
        stroke={tone}
        strokeWidth={injury ? ruleWidth * 2 : ruleWidth}
      />
      {injury ? (
        <Rect
          x={cx - DIAMOND / 2}
          y={cy - DIAMOND / 2}
          width={DIAMOND}
          height={DIAMOND}
          fill={tone}
          transform={`rotate(45, ${cx}, ${cy})`}
        />
      ) : (
        <Circle cx={cx} cy={cy} r={coreRadius(severity)} fill={tone} />
      )}
    </G>
  );
}

/** Swatch size, and the square patch drawn inside it. */
const SWATCH = 22;
const SWATCH_PATCH: Box = { x: 2, y: 2, w: SWATCH - 4, h: SWATCH - 4 };

/**
 * One entry of the legend key, drawn by `Mark` at swatch scale.
 *
 * `accessibilityElementsHidden` because the key is redundant to a screen
 * reader: every flagged area is already spelled out in the legend rows and in
 * the figure's summary label, and reading four wordless swatches would add
 * nothing but stops.
 */
export function MarkSwatch({ kind, severity }: { kind: BodyMark["kind"]; severity?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={SWATCH} height={SWATCH} viewBox={`0 0 ${SWATCH} ${SWATCH}`}>
        <Mark patch={SWATCH_PATCH} kind={kind} severity={severity} />
      </Svg>
    </View>
  );
}

function ReadOnly({
  marks,
  accessibilityLabel,
}: {
  marks: readonly BodyMark[];
  accessibilityLabel: string;
}) {
  const half = (side: BodyMark["side"]) =>
    marks
      .filter((m) => m.side === side && GEO[m.key])
      .map((m, i) => (
        <Mark
          key={`${m.kind}-${m.key}-${i}`}
          patch={GEO[m.key].patch}
          kind={m.kind}
          severity={m.severity}
        />
      ));

  return (
    // One accessibility node for the whole figure. The marks are wordless
    // shapes, and on a touch device there is no tooltip to recover them from —
    // so the summary lives here and the detail lives in the legend, as text.
    <View
      style={styles.wrapRead}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={READ_W} height={READ_H} viewBox={`0 0 ${W} ${H}`}>
        <Figure />

        {half(null)}
        {half("left")}
        <G transform={MIRROR}>{half("right")}</G>
      </Svg>
    </View>
  );
}

export function BodyMap(props: BodyMapProps) {
  if (props.marks !== undefined) {
    return (
      <ReadOnly marks={props.marks} accessibilityLabel={props.accessibilityLabel} />
    );
  }
  return (
    <Picker
      selected={props.selected}
      onToggle={props.onToggle}
      severity={props.severity}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: W,
    height: H,
    alignSelf: "center",
  },
  wrapRead: {
    width: READ_W,
    height: READ_H,
    alignSelf: "center",
  },
  hit: {
    position: "absolute",
  },
});

export default BodyMap;
