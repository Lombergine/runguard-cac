/**
 * RunGuard 2.0 on the Stats screen: four panels under the workload chart.
 *
 *  - ThresholdPanel: what the universal 1.5 cutoff picks out of this
 *    athlete's own history, their own percentiles, and which cut points are
 *    in use.
 *  - AuditPanel: the self-audit. How closely the score tracks the last
 *    seven days alone (Impellizzeri et al. 2021), with a bootstrap interval.
 *  - DataCheckPanel: the pre-flight on the training log, with dates.
 *  - GaitPanel: ground contact time and vertical oscillation this week
 *    against the athlete's own four-week baseline, read from Apple Watch
 *    running dynamics in Health, with a two-axis load-vs-drift view. On a
 *    device whose watch writes no dynamics the panel says so and offers a
 *    switch to a SAMPLE DATA set, badged as such.
 *
 * Every number comes from the server's `audit` (website/src/lib/
 * acwrDiagnostics.ts) or from `lib/gait.ts`; nothing here computes a
 * statistic. Advisory language stays advisory (visual-spec #5): the panels
 * describe, they do not instruct, and status colour appears only on the
 * glyph that carries the verdict.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";

import { Press } from "./Press";
import { readRunningDynamics, isAvailable } from "../lib/health";
import {
  GROUND_CONTACT_DRIFT_THRESHOLD,
  VERTICAL_OSCILLATION_DRIFT_THRESHOLD,
  PACE_TOLERANCE,
  analyzeGait,
  pct,
  sampleGaitRuns,
  type GaitAnalysis,
  type GaitDrift,
} from "../lib/gait";
import type { AthleteAudit } from "../lib/types";
import { layout, radius, ruleWidth, space } from "../theme/space";
import { color, shadow, useColors } from "../theme/tokens";
import { text } from "../theme/type";

const f2 = (x: number) => x.toFixed(2);
function ordinal(p: number): string {
  const r = Math.round(p * 10) / 10;
  const n = Math.floor(r) % 100;
  const suffix = n >= 11 && n <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${Number.isInteger(r) ? r : r.toFixed(1)}${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Panel chrome: the Stats screen's information unit, plus a headline
 * figure and an expandable "how this is computed".
 * ------------------------------------------------------------------ */

