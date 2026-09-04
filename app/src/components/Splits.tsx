/**
 * Mile splits, as a table with a pace bar per row.
 *
 * The port of the deployed activity page's splits panel: `MI · PACE · bar ·
 * HR · ELEV`, one row per mile, with the fastest full mile picked out.
 *
 * ── THE BAR IS INVERTED, AND THAT IS THE WHOLE POINT ───────────────────────
 * Pace is a time, so a SMALLER number is better — the opposite of every other
 * bar in this app, where longer means more. Drawing seconds directly would put
 * the longest bar on the slowest mile and read as "best". So the bar length is
 * the mile's pace measured DOWN from the slowest mile in the run, which makes
 * the longest bar the fastest mile and matches what the website draws.
 *
 * ── THE PARTIAL MILE IS NOT COMPARED ───────────────────────────────────────
 * A final 0.54 of a mile has a pace, but its bar would be scaled against full
 * miles and its label would read as a mile it is not. It renders with its
 * fraction as the label, and it is excluded from the fastest-mile check — a
 * 200m sprint finish is not a mile PR.
 */
import { StyleSheet, Text, View } from "react-native";

import { color, shadow } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

export type Split = {
  mi: number;
  /** 1 for a full mile, <1 for the final partial one. */
  partial: number;
  seconds: number;
  avg_hr: number | null;
  elev_delta_m: number | null;
};

const METRES_PER_FOOT = 0.3048;

/** Seconds → "8:37". Pace is always mm:ss, never a bare number of seconds. */
function pace(seconds: number, partial: number): string {
  // A partial mile's seconds cover only that fraction, so the per-mile rate is
  // what gets shown — otherwise the last row looks impossibly fast.
  const perMile = partial > 0 && partial < 1 ? seconds / partial : seconds;
  const m = Math.floor(perMile / 60);
  const s = Math.round(perMile % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Splits({ splits }: { splits: Split[] }) {
  if (splits.length === 0) return null;

  const full = splits.filter((s) => s.partial >= 1);
  // Slowest full mile anchors the bar; with one mile there is nothing to
  // compare against, so every bar is full rather than zero-length.
  const slowest = full.length > 0 ? Math.max(...full.map((s) => s.seconds)) : 0;
  const fastest = full.length > 1 ? Math.min(...full.map((s) => s.seconds)) : null;

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.title}>Mile splits</Text>
        <Text style={styles.note}>{splits.length} recorded</Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.h, styles.colMi]}>MI</Text>
        <Text style={[styles.h, styles.colPace]}>PACE</Text>
        <View style={styles.colBar} />
        <Text style={[styles.h, styles.colHr]}>HR</Text>
        <Text style={[styles.h, styles.colElev]}>ELEV</Text>
      </View>

      {splits.map((s, i) => {
        const isFastest = fastest !== null && s.partial >= 1 && s.seconds === fastest;
        // Inverted: the fastest mile gets the longest bar. Floored at 12% so a
        // slow mile is still a visible bar rather than an empty row.
        const frac =
          slowest > 0 && s.partial >= 1
            ? Math.max(0.12, 1 - (s.seconds - (fastest ?? s.seconds)) / slowest)
            : 0.5;
        const elevFt =
          s.elev_delta_m === null ? null : Math.round(s.elev_delta_m / METRES_PER_FOOT);
        return (
          <View key={`${s.mi}-${i}`} style={styles.row}>
            <Text style={[styles.cell, styles.colMi]}>
              {s.partial >= 1 ? s.mi : `.${String(Math.round(s.partial * 100)).padStart(2, "0")}`}
            </Text>
            <Text style={[styles.cell, styles.colPace, isFastest && styles.fastest]}>
              {pace(s.seconds, s.partial)}
            </Text>
            <View style={styles.colBar}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.round(frac * 100)}%` },
                    isFastest && styles.fillFastest,
                  ]}
                />
              </View>
            </View>
            {/* A missing HR is a dash, never a 0 — a 0 bpm mile is not a fact. */}
            <Text style={[styles.cell, styles.colHr]}>{s.avg_hr === null ? "—" : s.avg_hr}</Text>
            <Text style={[styles.cell, styles.colElev]}>
              {elevFt === null ? "—" : `${elevFt > 0 ? "+" : ""}${elevFt}`}
            </Text>
          </View>
        );
      })}

      {fastest !== null ? (
        <Text style={styles.foot}>Fastest full mile picked out. Longer bar = faster.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  title: { ...text.baseSemi, color: color.ink, flexShrink: 1 },
  note: { ...text.meta, color: color.muted, flexShrink: 0 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
  },
  h: { ...text.micro, color: color.muted },
  cell: { ...text.meta, fontFamily: font.mono, color: color.ink, ...tabular },
  colMi: { width: 26 },
  colPace: { width: 46 },
  colBar: { flex: 1 },
  colHr: { width: 34, textAlign: "right" },
  colElev: { width: 40, textAlign: "right" },

  track: { height: 8, borderRadius: 4, backgroundColor: color.well, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.ruleStrong },
  /* The one colour on this panel, on the one row that earned it. */
  fillFastest: { backgroundColor: color.brandStrong },
  fastest: { color: color.brandText },

  foot: { ...text.meta, color: color.muted, marginTop: space.md },
});

export default Splits;
