/**
 * RunGuard 2.0 on the Stats screen: four panels under the workload chart.
 *
 *  - ThresholdPanel: what the universal 1.5 cutoff picks out of this
 *    athlete's own history, and their own cut points.
 *  - AuditPanel: the self-audit. How closely the score tracks the last
 *    seven days alone (Impellizzeri et al. 2021), with a bootstrap interval.
 *  - GaitPanel: ground contact time and vertical oscillation this week
 *    against the athlete's own four-week baseline, from Apple Watch running
 *    dynamics in Health. On a device whose watch writes no dynamics the panel
 *    says so, points at the camera check, and offers a SAMPLE DATA set,
 *    badged as such.
 *  - DataCheckPanel: the pre-flight on the training log, with dates.
 *
 * Shape of every panel, in the Run card's own grammar: a title, a row of
 * figures (label over a mono value), at most one sentence, and a "Details"
 * disclosure holding the method. The figures carry the reading; the prose
 * does not repeat them.
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
import { useRouter } from "expo-router";
import { Platform, StyleSheet, Switch, Text, View, type ColorValue } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";

import { Press } from "./Press";
import { ExplainCard } from "./ExplainCard";
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
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${pct(Math.abs(v))}`;

/* ------------------------------------------------------------------ *
 * Panel chrome
 * ------------------------------------------------------------------ */

type Figure = { label: string; value: string | null; caption?: string; tone?: ColorValue };