function Panel({
  title,
  note,
  headline,
  badge,
  children,
  detail,
}: {
  title: string;
  note?: string;
  headline?: string | null;
  badge?: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.panel}>
      {badge ? (
        <View style={styles.badge} accessibilityLabel="Sample data">
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {headline ? <Text style={styles.headline}>{headline}</Text> : note ? <Text style={styles.panelNote}>{note}</Text> : null}
      </View>
      {children}
      {detail ? (
        <>
          {open ? <View style={styles.detail}>{detail}</View> : null}
          <Press
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel={open ? "Hide how this is computed" : "Show how this is computed"}
            style={styles.more}
            pressedStyle={styles.morePressed}
          >
            <Text style={styles.moreLabel}>{open ? "Less" : "How this is computed"}</Text>
          </Press>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Personal threshold
 * ------------------------------------------------------------------ */

export function ThresholdPanel({ audit }: { audit?: AthleteAudit | null }) {
  const t = audit?.threshold;
  const zones = audit?.personalZones ?? null;
  let body: string;
  if (!audit) body = "No training history yet, so there is no distribution to learn a threshold from.";
  else if (!t) body = `A personal threshold needs days that carry a ratio. ${audit.days} days of history so far, none with a ratio yet.`;
  else {
    body = `The universal 1.5 cutoff flags ${pct(t.referenceFlaggedFraction)} of your days — your ${ordinal(t.referencePercentile)} percentile. Your own 95th percentile is ${f2(t.percentiles["95"])}.`;
    body += zones
      ? ` Your own cut points — your 90th at ${f2(zones.caution)} and your 95th at ${f2(zones.high)} — are drawn on the chart above as the violet line, next to the universal 1.5.`
      : ` Your own cut points appear once ${audit.personalZonesMinimumDays} days carry a ratio (${t.n} so far).`;
  }
  return (
    <Panel
      title="Your threshold"
      note="where 1.5 sits in your own history"
      headline={t ? f2(t.percentiles["95"]) : null}
      detail={
        <>
          {t ? (
            <View style={styles.pctRow}>
              {["50", "75", "90", "95", "99"].map((p) => (
                <View key={p} style={styles.pctCell}>
                  <Text style={styles.pctLabel}>{p}th</Text>
                  <Text style={styles.pctValue}>{f2(t.percentiles[p])}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.read}>
            Every running app applies 1.5 to everyone — the same cutoff for a marathoner in a base block and a sprinter in season, taken from Gabbett (2016). RunGuard reports what 1.5 actually picks out of your own history and what cut would flag your hardest 5% of days instead.
          </Text>
          <Text style={styles.caveat}>
            A threshold chosen from your own distribution flags a fixed share of your days by construction, whatever your training was like. It makes the universal number's arbitrariness visible; it is not a validated predictor of injury. Gabbett, T. J. (2016), BJSM 50(5), 273–280.
          </Text>
        </>
      }
    >
      <Text style={styles.lede}>{body}</Text>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Self-audit
 * ------------------------------------------------------------------ */

export function AuditPanel({ audit }: { audit?: AthleteAudit | null }) {
  const r = audit?.rescaling;
  const enough = (audit?.usableDays ?? 0) >= (audit?.personalZonesMinimumDays ?? 60);
  let body: string;
  if (!audit) body = "No training history yet, so there is nothing to audit.";
  else if (!r) body = `The audit needs days that carry a ratio. ${audit.usableDays} so far; it unlocks at ${audit.personalZonesMinimumDays}.`;
  else if (!enough) body = `The audit unlocks at ${audit.personalZonesMinimumDays} days with a ratio; you have ${r.n}. Below that the number moves too much to mean anything.`;
  else {
    const ci = r.ciLow == null || Number.isNaN(r.ciLow) ? "" : ` (CI ${f2(r.ciLow)} to ${f2(r.ciHigh)})`;
    const verdict =
      r.spearman >= 0.9
        ? "Above 0.9 the score is mostly repeating your weekly mileage."
        : r.spearman >= 0.7
          ? "Most of this score's movement is your last 7 days; the 4-week baseline adds some."
          : "Below 0.7 the 4-week baseline is doing real work in this score.";
    body = `This score tracks your last 7 days at ρ = ${f2(r.spearman)}${ci}. ${verdict}`;
  }
  return (
    <Panel
      title="Self-audit"
      note="how much of the score is just mileage"
      headline={r && enough ? `ρ ${f2(r.spearman)}` : null}
      detail={
        <>
          <Text style={styles.read}>
            The ratio is acute load divided by chronic load. If the chronic denominator barely changes the ordering of days, the ratio is a rescaled copy of its own numerator and the 4-week baseline is doing no work. Impellizzeri and colleagues showed in 2021 that replacing the denominator with noise left the ratio's link to injury about the same. This runs the label-free version of that test on your own data: the Spearman rank correlation between the score and your last 7 days alone.
          </Text>
          {r ? (
            <Text style={styles.caveat}>
              n = {r.n} days with a ratio, {r.draws} bootstrap resamples with a fixed seed, so it is the same every time. Impellizzeri et al. (2021). Sports Medicine, 51(3), 581–592.
            </Text>
          ) : null}
        </>
      }
    >
      <Text style={styles.lede}>{body}</Text>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Data check
 * ------------------------------------------------------------------ */

export function DataCheckPanel({ audit }: { audit?: AthleteAudit | null }) {
  if (!audit) return null;
  const q = audit.quality;
  const shown = q.findings.filter((f) => f.severity !== "note");
  if (!shown.length) return null;
  return (
    <Panel
      title={q.ok ? "Data check" : "Not enough history"}
      note={`${q.nDays} days · ${q.nTrainingDays} with a run`}
      detail={
        <Text style={styles.caveat}>
          Checks: history shorter than the 28-day window, no training, outlier days (over 3× your 95th-percentile day — the watch left running), breaks of 10+ zero days (the ratio after a break is dominated by the break), and suspected unit changes. Nothing is corrected automatically; whether a gap was rest or an unsynced watch is your call.
        </Text>
      }
    >
      {shown.map((f, i) => (
        <View key={i} style={styles.finding}>
          <Text style={[styles.findingMark, { color: f.severity === "error" ? color.unusualText : color.watchText }]}>
            {f.severity === "error" ? "✕" : "!"}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.lede}>{f.message}</Text>
            {f.dates.length ? <Text style={styles.dates}>{f.dates.join(" · ")}</Text> : null}
          </View>
        </View>
      ))}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Gait channel
 * ------------------------------------------------------------------ */

export function GaitPanel({ acwr, caution }: { acwr: number | null; caution: number }) {
  const [health, setHealth] = useState<GaitAnalysis | null>(null);
  const [sample, setSample] = useState(false);
  const hex = useColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== "ios" || !isAvailable()) {
        if (!cancelled) setHealth({ kind: "noDynamics" });
        return;
      }
      try {
        const runs = await readRunningDynamics();
        if (!cancelled) setHealth(analyzeGait(runs));
      } catch {
        if (!cancelled) setHealth({ kind: "noDynamics" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const analysis: GaitAnalysis | null = sample ? analyzeGait(sampleGaitRuns()) : health;
  const showSwitch = sample || health?.kind === "noDynamics";
  const d = analysis?.kind === "analyzed" ? analysis.drift : null;

  const describe = (v: number, threshold: number) =>
    v > threshold ? `up ${pct(v)}` : v < -threshold ? `down ${pct(-v)}` : `steady (${v >= 0 ? "+" : ""}${pct(v)})`;

  let body: string;
  if (!analysis) body = "Reading running dynamics from Health…";
  else if (analysis.kind === "noDynamics")
    body = "No running-dynamics samples in Apple Health. Garmin and most third-party watches sync distance and heart rate but not gait metrics; Apple Watch Series 7 or later on watchOS 9+ records them on every outdoor run. Switch on sample data to see what the channel shows.";
  else if (analysis.kind === "insufficientBaseline")
    body = `A baseline needs ${analysis.needed} runs with dynamics in the four weeks before this one; found ${analysis.runs}.`;
  else if (analysis.kind === "noRecentRuns") body = "A baseline exists, but no run with dynamics in the last 7 days to compare against it.";
  else {
    const parts: string[] = [];
    if (d!.recentGroundContactMs !== null && d!.baselineGroundContactMs !== null && d!.groundContactDrift !== null)
      parts.push(`Ground contact ${Math.round(d!.recentGroundContactMs)} ms, ${describe(d!.groundContactDrift, GROUND_CONTACT_DRIFT_THRESHOLD)} vs. your 4-week baseline of ${Math.round(d!.baselineGroundContactMs)} ms.`);
    if (d!.recentVerticalOscillationCm !== null && d!.baselineVerticalOscillationCm !== null && d!.verticalOscillationDrift !== null)
      parts.push(`Vertical oscillation ${d!.recentVerticalOscillationCm.toFixed(1)} cm, ${describe(d!.verticalOscillationDrift, VERTICAL_OSCILLATION_DRIFT_THRESHOLD)} vs. ${d!.baselineVerticalOscillationCm.toFixed(1)} cm.`);
    if (d!.speedChange !== null)
      parts.push(`Pace ${Math.abs(d!.speedChange) <= PACE_TOLERANCE ? "unchanged" : d!.speedChange > 0 ? `${pct(d!.speedChange)} faster` : `${pct(-d!.speedChange)} slower`}.`);
    body = parts.join(" ");
  }

  const title = d ? (d.flagsMechanicalDrift ? "Mechanical drift" : "Gait steady") : "Gait";
  const headline = d?.groundContactDrift != null ? `${d.groundContactDrift >= 0 ? "+" : ""}${pct(d.groundContactDrift)}` : null;

  return (
    <Panel
      title={title}
      note="contact time and bounce vs. your baseline"
      headline={headline}
      badge={sample ? "SAMPLE DATA" : undefined}
      detail={
        <>
          {d ? <Quadrant acwr={acwr} caution={caution} drift={d} hex={hex} /> : null}
          {d ? (
            <View style={styles.table}>
              {[
                ["", "Baseline", "This week", "Change"],
                ["Contact", d.baselineGroundContactMs !== null ? `${Math.round(d.baselineGroundContactMs)} ms` : "—", d.recentGroundContactMs !== null ? `${Math.round(d.recentGroundContactMs)} ms` : "—", d.groundContactDrift !== null ? `${d.groundContactDrift >= 0 ? "+" : ""}${pct(d.groundContactDrift)}` : "—"],
                ["Bounce", d.baselineVerticalOscillationCm !== null ? `${d.baselineVerticalOscillationCm.toFixed(1)} cm` : "—", d.recentVerticalOscillationCm !== null ? `${d.recentVerticalOscillationCm.toFixed(1)} cm` : "—", d.verticalOscillationDrift !== null ? `${d.verticalOscillationDrift >= 0 ? "+" : ""}${pct(d.verticalOscillationDrift)}` : "—"],
                ["Speed", d.baselineSpeed !== null ? `${d.baselineSpeed.toFixed(2)} m/s` : "—", d.recentSpeed !== null ? `${d.recentSpeed.toFixed(2)} m/s` : "—", d.speedChange !== null ? `${d.speedChange >= 0 ? "+" : ""}${pct(d.speedChange)}` : "—"],
                ["Runs", String(d.baselineRuns), String(d.recentRuns), ""],
              ].map((row, i) => (
                <View key={i} style={styles.tableRow}>
                  {row.map((cell, j) => (
                    <Text key={j} style={[styles.tableCell, i === 0 && styles.tableHead, j === 0 && styles.tableLabel]}>
                      {cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.read}>
            Load alone is yesterday's model. The gait channel compares this week's mean ground contact time and vertical oscillation, read per run from Apple Watch running dynamics in Health, against the median of the four weeks before it. It flags mechanical drift when contact time rises more than 5% or oscillation more than 8% without a pace increase that would explain it. The baseline window ends before this week begins, so a drifting week cannot pull its own baseline toward itself.
          </Text>
          <Text style={styles.caveat}>
            These thresholds are heuristics chosen for this app, not clinically validated cut points. A flag is a reason to pay attention, not a diagnosis.
          </Text>
          {sample ? (
            <Text style={[styles.caveat, { color: color.watchText }]}>
              Sample data: six generated weeks of runs, four a week, with a contact-time rise of about 7% in the final week at unchanged pace. Shown because this device's Health store has no running-dynamics samples.
            </Text>
          ) : null}
        </>
      }
    >
      <Text style={styles.lede}>{body}</Text>
      {showSwitch ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show sample data</Text>
          <Switch
            value={sample}
            onValueChange={setSample}
            accessibilityLabel="Show sample gait data"
            trackColor={{ true: hex.watch, false: hex.ruleStrong }}
          />
        </View>
      ) : null}
    </Panel>
  );
}

/**
 * Load on one axis, mechanical drift on the other. The vertical line is the
 * caution cut point in use; the horizontal is the 5% contact-time threshold.
 * Four self-describing corner labels; the dot is this week.
 */
function Quadrant({ acwr, caution, drift, hex }: { acwr: number | null; caution: number; drift: GaitDrift; hex: ReturnType<typeof useColors> }) {
  const W = 300;
  const H = 170;
  const unit = (v: number, lo: number, hi: number) => Math.min(Math.max((v - lo) / (hi - lo), 0.04), 0.96);
  const xCut = W * unit(caution, 0.5, 2.0);
  const yCut = H * (1 - unit(GROUND_CONTACT_DRIFT_THRESHOLD, -0.06, 0.12));
  const g = drift.groundContactDrift;
  const loadUp = acwr !== null && acwr >= caution;
  const gaitUp = g !== null && g > GROUND_CONTACT_DRIFT_THRESHOLD;
  const dot = loadUp && gaitUp ? hex.unusual : !loadUp && !gaitUp ? hex.ok : hex.watch;
  const label = (t: string, x: number, y: number, anchor: "start" | "end") => (
    <SvgText x={x} y={y} fontSize={11} fill={hex.muted} textAnchor={anchor}>
      {t}
    </SvgText>
  );
  return (
    <View style={styles.quadrant} accessibilityLabel={`This week: ratio ${acwr !== null ? f2(acwr) : "unknown"}, contact time ${g !== null ? pct(g) : "unknown"}`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Rect x={0} y={0} width={W} height={H} rx={8} fill={hex.well} />
        <Line x1={xCut} x2={xCut} y1={0} y2={H} stroke={hex.ruleStrong} strokeDasharray="4 3" />
        <Line x1={0} x2={W} y1={yCut} y2={yCut} stroke={hex.ruleStrong} strokeDasharray="4 3" />
        {label("Load fine · gait drifting", 10, 16, "start")}
        {label("Load up · gait drifting", W - 10, 16, "end")}
        {label("Load fine · gait steady", 10, H - 8, "start")}
        {label("Load up · gait steady", W - 10, H - 8, "end")}
        {acwr !== null && g !== null ? (
          <Circle cx={W * unit(acwr, 0.5, 2.0)} cy={H * (1 - unit(g, -0.06, 0.12))} r={7} fill={dot} stroke={hex.card} strokeWidth={2} />
        ) : null}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * All four, in order.
 * ------------------------------------------------------------------ */

export function InsightPanels({ audit, acwr }: { audit?: AthleteAudit | null; acwr: number | null }) {
  const caution = audit?.personalZones?.caution ?? 1.3;
  return (
    <>
      <ThresholdPanel audit={audit} />
      <AuditPanel audit={audit} />
      <GaitPanel acwr={acwr} caution={caution} />
      <DataCheckPanel audit={audit} />
    </>
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
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.md,
  },
  panelTitle: { ...text.baseSemi, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },
  headline: { ...text.stat, color: color.brandText },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: color.watch,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginBottom: space.sm,
  },
  badgeText: { ...text.micro, color: color.onBrand },
  lede: { ...text.meta, color: color.ink2 },
  read: { ...text.meta, color: color.ink2, marginTop: space.md },
  caveat: { ...text.meta, color: color.muted, marginTop: space.sm },
  detail: { marginTop: space.xs },
  more: { alignSelf: "flex-start", paddingVertical: space.sm, marginTop: space.xs },
  morePressed: { opacity: 0.6 },
  moreLabel: { ...text.baseSemi, color: color.brandText },
  pctRow: { flexDirection: "row", justifyContent: "space-between", marginTop: space.md },
  pctCell: { alignItems: "center" },
  pctLabel: { ...text.micro, color: color.muted },
  pctValue: { ...text.base, color: color.ink, fontVariant: ["tabular-nums"] },
  finding: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  findingMark: { ...text.baseSemi, width: 16, textAlign: "center" },
  dates: { ...text.micro, color: color.muted, marginTop: 2, textTransform: "none" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md },
  switchLabel: { ...text.base, color: color.ink2 },
  quadrant: { marginTop: space.md },
  table: { marginTop: space.md },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  tableCell: { ...text.meta, color: color.ink2, flex: 1, fontVariant: ["tabular-nums"] },
  tableHead: { color: color.muted },
  tableLabel: { color: color.muted },
});
