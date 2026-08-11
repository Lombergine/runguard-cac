/**
 * The chart frame: axes, gridlines, the tap target, and the readout.
 *
 * Eight charts on the website (`website/src/components/charts.tsx`) become one
 * frame plus a handful of marks, because seven of the eight are the same
 * picture underneath: a CATEGORICAL x axis of evenly spaced days or weeks.
 * Recharts is doing that too — `dataKey="date"` is a category there, not a
 * time scale — so only y needs a scale and x is arithmetic:
 *
 *     x(i) = padLeft + (i + 0.5) * step
 *
 * There is deliberately no date axis in here. The PR chart is the one series
 * with genuinely uneven dates; if it ever wants true time spacing its agent
 * builds an x scale with `linearScale` and real timestamps, which is exactly
 * what that function is general enough for. The website's own PR chart plots
 * categorically (`charts.tsx:380`, `dataKey="label"`), so this is not a
 * regression.
 *
 * ── Width comes from onLayout, not useWindowDimensions ─────────────────────
 * These sit inside a `Card` inside the page inset. Deriving width from the
 * window means hardcoding the sum of every ancestor's padding, which is wrong
 * the day a spacing token changes and wrong immediately on any screen with a
 * different inset. `onLayout` also handles rotation and Dynamic Type reflow
 * for free. Nothing renders inside `<Svg>` until width is known, but the
 * wrapper carries an explicit fixed height, so the frame reserves its exact
 * final height on the first pass — the spec's "skeletons reserve exact final
 * height; the layout must not shift as data arrives".
 *
 * ── One height for every chart ─────────────────────────────────────────────
 * The website uses seven different heights (150–220). A stack of panels at
 * seven heights stops reading as one system, so there is a single constant
 * here composed from the 4px scale and no per-chart height prop.
 *
 * ── Interaction: one model for every chart ─────────────────────────────────
 * Tap to select, with a persistent readout beneath the plot, pre-filled with
 * the most recent point. No hover, no tooltip that follows a finger, no
 * long-press. A tooltip on a phone is covered by the hand holding the phone.
 *
 * The tap target is a plain `Pressable`, NOT the responder API and NOT
 * react-native-gesture-handler: `Pressable` cancels on move, so it does not
 * fight the vertical `ScrollView` these live in and needs no gesture
 * arbitration. RNGH is present transitively via expo-router; keeping it out of
 * the direct dependency list keeps it upgradable.
 *
 * ── The readout is text, not picture ───────────────────────────────────────
 * `SvgText` respects neither Dynamic Type nor VoiceOver. So the chart is a
 * picture and the number you actually read is a real RN `<Text>` beneath it.
 * It always names the explicit local day (non-negotiable #2), so a mis-tap is
 * visible rather than silently wrong, and it is pre-filled with the latest
 * point because tappability is undiscoverable — the first read must be free.
 *
 * ── Units ──────────────────────────────────────────────────────────────────
 * `unitLabel` is required (non-negotiable #3). It prints once at the head of
 * the y axis, and `readout` welds the unit into the value string. There is no
 * supported way to render this chart without saying what its numbers are.
 */
import { ReactNode, useCallback, useMemo, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Line, Text as SvgText } from "react-native-svg";

import { Absent } from "../Nothing";
import { ChartPoint, linearScale, niceTicks, Scale } from "./scales";
import { space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, text } from "../../theme/type";

/* ------------------------------------------------------------------ *
 * Geometry constants. All from the 4px scale.
 * ------------------------------------------------------------------ */

/** The one chart height, everywhere. 48 × 4. */
export const PLOT_HEIGHT = space.xxxl * 4;

/** Headroom so a mark at the top of the domain is not clipped by the frame. */
const PAD_TOP = space.md;
/** The strip under the plot that holds the first and last x labels. */
const AXIS_BAND = space.xl;
const PAD_RIGHT = space.sm;
/** Gap between a y tick label and the plot's left edge. */
const TICK_GAP = space.sm;

