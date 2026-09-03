/**
 * A within-run trace: heart rate or elevation against elapsed time.
 *
 * ── WHY THIS IS NOT ONE OF THE `charts/` COMPONENTS ────────────────────────
 * Every chart in `components/charts/` plots one point per DAY against a
 * calendar axis, and they all route through `chartData.densify`, whose job is
 * to turn a missing day into an explicit absent so a line never closes over a
 * gap. None of that applies inside a single run: the x axis is elapsed
 * seconds, samples arrive every few seconds rather than daily, and there is no
 * "missing Tuesday" to render as unknown. Forcing this through that machinery
 * would mean teaching it a second notion of time.
 *
 * ── WHAT IT STILL BORROWS ──────────────────────────────────────────────────
 * The panel, the axis labels, the mono numerals and the rule weights are the
 * same tokens as everything else, so it reads as the same family. The line
 * colour is passed in because these two traces are the one place in the app
 * where a hue is carrying a MEANING a coach already knows from every other
 * running app — red for heart rate, green for elevation — and inventing an
 * ember version of that would be a worse kind of consistency.
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ColorValue } from "react-native";
import Svg, { Path, Line as SvgLine } from "react-native-svg";

import { color, shadow } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

const HEIGHT = 140;
/** Room for the y labels, which are drawn as text outside the plot. */
const PAD_LEFT = 38;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

export type StreamPoint = { tS: number; value: number };

/** Seconds → "47:50", or "1:12:30" past the hour. Matches lib/units. */
function clock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function StreamChart({
  title,
  note,
  points,
  stroke,
  unit,
  width,
}: {
  title: string;
  note?: string;
  points: StreamPoint[];
  stroke: ColorValue;
  unit: string;
  /** Measured by the caller — RN has no intrinsic width inside a padded card. */
  width: number;
}) {
  const plot = useMemo(() => {
    if (points.length < 2 || width <= 0) return null;
    const xs = points.map((p) => p.tS);
    const ys = points.map((p) => p.value);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    // A flat trace has no range to scale against; give it one so the line sits
    // mid-plot rather than dividing by zero into NaN.
    if (y1 - y0 < 1) {
      y0 -= 1;
      y1 += 1;
    }
    const w = width - PAD_LEFT - PAD_RIGHT;
    const h = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const sx = (t: number) => PAD_LEFT + ((t - x0) / Math.max(1, x1 - x0)) * w;
    const sy = (v: number) => PAD_TOP + h - ((v - y0) / (y1 - y0)) * h;
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.tS).toFixed(1)} ${sy(p.value).toFixed(1)}`)
      .join(" ");
    // The same trace closed down to the plot floor, for the tint beneath the
    // line. Decoration for the eye's benefit only; the line is the data.
    const floor = (PAD_TOP + h).toFixed(1);
    const area = `${d} L${sx(x1).toFixed(1)} ${floor} L${sx(x0).toFixed(1)} ${floor} Z`;
    // Four gridlines, labelled with the real values rather than round numbers,
    // so the top line is the actual maximum the athlete reached.
    const ticks = [0, 0.5, 1].map((f) => ({
      v: Math.round(y0 + (y1 - y0) * f),
      y: PAD_TOP + h - f * h,
    }));
    return { d, area, ticks, x0, x1 };
  }, [points, width]);

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>

      {plot === null ? (
        // Fewer than two samples is not a flat line, it is no line. Dashed,
        // like every other unknown in this app.
        <View style={styles.absent}>
          <Text style={styles.absentDash}>—</Text>
          <Text style={styles.absentLabel}>Not recorded for this run</Text>
        </View>
      ) : (
        <>
          <Svg width={width} height={HEIGHT}>
            {plot.ticks.map((t) => (
              <SvgLine
                key={t.v}
                x1={PAD_LEFT}
                y1={t.y}
                x2={width - PAD_RIGHT}
                y2={t.y}
                stroke={color.grid}
                strokeWidth={ruleWidth}
              />
            ))}
            <Path d={plot.area} fill={stroke} fillOpacity={0.16} />
            <Path d={plot.d} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" />
          </Svg>

          <View style={styles.yLabels} pointerEvents="none">
            {plot.ticks.map((t) => (
              <Text key={t.v} style={[styles.yAxis, { top: t.y - 7 }]}>
                {t.v}
              </Text>
            ))}
          </View>

          <View style={styles.xLabels}>
            <Text style={styles.axis}>{clock(plot.x0)}</Text>
            <Text style={styles.axis}>{clock(plot.x1)}</Text>
          </View>
          <Text style={styles.unit}>{unit}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { ...text.baseSemi, color: color.ink, flexShrink: 1 },
  note: { ...text.meta, color: color.muted, flexShrink: 0 },

  yLabels: { position: "absolute", left: layout.cardPadding, top: 48, width: PAD_LEFT - 6 },
  xLabels: { flexDirection: "row", justifyContent: "space-between", marginLeft: PAD_LEFT },
  axis: { ...text.micro, ...tabular, fontFamily: font.mono, color: color.muted },
  /** Absolutely placed against the plot, so each label sits on its own line. */
  yAxis: {
    ...text.micro,
    ...tabular,
    fontFamily: font.mono,
    color: color.muted,
    position: "absolute",
    right: 0,
    textAlign: "right",
  },
  unit: { ...text.micro, color: color.muted, marginTop: space.xs },

  absent: {
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    backgroundColor: color.well,
    borderRadius: radius.control,
    padding: layout.cardPadding,
  },
  absentDash: { ...text.stat, color: color.unknown },
  absentLabel: { ...text.meta, color: color.ink2, marginTop: space.xs },
});

export default StreamChart;
