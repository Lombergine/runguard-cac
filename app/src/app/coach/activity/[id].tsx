/**
 * One run, opened from a coach's roster.
 *
 * The coach-side twin of `activity/[id].tsx`, which is the ATHLETE's own copy
 * of this screen and reads their own token. Two files rather than one because
 * they authenticate differently and scope differently — the athlete's checks
 * "is this my run", this one checks "is this run's athlete on my team" — and a
 * single screen switching on which credential it holds is the shape that gets
 * that wrong.
 *
 * ── WHOSE RUN THIS IS ──────────────────────────────────────────────────────
 * The athlete's name is in the pinned header, not just the run's. A coach
 * arrives here from a list of fourteen people, and § "Coach dashboard" is
 * explicit that a detail surface must never rely on them remembering which row
 * they tapped.
 *
 * ── THE PER-RUN CHARTS, AND THE SCHEMA GAP BEHIND THEM ─────────────────────
 * Mile splits, a heart-rate trace and an elevation profile, matching what the
 * deployed activity page draws.
 *
 * They nearly did not get built. `ActivityRow` declares `splits`, `hr_series`
 * and `elev_series`, and nothing in `db/schema.sqlite.ts` created them, so on
 * the SQLite driver `SELECT splits` errored, `parseStream(undefined)` returned
 * [], and every local run rendered "not recorded" — which reads exactly like a
 * feature that was never finished. Supabase HAS the columns and production
 * draws all three, so the gap was local-dev only and completely silent.
 *
 * `db/schema.sqlite.ts` now adds them. Anything that still arrives empty is a
 * real absence and renders dashed, the way every unknown does here.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Card } from "../../../components/Card";
import { Press } from "../../../components/Press";
import { Splits } from "../../../components/Splits";
import { StatGroup } from "../../../components/StatGroup";
import { StreamChart } from "../../../components/StreamChart";
import { TeamAvatar } from "../../../components/TeamAvatar";
import { ApiError } from "../../../lib/api";
import { getCoachActivity, type CoachActivity } from "../../../lib/coachApi";
import { useSession } from "../../../lib/session";
import { fmtDuration, fmtMiles } from "../../../lib/units";
import { color } from "../../../theme/tokens";
import { text } from "../../../theme/type";
import { layout, radius, ruleWidth, space, target } from "../../../theme/space";

const METRES_PER_FOOT = 0.3048;

/** Pre-formatted and local. Components never derive a date. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function CoachActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { signOutCoach } = useSession();

  const [data, setData] = useState<CoachActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The plot width, measured rather than assumed.
   *
   * `react-native-svg` needs a concrete number — it has no intrinsic sizing —
   * and the available width is the page inset minus the card padding, which is
   * a sum of tokens the layout owns rather than this screen. Measuring the
   * ScrollView is the only thing that stays correct on a rotate or a different
   * device.
   */
  const [plotWidth, setPlotWidth] = useState(0);

  const load = useCallback(async () => {
    const n = Number(id);
    if (!Number.isInteger(n)) {
      setError("That run could not be found.");
      return;
    }
    try {
      setData(await getCoachActivity(n));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      // A run on another team answers 404, the same as one that does not
      // exist — see the route. The message says the same thing either way.
      setError(e instanceof Error ? e.message : "Could not load this run.");
    }
  }, [id, signOutCoach]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const a = data?.activity;
  const paceMi =
    a && a.avgPaceSecPerKm !== null ? `${fmtDuration(Math.round(a.avgPaceSecPerKm * 1.609344))}/mi` : null;
  const elevationFt =
    a && a.elevationGainM !== null ? String(Math.round(a.elevationGainM / METRES_PER_FOOT)) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.identity}>
        <Press
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
          pressedStyle={styles.pressed}
        >
          <Text style={styles.backLabel}>← Back</Text>
        </Press>
        <View style={styles.identityRow}>
          {data ? <TeamAvatar name={data.athlete.name} hue={data.athlete.hue} /> : null}
          <View style={styles.identityText}>
            <Text style={styles.name}>{a?.name || a?.type || "Run"}</Text>
            <Text style={styles.sub}>
              {data ? `${data.athlete.name} · ${whenLabel(a!.startTime)}` : " "}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.page}
        onLayout={(e) =>
          // Card padding on both sides comes off the measured page width.
          setPlotWidth(e.nativeEvent.layout.width - layout.page * 2 - layout.cardPadding * 2)
        }
      >
        {error ? (
          <Card>
            <Text style={styles.blockTitle}>Could not load this run</Text>
            <Text style={styles.body}>{error}</Text>
          </Card>
        ) : !a ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            <StatGroup
              figures={[
                {
                  label: "Distance",
                  value: a.distanceM > 0 ? fmtMiles(a.distanceM / 1000, 2) : null,
                  caption: "this run",
                },
                {
                  label: "Time",
                  value: a.durationS > 0 ? fmtDuration(a.durationS) : null,
                  caption: "moving",
                },
                { label: "Avg pace", value: paceMi, caption: "per mile" },
                { label: "Type", value: a.type || "Run", caption: "as recorded" },
              ]}
            />

            <StatGroup
              figures={[
                {
                  label: "Avg heart rate",
                  value: a.avgHr === null ? null : `${Math.round(a.avgHr)} bpm`,
                  caption: a.avgHr === null ? "not recorded" : "over the run",
                },
                {
                  label: "Max heart rate",
                  value: a.maxHr === null ? null : `${Math.round(a.maxHr)} bpm`,
                  caption: a.maxHr === null ? "not recorded" : "peak",
                },
                {
                  label: "Elevation gain",
                  value: elevationFt === null ? null : `${elevationFt} ft`,
                  caption: elevationFt === null ? "not recorded" : "total climb",
                },
                {
                  label: "Cadence",
                  value: a.cadence === null ? null : `${Math.round(a.cadence)} spm`,
                  caption: a.cadence === null ? "not recorded" : "steps per minute",
                },
              ]}
            />

            <StatGroup
              figures={[
                {
                  label: "Calories",
                  value: a.calories === null ? null : `${Math.round(a.calories)} kcal`,
                  caption: a.calories === null ? "not recorded" : "active",
                },
                {
                  label: "Recorded",
                  value: whenLabel(a.startTime),
                  caption: "local day",
                },
              ]}
            />

            <Splits splits={a.splits} />

            {/*
              Red for heart rate, green for elevation. The one place in this app
              that spends a hue on convention rather than on state — every other
              running app a coach has used draws them this way, and an ember
              version would be consistent with the design system and wrong for
              the reader.
            */}
            <StreamChart
              title="Heart rate"
              note={a.avgHr === null ? undefined : `avg ${Math.round(a.avgHr)} bpm`}
              points={a.hrSeries.map((p) => ({ tS: p.tS, value: p.bpm }))}
              stroke={color.unusual}
              unit="BPM OVER ELAPSED TIME"
              width={plotWidth}
            />

            <StreamChart
              title="Elevation"
              note={elevationFt === null ? undefined : `${elevationFt} ft gained`}
              // Metres on the wire, feet on the screen — every distance in this
              // app is imperial by the time it is rendered.
              points={a.elevSeries.map((p) => ({
                tS: p.tS,
                value: Math.round(p.m / METRES_PER_FOOT),
              }))}
              stroke={color.ok}
              unit="FEET OVER ELAPSED TIME"
              width={plotWidth}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  safe: { flex: 1, backgroundColor: color.bg },
  identity: {
    paddingHorizontal: layout.page,
    paddingBottom: space.md,
    borderBottomWidth: ruleWidth,
    borderBottomColor: color.ruleSoft,
  },
  back: { minHeight: target.min, justifyContent: "center" },
  backLabel: { ...text.base, color: color.muted },
  identityRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  identityText: { flex: 1 },
  name: { ...text.title, color: color.ink },
  sub: { ...text.meta, color: color.muted },

  page: { padding: layout.page, gap: space.md, paddingBottom: space.xxxl },
  skeleton: { height: 280, borderRadius: radius.card, backgroundColor: color.well },

  blockTitle: { ...text.title, color: color.ink },
  body: { ...text.base, color: color.ink2, marginTop: space.sm },

  absentBlock: {
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    backgroundColor: color.well,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  absentDash: { ...text.stat, color: color.unknown },
  absentLabel: { ...text.baseSemi, color: color.ink2, marginTop: space.xs },
  absentNote: { ...text.meta, color: color.muted, marginTop: space.xs },
});