/**
 * Tick type. 11.5px is the micro size from the type scale, but `text.micro`
 * itself cannot be used here: RNSVG's `Text` supports neither `textTransform`
 * nor `fontVariant`, so its uppercasing and +0.12em tracking would silently do
 * nothing. It does not matter — Spline Sans Mono is fixed-advance, so figures
 * align in columns without any of that.
 */
const TICK_SIZE = 11.5;
/**
 * Spline Sans Mono's advance width, in ems. Because the face is monospaced,
 * label width is exactly `chars × advance × fontSize` — so the left padding is
 * COMPUTED, never guessed, and never measured at runtime. A guessed left pad
 * is how "8:12" ends up half outside the card.
 */
const MONO_ADVANCE = 0.6;

/* ------------------------------------------------------------------ *
 * Frame — the geometry the marks draw against.
 * ------------------------------------------------------------------ */

export type Frame = {
  /** Centre of category `i`, in px. */
  x: (i: number) => number;
  /** Px per category. Bar width is derived from this in marks.tsx. */
  step: number;
  /** Value → px. Already carries the domain's orientation. */
  y: Scale;
  left: number;
  right: number;
  top: number;
  bottom: number;
  count: number;
};

export type PlotProps = {
  data: ChartPoint[];
  /**
   * `[value at the BOTTOM of the frame, value at the TOP]`.
   *
   * Pass `[max, min]` to get the pace/PR flip. That is the whole mechanism —
   * see scales.ts. There is no `reversed` prop and there must never be one.
   */
  domain: [number, number];
  /** Printed once at the y-axis head. Required — non-negotiable #3. */
  unitLabel: string;
  /** Defaults to a trimmed decimal. Pace and PR pass `m:ss` formatters. */
  tickFormat?: (v: number) => string;
  /** Explicit y ticks. Defaults to `niceTicks` over the domain. */
  ticks?: number[];
  /**
   * The value phrase for point `i`, WITH ITS UNIT WELDED IN — "6.8 mi", not
   * "6.8". Plot adds the day label itself, from `data[i].label`, so a chart
   * cannot forget to say which day it is showing.
   */
  readout: (i: number) => string;
  /** Sentence summary for assistive tech. The picture itself is hidden. */
  accessibilityLabel: string;
  children: (frame: Frame) => ReactNode;
};

const trimmed = (v: number) => String(Number(v.toFixed(2)));

