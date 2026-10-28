/**
 * The team audit on the native coach overview: squad-level score trust,
 * the Impellizzeri experiment on this team\u2019s injury log, and a per-athlete
 * list. Loaded on its own request so the overview\u2019s roster is never held up
 * by the bootstrap. Describes, never instructs.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ListRow, ListSection } from "./List";
import { StatGroup } from "./StatGroup";
import { TeamAvatar } from "./TeamAvatar";
import { getTeamAudit, type TeamAudit, type TeamModel } from "../lib/coachApi";
import { color, shadow } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

const f2 = (x: number) => x.toFixed(2);
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

export function TeamAuditSection({ onModelLayout }: { onModelLayout?: (y: number) => void } = {}) {
  const router = useRouter();
  const [audit, setAudit] = useState<TeamAudit | null>(null);
  const [model, setModel] = useState<TeamModel | null>(null);
  const [sampleTeam, setSampleTeam] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await getTeamAudit();
        if (!cancelled) {
          setAudit(r.audit);
          setModel(r.model ?? null);
          setSampleTeam(Boolean(r.sampleTeam));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (!audit) return <View style={styles.skeleton} />;

  const s = audit.summary;
  const c = audit.pooled.comparison;
  const n = audit.athletes.length;
  const verdict = c
    ? c.realBeatsNull
      ? "The 4-week baseline is carrying information on this team."
      : c.realOutsideNull
        ? "The real baseline scores below a random one: the paper\u2019s result, reproduced here."
        : "The real ratio sits inside the noise interval. The baseline added nothing on this team, which is the paper\u2019s result."
    : null;

  return (
    <>
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>Can the score be trusted here?</Text>
          <Text style={styles.panelNote}>{audit.pooled.events} injur{audit.pooled.events === 1 ? "y" : "ies"} · {audit.days} days</Text>
        </View>
        <StatGroup
          figures={[
            {
              label: "Median self-audit",
              value: s.medianRho !== null ? `ρ ${f2(s.medianRho)}` : null,
              caption:
                s.medianRho === null
                  ? `${s.withPersonalZones} of ${n} have 60 days with a ratio`
                  : s.medianRho >= 0.9
                    ? "just mileage"
                    : s.medianRho >= 0.7
                      ? "mostly last week"
                      : "baseline matters",
            },
            {
              label: "1.5 out of reach for",
              value: `${s.universalAboveOwn99th} of ${n}`,
              caption: "own 99th below 1.5",
            },
            {
              label: "Own 95th below 1.3",
              value: `${s.own95thBelowCaution} of ${n}`,
              caption: "1.3 would never warn",
            },
          ]}
        />
        <View style={styles.test}>
          <Text style={styles.eyebrow}>The Impellizzeri test, on this roster</Text>
          {c ? (
            <>
              <StatGroup
                figures={[
                  { label: "Real ratio", value: f2(c.real), caption: c.realCiLow != null ? `AUC \u00B7 ${f2(c.realCiLow)} to ${f2(c.realCiHigh!)}` : "AUC" },
                  { label: "Noise ratio", value: f2(c.null), caption: `AUC \u00B7 ${f2(c.nullCiLow)} to ${f2(c.nullCiHigh)}` },
                ]}
              />
              <Text style={styles.body}>{verdict}</Text>
              <Text style={styles.footnote}>{c.n.toLocaleString()} athlete-days, {c.nEvents} injuries. Descriptive, not a hypothesis test; 0.5 is a coin flip.</Text>
            </>
          ) : (
            <Text style={styles.body}>{audit.pooled.reason} Injuries logged on the athlete page feed this test.</Text>
          )}
        </View>
      </View>

      {model ? (
        <View onLayout={(e) => onModelLayout?.(e.nativeEvent.layout.y)}>
          <TeamModelCard model={model} sampleTeam={sampleTeam} />
        </View>
      ) : null}

      <ListSection
        title="Score trust, by athlete"
        footer="Self-audit \u03C1, own 95th percentile, and the share of days the universal 1.5 would flag. A dash means fewer than 60 days with a ratio."
      >
        {audit.athletes.map((a) => (
          <ListRow
            key={a.id}
            label={a.name}
            detail={`${a.usableDays} days with a ratio · ${a.injuries} injur${a.injuries === 1 ? "y" : "ies"}`}
            value={
              <Text style={styles.rowValue}>
                {a.rho !== null ? `ρ ${f2(a.rho)}` : "—"} · {a.p95 !== null ? f2(a.p95) : "—"} · {a.flaggedBy15 !== null ? pct(a.flaggedBy15) : "—"}
              </Text>
            }
            leading={<TeamAvatar name={a.name} hue={a.hue} size={28} />}
            onPress={() => router.push(`/coach/athlete/${a.id}`)}
          />
        ))}
      </ListSection>
    </>
  );
}

/** The learned model: honest AUC beside the ratio and noise, and what it learned. */
function TeamModelCard({ model, sampleTeam }: { model: TeamModel; sampleTeam: boolean }) {
  const r = model.result;
  const fm = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(2));
  const maxW = r ? Math.max(...r.coefficients.map((c) => Math.abs(c.weight)), 1e-9) : 1;
  const sign = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "\u2014" : `${x >= 0 ? "+" : "\u2212"}${Math.abs(x).toFixed(2)}`);
  const verdict = r
    ? r.noiseCiHigh != null && r.auc > r.noiseCiHigh && r.deltaCiLow != null && r.deltaCiLow > 0
      ? `Beats the universal formula by ${sign(r.deltaRatio)} AUC (${sign(r.deltaCiLow)} to ${sign(r.deltaCiHigh)}), and beats noise.`
      : r.deltaCiHigh != null && r.deltaCiHigh < 0
        ? `The universal formula does better on this team, by ${sign(-r.deltaRatio)} AUC (${sign(-r.deltaCiHigh)} to ${sign(r.deltaCiLow == null ? null : -r.deltaCiLow)}).`
        : r.noiseCiHigh != null && r.auc > r.noiseCiHigh
        ? `Beats noise. Its gap over the formula, ${sign(r.deltaRatio)} AUC (${sign(r.deltaCiLow)} to ${sign(r.deltaCiHigh)}), includes zero.`
        : "Nothing here separates injury weeks from the rest beyond noise."
    : null;
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>Learned from this team</Text>
        <Text style={styles.panelNote}>{r ? `trained in ${r.elapsedMs} ms` : `${model.events} injury-week days`}</Text>
      </View>
      {!r ? (
        <Text style={styles.body}>{model.reason}</Text>
      ) : (
        <>
          <StatGroup
            figures={[
              { label: "Learned model", value: fm(r.auc), caption: `AUC · ${fm(r.aucCiLow)} to ${fm(r.aucCiHigh)}`, tone: color.brandText },
              { label: "Universal ratio", value: fm(r.ratioAuc), caption: "same labels" },
              { label: "Noise ratio", value: fm(r.noiseAuc), caption: `${fm(r.noiseCiLow)} to ${fm(r.noiseCiHigh)}` },
            ]}
          />
          <Text style={styles.body}>{verdict}</Text>
          <Text style={styles.eyebrow}>What it learned</Text>
          {r.coefficients.slice(0, 6).map((c) => (
            <View key={c.key} style={modelStyles.row}>
              <Text style={modelStyles.label} numberOfLines={1}>{c.label}</Text>
              <View style={modelStyles.track}>
                <View style={[modelStyles.bar, { width: `${(Math.abs(c.weight) / maxW) * 100}%`, backgroundColor: c.weight >= 0 ? color.watch : color.series1 }]} />
              </View>
              <Text style={modelStyles.weight}>{c.weight >= 0 ? "+" : ""}{c.weight.toFixed(2)}</Text>
            </View>
          ))}
          <Text style={styles.footnote}>
            Logistic regression on twelve readings the app already has, scored on each athlete by a model that never saw them ({r.folds} folds). Label: an injury logged within 7 days.
            {sampleTeam ? " Sample team: the injuries were generated from load, soreness and recovery, so the model is finding the generator." : " Descriptive, not a diagnosis."}
          </Text>
        </>
      )}
    </View>
  );
}

const modelStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { ...text.meta, color: color.ink2, width: 150 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: color.well, overflow: "hidden" },
  bar: { height: 8, borderRadius: 4 },
  weight: { ...text.meta, color: color.muted, width: 48, textAlign: "right", fontVariant: ["tabular-nums"] },
});

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    gap: space.md,
    ...shadow.card,
  },
  panelHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  panelTitle: { ...text.baseSemi, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },
  test: { backgroundColor: color.well, borderRadius: radius.control, padding: space.md, gap: space.xs },
  eyebrow: { ...text.micro, color: color.muted },
  body: { ...text.meta, color: color.ink2 },
  footnote: { ...text.meta, color: color.muted },
  rowValue: { ...text.meta, color: color.ink2, fontVariant: ["tabular-nums"] },
  skeleton: { height: 220, borderRadius: radius.card, backgroundColor: color.well },
});