function Figures({ figures }: { figures: Figure[] }) {
  return (
    <View style={styles.figures}>
      {figures.map((f, i) => (
        <View key={f.label} style={[styles.figure, i > 0 && styles.figureRule]}>
          <Text style={styles.figureLabel} numberOfLines={1}>
            {f.label}
          </Text>
          <Text style={[styles.figureValue, f.value === null && styles.figureAbsent, f.tone ? { color: f.tone } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {f.value ?? "—"}
          </Text>
          {f.caption ? (
            <Text style={styles.figureCaption} numberOfLines={1}>
              {f.caption}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Panel({
  title,
  note,
  badge,
  figures,
  children,
  detail,
  initiallyOpen = false,
}: {
  title: string;
  note?: string;
  badge?: string;
  figures?: Figure[];
  children?: React.ReactNode;
  detail?: React.ReactNode;
  /** Deep links (`?expand=`) can open the details on arrival. */
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => {
    if (!initiallyOpen) return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [initiallyOpen]);
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {badge ? (
          <View style={styles.badge} accessibilityLabel="Sample data">
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : note ? (
          <Text style={styles.panelNote}>{note}</Text>
        ) : null}
      </View>
      {figures ? <Figures figures={figures} /> : null}
      {children}
      {detail ? (
        <>
          {open ? <View style={styles.detail}>{detail}</View> : null}
          <Press
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? "Hide details" : "Show details"}
            style={styles.more}
            pressedStyle={styles.morePressed}
          >
            <Text style={styles.moreLabel}>{open ? "Hide details" : "Details"}</Text>
          </Press>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Personal threshold
 * ------------------------------------------------------------------ */

export function ThresholdPanel({ audit, open = false }: { audit?: AthleteAudit | null; open?: boolean }) {
  const t = audit?.threshold;
  const zones = audit?.personalZones ?? null;
  if (!audit || !t) {
    return (
      <Panel title="Your threshold" note="where 1.5 sits in your history">
        <Text style={styles.lede}>{!audit ? "No training history yet." : `Needs days with a ratio. ${audit.days} days of history so far, none with a ratio yet.`}</Text>
      </Panel>
    );
  }
  const figures: Figure[] = [
    { label: "Universal", value: "1.50", caption: `flags ${pct(t.referenceFlaggedFraction)}` },
    { label: "Your 95th", value: f2(t.percentiles["95"]), caption: zones ? "on the chart" : "hardest 5%" },
  ];
  if (zones) figures.push({ label: "Your 90th", value: f2(zones.caution), caption: "caution" });
  return (
    <Panel
      title="Your threshold"
      note="where 1.5 sits in your history"
      figures={figures}
      initiallyOpen={open}
      detail={
        <>
          <View style={styles.pctRow}>
            {["50", "75", "90", "95", "99"].map((p) => (
              <View key={p} style={styles.pctCell}>
                <Text style={styles.pctLabel}>{p}th</Text>
                <Text style={styles.pctValue}>{f2(t.percentiles[p])}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.read}>
            Every running app applies the same 1.5 cutoff to everyone (Gabbett, 2016). This panel reports what 1.5 picks out of your own year, and the cut that would flag your hardest 5% of days instead. A cut from your own history flags a fixed share of days by construction; it shows how arbitrary the universal number is, and is not a validated predictor of injury.
          </Text>
        </>
      }
    >
      {!zones ? <Text style={styles.lede}>Your own lines on the chart appear after {audit.personalZonesMinimumDays} days with a ratio ({t.n} so far).</Text> : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Self-audit
 * ------------------------------------------------------------------ */

export function AuditPanel({ audit, open = false }: { audit?: AthleteAudit | null; open?: boolean }) {
  const r = audit?.rescaling;
  const enough = (audit?.usableDays ?? 0) >= (audit?.personalZonesMinimumDays ?? 60);
  if (!audit || !r || !enough) {
    const line = !audit
      ? "No training history yet."
      : !r
        ? `Needs ${audit.personalZonesMinimumDays} days with a ratio. ${audit.usableDays} so far.`
        : `Unlocks at ${audit.personalZonesMinimumDays} days with a ratio. ${r.n} so far.`;
    return (
      <Panel title="Self-audit" note="how much of the score is just mileage">
        <Text style={styles.lede}>{line}</Text>
      </Panel>
    );
  }
  const ci = r.ciLow == null || Number.isNaN(r.ciLow) ? undefined : `${f2(r.ciLow)} to ${f2(r.ciHigh)}`;
  const verdict =
    r.spearman >= 0.9
      ? "Above 0.9, the score is your weekly mileage on a different scale."
      : r.spearman >= 0.7
        ? "Between 0.7 and 0.9, most of the score is your last 7 days."
        : "Below 0.7, the 4-week baseline is doing real work in your score.";
  return (
    <Panel
      title="Self-audit"
      note="how much of the score is just mileage"
      initiallyOpen={open}
      figures={[
        { label: "Tracks last 7 days", value: `ρ ${f2(r.spearman)}`, caption: ci },
        { label: "Days rated", value: String(r.n) },
      ]}
      detail={
        <Text style={styles.read}>
          The ratio is acute load over chronic load. If the 4-week denominator barely changes the order of days, the ratio is a rescaled copy of its own numerator. Impellizzeri and colleagues showed in 2021 that replacing the denominator with noise left the ratio&rsquo;s link to injury about the same. This is the label-free version of that test on your own data: the Spearman rank correlation between the score and your last 7 days alone, with a seeded {r.draws}-resample bootstrap interval. Sports Medicine, 51(3), 581 to 592.
        </Text>
      }
    >
      <Text style={styles.lede}>{verdict}</Text>
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
        <Text style={styles.read}>
          Checks for history shorter than the 28-day window, no training, outlier days over 3 times your 95th-percentile day, breaks of 10 or more zero days, and suspected unit changes. Nothing is corrected automatically. Whether a gap was rest or an unsynced watch is your call.
        </Text>
      }
    >
      {shown.map((f, i) => (
        <View key={i} style={styles.finding}>
          <Text style={[styles.findingMark, { color: f.severity === "error" ? color.unusualText : color.watchText }]}>{f.severity === "error" ? "✕" : "!"}</Text>
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

export function GaitPanel({ acwr, caution, onAnalysis }: { acwr: number | null; caution: number; onAnalysis?: (a: GaitAnalysis | null, isSample: boolean) => void }) {
  const router = useRouter();
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
  useEffect(() => {
    onAnalysis?.(analysis, sample);
    // The callback identity is the parent's concern; re-reporting on every
    // render would loop a parent that stores the value in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.kind, sample, analysis?.kind === "analyzed" ? analysis.drift.groundContactDrift : null]);
  const showSwitch = sample || health?.kind === "noDynamics";
  const d = analysis?.kind === "analyzed" ? analysis.drift : null;

  let line: string | null = null;
  if (!analysis) line = "Reading running dynamics from Health…";
  else if (analysis.kind === "noDynamics") line = "No running dynamics in Health. Apple Watch records them on outdoor runs; Garmin and most other watches do not sync them.";
  else if (analysis.kind === "insufficientBaseline") line = `A baseline needs ${analysis.needed} runs with dynamics in the four weeks before this one. Found ${analysis.runs}.`;
  else if (analysis.kind === "noRecentRuns") line = "No run with dynamics in the last 7 days to compare against your baseline.";
  else if (d!.flagsMechanicalDrift) line = "Contact time is up this week without a pace change that explains it. Worth a look, not a diagnosis.";

  const figures: Figure[] | undefined = d
    ? [
        {
          label: "Contact",
          value: d.recentGroundContactMs !== null ? `${Math.round(d.recentGroundContactMs)} ms` : null,
          caption: d.groundContactDrift !== null ? `${signed(d.groundContactDrift)} vs. baseline` : undefined,
          tone: d.groundContactDrift !== null && d.groundContactDrift > GROUND_CONTACT_DRIFT_THRESHOLD ? color.watchText : undefined,
        },
        {
          label: "Bounce",
          value: d.recentVerticalOscillationCm !== null ? `${d.recentVerticalOscillationCm.toFixed(1)} cm` : null,
          caption: d.verticalOscillationDrift !== null ? `${signed(d.verticalOscillationDrift)} vs. baseline` : undefined,
          tone: d.verticalOscillationDrift !== null && d.verticalOscillationDrift > VERTICAL_OSCILLATION_DRIFT_THRESHOLD ? color.watchText : undefined,
        },
        {
          label: "Pace",
          value: d.speedChange !== null ? (Math.abs(d.speedChange) <= PACE_TOLERANCE ? "same" : signed(d.speedChange)) : null,
          caption: d.speedChange !== null ? "vs. baseline" : undefined,
        },
      ]
    : undefined;

  return (
    <Panel
      title={d ? (d.flagsMechanicalDrift ? "Gait drifting" : "Gait steady") : "Gait"}
      note="this week vs. your 4-week baseline"
      badge={sample ? "SAMPLE DATA" : undefined}
      figures={figures}
      detail={
        <>
          {d ? <Quadrant acwr={acwr} caution={caution} drift={d} hex={hex} /> : null}
          {d ? (
            <Text style={styles.read}>
              Baseline: {d.baselineRuns} runs, {d.baselineGroundContactMs !== null ? `${Math.round(d.baselineGroundContactMs)} ms` : "—"} contact, {d.baselineVerticalOscillationCm !== null ? `${d.baselineVerticalOscillationCm.toFixed(1)} cm` : "—"} bounce. This week: {d.recentRuns} run{d.recentRuns === 1 ? "" : "s"}.
            </Text>
          ) : null}
          <Text style={styles.read}>
            Compares this week&rsquo;s mean ground contact time and vertical oscillation, read per run from Apple Watch running dynamics, against the median of the four weeks before it. Flags drift when contact time rises more than 5% or oscillation more than 8% without a pace increase that would explain it. The baseline ends before this week begins, so a drifting week cannot pull its own baseline toward itself. The thresholds are heuristics chosen for this app, not clinical cut points.
          </Text>
          {sample ? <Text style={[styles.read, { color: color.watchText }]}>Sample data: six generated weeks of runs with a contact-time rise of about 7% in the final week at unchanged pace.</Text> : null}
        </>
      }
    >
      {line ? <Text style={styles.lede}>{line}</Text> : null}
      <Press onPress={() => router.push("/gait-check")} accessibilityRole="button" accessibilityLabel="Check your gait with the camera" style={styles.linkRow} pressedStyle={styles.morePressed}>
        <Text style={styles.linkLabel}>Check your gait with the camera</Text>
        <Text style={styles.linkChevron}>{"›"}</Text>
      </Press>
      {showSwitch ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show sample data</Text>
          <Switch value={sample} onValueChange={setSample} accessibilityLabel="Show sample gait data" trackColor={{ true: hex.watch, false: hex.ruleStrong }} />
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
        {acwr !== null && g !== null ? <Circle cx={W * unit(acwr, 0.5, 2.0)} cy={H * (1 - unit(g, -0.06, 0.12))} r={7} fill={dot} stroke={hex.card} strokeWidth={2} /> : null}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * All four, in order.
 * ------------------------------------------------------------------ */

export function InsightPanels({
  audit,
  acwr,
  expand = [],
  autoExplain = false,
  onPanelLayout,
}: {
  audit?: AthleteAudit | null;
  acwr: number | null;
  expand?: string[];
  autoExplain?: boolean;
  /** Each panel's y within this block, for deep-link anchors. */
  onPanelLayout?: (key: "threshold" | "audit" | "gait" | "datacheck" | "explain", y: number) => void;
}) {
  const anchor = (key: "threshold" | "audit" | "gait" | "datacheck" | "explain") => ({ onLayout: (e: { nativeEvent: { layout: { y: number } } }) => onPanelLayout?.(key, e.nativeEvent.layout.y) });
  const caution = audit?.personalZones?.caution ?? 1.3;
  // Gait drift from the phone, handed to the explanation as two bounded
  // percentages. Only real Health data goes to the server; the sample set
  // explains nothing about this athlete.
  const [gait, setGait] = useState<{ gctDriftPct: number | null; voDriftPct: number | null } | null>(null);
  return (
    <>
      <View {...anchor("threshold")}>
        <ThresholdPanel audit={audit} open={expand.includes("threshold")} />
      </View>
      <View {...anchor("audit")}>
        <AuditPanel audit={audit} open={expand.includes("audit")} />
      </View>
      <View {...anchor("gait")}>
      <GaitPanel
        acwr={acwr}
        caution={caution}
        onAnalysis={(a, isSample) =>
          setGait(
            !isSample && a?.kind === "analyzed"
              ? {
                  gctDriftPct: a.drift.groundContactDrift === null ? null : Math.round(a.drift.groundContactDrift * 1000) / 10,
                  voDriftPct: a.drift.verticalOscillationDrift === null ? null : Math.round(a.drift.verticalOscillationDrift * 1000) / 10,
                }
              : null,
          )
        }
      />
      </View>
      <View {...anchor("datacheck")}>
        <DataCheckPanel audit={audit} />
      </View>
      <View {...anchor("explain")}>{audit ? <ExplainCard gait={gait} autoRun={autoExplain} /> : null}</View>
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
  badge: { backgroundColor: color.watch, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  badgeText: { ...text.micro, color: color.onBrand },
  figures: { flexDirection: "row", marginBottom: space.md },
  figure: { flex: 1, paddingRight: space.sm },
  figureRule: { borderLeftWidth: ruleWidth, borderLeftColor: color.rule, paddingLeft: space.md },
  figureLabel: { ...text.micro, color: color.muted },
  figureValue: { ...text.statInline, color: color.ink, marginTop: 2 },
  figureAbsent: { color: color.muted },
  figureCaption: { ...text.meta, color: color.muted, marginTop: 2 },
  lede: { ...text.meta, color: color.ink2 },
  read: { ...text.meta, color: color.muted, marginTop: space.md },
  detail: { marginTop: space.xs },
  more: { alignSelf: "flex-start", paddingVertical: space.sm, marginTop: space.xs },
  morePressed: { opacity: 0.6 },
  moreLabel: { ...text.meta, color: color.brandText },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.md, marginTop: space.sm, borderTopWidth: ruleWidth, borderTopColor: color.rule },
  linkLabel: { ...text.base, color: color.ink },
  linkChevron: { ...text.base, color: color.muted },
  pctRow: { flexDirection: "row", justifyContent: "space-between", marginTop: space.md },
  pctCell: { alignItems: "center" },
  pctLabel: { ...text.micro, color: color.muted },
  pctValue: { ...text.base, color: color.ink, fontVariant: ["tabular-nums"] },
  finding: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  findingMark: { ...text.baseSemi, width: 16, textAlign: "center" },
  dates: { ...text.micro, color: color.muted, marginTop: 2, textTransform: "none" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.md, borderTopWidth: ruleWidth, borderTopColor: color.rule },
  switchLabel: { ...text.base, color: color.ink2 },
  quadrant: { marginTop: space.md },
});