export function Plot({
  data,
  domain,
  unitLabel,
  tickFormat = trimmed,
  ticks,
  readout,
  accessibilityLabel,
  children,
}: PlotProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  const yTicks = useMemo(
    () => ticks ?? niceTicks(Math.min(...domain), Math.max(...domain), 4),
    [ticks, domain],
  );

  const padLeft = useMemo(() => {
    const chars = yTicks.reduce(
      (n, t) => Math.max(n, tickFormat(t).length),
      1,
    );
    return Math.ceil(chars * MONO_ADVANCE * TICK_SIZE) + TICK_GAP;
  }, [yTicks, tickFormat]);

  const top = PAD_TOP;
  const bottom = PLOT_HEIGHT - AXIS_BAND;
  const right = Math.max(padLeft, width - PAD_RIGHT);
  const count = data.length;
  const step = count > 0 ? (right - padLeft) / count : 0;

  const frame: Frame = useMemo(
    () => ({
      x: (i: number) => padLeft + (i + 0.5) * step,
      step,
      y: linearScale({ domain, range: [bottom, top] }),
      left: padLeft,
      right,
      top,
      bottom,
      count,
    }),
    [padLeft, step, domain, right, top, bottom, count],
  );

  const onPress = useCallback(
    (e: GestureResponderEvent) => {
      if (count === 0 || step <= 0) return;
      const i = Math.floor((e.nativeEvent.locationX - padLeft) / step);
      setSelected(Math.max(0, Math.min(count - 1, i)));
    },
    [count, step, padLeft],
  );

  // Pre-filled with the most recent point. Clamped, because `data` can get
  // shorter under a live selection when a screen refetches.
  const active =
    count === 0 ? -1 : Math.min(selected ?? count - 1, count - 1);

  return (
    <View>
      {/* Real RN Text, not SvgText: this is a label, and `text.micro`'s
          uppercasing and tracking do not survive RNSVG. It sits at the head of
          the y axis, indented past nothing — the ticks below it are right
          aligned to the same edge. */}
      <Text style={styles.unit}>{unitLabel}</Text>

      <View
        style={styles.frame}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {width > 0 && count > 0 ? (
          /* The picture carries no information the readout below does not
             also carry in text, so it is hidden from assistive tech entirely
             — the same pattern as the calendar heat grid. */
          <Svg width={width} height={PLOT_HEIGHT} accessible={false}>
            {/* Horizontal gridlines only, at the y ticks. Every chart on the
                website sets `vertical={false}`; vertical rules on a 30-column
                categorical axis are just noise. */}
            {yTicks.map((t) => (
              <Line
                key={`g${t}`}
                x1={padLeft}
                x2={right}
                y1={frame.y(t)}
                y2={frame.y(t)}
                stroke={color.grid}
                strokeWidth={1}
              />
            ))}

            <Line
              x1={padLeft}
              x2={right}
              y1={bottom}
              y2={bottom}
              stroke={color.baseline}
              strokeWidth={1}
            />

            {/* The selection cursor, under the marks so it never hides one. */}
            {active >= 0 ? (
              <Line
                x1={frame.x(active)}
                x2={frame.x(active)}
                y1={top}
                y2={bottom}
                stroke={color.ruleStrong}
                strokeWidth={1}
              />
            ) : null}

            {children(frame)}

            {yTicks.map((t) => (
              <SvgText
                key={`t${t}`}
                x={padLeft - TICK_GAP}
                y={frame.y(t) + TICK_SIZE * 0.36}
                textAnchor="end"
                fontFamily={font.mono}
                fontSize={TICK_SIZE}
                fill={color.muted}
              >
                {tickFormat(t)}
              </SvgText>
            ))}

            {/* Only the two ends of the x axis are labelled. Thirty labels do
                not fit, and the two that name the range are what the picture
                is actually claiming; every other day is read by tapping. */}
            <SvgText
              x={padLeft}
              y={PLOT_HEIGHT - space.sm}
              textAnchor="start"
              fontFamily={font.mono}
              fontSize={TICK_SIZE}
              fill={color.muted}
            >
              {data[0].label}
            </SvgText>
            {count > 1 ? (
              <SvgText
                x={right}
                y={PLOT_HEIGHT - space.sm}
                textAnchor="end"
                fontFamily={font.mono}
                fontSize={TICK_SIZE}
                fill={color.muted}
              >
                {data[count - 1].label}
              </SvgText>
            ) : null}
          </Svg>
        ) : null}

        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onPress}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>

      {active >= 0 ? (
        <View style={styles.readout}>
          {/* One node, unit welded in by the caller. */}
          <Text style={styles.readoutValue}>{readout(active)}</Text>
          {/* The explicit local day, always. */}
          <Text style={styles.readoutDay}>{data[active].label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * What a chart renders when there is not enough data to draw one.
 *
 * This is the EXISTING `Absent`, not a new component and not a chart-specific
 * empty state. In this app "not enough data yet" *is* the unknown case, and
 * reusing `Absent` is the only way it stays visually identical to every other
 * unknown on every other screen — dashed, sunken, "—". The wrapper exists only
 * to hold the plot's exact height so the panel does not change size between
 * the two states.
 *
 * The per-chart sentence comes from `lib/chartData.ts`, which mirrors the
 * website's `InsufficientData` labels.
 */
export function ChartAbsent({ label }: { label: string }) {
  return (
    <View style={styles.absent}>
      <Absent label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  unit: { ...text.micro, color: color.muted, marginBottom: space.xs },
  /**
   * Explicit height, set before width is known. The Svg inside appears one
   * frame later; this box does not move when it does.
   */
  frame: { height: PLOT_HEIGHT, width: "100%" },
  readout: { marginTop: space.sm },
  /** `text.stat` is mono and already tabular. Wraps rather than shrinking. */
  readoutValue: { ...text.stat, color: color.ink },
  readoutDay: { ...text.meta, color: color.muted, marginTop: space.xs },
  absent: { minHeight: PLOT_HEIGHT, justifyContent: "center" },
});

export default Plot;
