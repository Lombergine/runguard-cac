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
import { getTeamAudit, type TeamAudit } from "../lib/coachApi";
import { color, shadow } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

const f2 = (x: number) => x.toFixed(2);
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

export function TeamAuditSection() {
  const router = useRouter();
  const [audit, setAudit] = useState<TeamAudit | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await getTeamAudit();
        if (!cancelled) setAudit(r.audit);
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
      ? "The real 4-week denominator is carrying information on this team."
      : c.realOutsideNull
        ? "The real denominator is costing signal that a random one did not: the paper\u2019s result, reproduced here."
        : "The real ratio sits inside the noise interval: the chronic denominator added nothing on this team, which is the paper\u2019s result, reproduced here."
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
            <Text style={styles.body}>
              Across {c.n.toLocaleString()} athlete-days and {c.nEvents} injuries, the ratio the app shows separates injury days from the rest with an AUC of {f2(c.real)}
              {c.realCiLow != null ? ` (${f2(c.realCiLow)} to ${f2(c.realCiHigh!)})` : ""}. A ratio whose 4-week denominator was shuffled into noise scores {f2(c.null)} ({f2(c.nullCiLow)} to {f2(c.nullCiHigh)}). {verdict}
            </Text>
          ) : (
            <Text style={styles.body}>{audit.pooled.reason} Injuries logged on the athlete page feed this test.</Text>
          )}
          <Text style={styles.footnote}>Descriptive, not a hypothesis test. 0.5 is a coin flip; both ratios share the real numerator, so both can sit above it.</Text>
        </View>
      </View>

      <ListSection
        title="Score trust, by athlete"
        footer="ρ is how closely each athlete\u2019s score tracks their last 7 days alone (Impellizzeri et al. 2021); a dash means fewer than 60 days with a ratio. The second figure is their own 95th percentile, then the share of their days the universal 1.5 would flag."
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
