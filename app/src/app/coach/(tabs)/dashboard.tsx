/**
 * The coach's team overview — "how is the squad", before "who do I open".
 *
 * The roster and this screen were one tab. On a real team the roster is
 * fourteen rows deep, which pushed every team-level number below the fold, so
 * the coach's first question before practice was answered underneath the answer
 * to their second. They are a tab each now, and this one leads to the other.
 *
 * ── EVERY FIGURE IS THE SERVER'S ───────────────────────────────────────────
 * `teamStats` comes down from `/api/mobile/coach/roster`, computed by
 * `website/src/lib/roster.ts` — the same function the web dashboard renders.
 * Nothing on this screen is aggregated on the phone. The bands need each
 * athlete's workload ratio and the weekly bars need their full daily series,
 * neither of which is on the wire, and doing it here would mean two pieces of
 * arithmetic that can disagree about one squad.
 *
 * ── AND NOTHING HERE COUNTS AN ATHLETE IT KNOWS NOTHING ABOUT ──────────────
 * The workload bands are taken over `rated`, not over the roster. An athlete
 * who has never synced has no ratio, and folding them into the denominator
 * would report them as sitting in the safe band. `unrated` is stated on screen
 * rather than dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ColorValue } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { LoadSpark } from "../../../components/LoadSpark";
import { ListRow, ListSection } from "../../../components/List";
import { LargeTitle, useScrollTitle } from "../../../components/LargeTitle";
import { RangePicker } from "../../../components/RangePicker";
import { StatGroup } from "../../../components/StatGroup";
import { TeamAvatar } from "../../../components/TeamAvatar";
import { TeamAuditSection } from "../../../components/TeamAuditSection";
import { ApiError } from "../../../lib/api";
import { getRoster, type RosterAthlete, type RosterResponse } from "../../../lib/coachApi";
import { DEFAULT_RANGE, type RangeKey } from "../../../lib/range";
import { useSession } from "../../../lib/session";
import { fmtMiles } from "../../../lib/units";
import { color, shadow } from "../../../theme/tokens";
import { text } from "../../../theme/type";
import { layout, radius, ruleWidth, space } from "../../../theme/space";

export default function CoachDashboardScreen() {
  const router = useRouter();
  const { signOutCoach } = useSession();
  const { scrollY, onScroll } = useScrollTitle();

  const [data, setData] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);

  // RunGuard 2.0: `runguard://coach/dashboard?scroll=audit` lands on the
  // team audit and `?scroll=model` on the learned model below it. Deep-link
  // anchors for a future "the test has a result" notification.
  const { scroll } = useLocalSearchParams<{ scroll?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [auditY, setAuditY] = useState<number | null>(null);
  const [modelY, setModelY] = useState<number | null>(null);
  useEffect(() => {
    if (scroll === "audit" && auditY !== null) {
      scrollRef.current?.scrollTo({ y: auditY, animated: false });
    } else if (scroll === "model" && auditY !== null && modelY !== null) {
      scrollRef.current?.scrollTo({ y: auditY + modelY, animated: false });
    }
  }, [scroll, auditY, modelY]);

  const load = useCallback(async () => {
    try {
      setData(await getRoster(range));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load your team.");
    }
  }, [range, signOutCoach]);

  useEffect(() => {
    // Inside an async closure rather than the effect body: this settles after
    // an await, so it does not set state synchronously off the mount. Same
    // shape the roster screen and connect.tsx use.
    void (async () => {
      await load();
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const stats = data?.teamStats;
  const athletes = data?.athletes ?? [];
  const stale = data?.staleAfterDays ?? 5;

  /*
   * Who needs opening, in the roster's own order. Recomputed from the rows
   * rather than taken from `teamStats.needsLook` (which is only a count),
   * using the same three conditions the server counts — a spike, a soreness
   * pattern, or a check-in that is stale or absent.
   */
  const needsLook = athletes.filter(
    (a) =>
      a.spike !== null ||
      (a.soreness.persistentPart !== null && a.soreness.persistentDays >= 3) ||
      a.daysSinceCheckIn === null ||
      a.daysSinceCheckIn >= stale
  );

  return (
    <View style={styles.screen}>
      <LargeTitle
        title="Before practice"
        subtitle={
          data
            ? `${data.team.name ?? "Your team"} · ${athletes.length} athlete${
                athletes.length === 1 ? "" : "s"
              }`
            : undefined
        }
        scrollY={scrollY}
      />

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.page}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Could not load your team</Text>
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : !data || !stats ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            <RangePicker value={range} onChange={setRange} />

            <StatGroup
              figures={[
                {
                  label: "Long-run spikes",
                  value: String(data.summary.spikes),
                  caption: data.summary.spikes > 0 ? "past their usual" : "none this week",
                  tone: data.summary.spikes > 0 ? color.watchText : color.okText,
                },
                {
                  label: "Soreness patterns",
                  value: String(data.summary.sore),
                  caption: data.summary.sore > 0 ? "same spot, 3+ days" : "nothing recurring",
                  tone: data.summary.sore > 0 ? color.watchText : color.okText,
                },
                {
                  label: `Team distance`,
                  value: fmtMiles(data.summary.teamKm, 0),
                  caption:
                    data.summary.teamChangePct === null
                      ? `nothing the ${data.range.short} before`
                      : `${data.summary.teamChangePct >= 0 ? "+" : ""}${
                          data.summary.teamChangePct
                        }% vs previous`,
                },
                {
                  label: "Not checking in",
                  value: String(data.summary.quiet),
                  caption: data.summary.quiet > 0 ? "no recent self-report" : "everyone reporting",
                  tone: data.summary.quiet > 0 ? color.muted : color.okText,
                },
              ]}
            />

            {/*
              The actionable block. It repeats rows that are also on the Roster
              tab, on purpose: a coach who opens only this screen has still seen
              everyone who needs opening before practice starts.
            */}
            <ListSection
              title={
                needsLook.length > 0
                  ? `Needs a look · ${needsLook.length} of ${athletes.length}`
                  : "Needs a look"
              }
              footer={
                needsLook.length === 0
                  ? "Nothing flagged, and everyone has checked in recently."
                  : undefined
              }
            >
              {needsLook.length === 0 ? (
                <ListRow label="All clear" detail="The Roster tab has the full squad." />
              ) : (
                needsLook.map((a) => (
                  <ListRow
                    key={a.id}
                    label={a.name}
                    detail={flagLine(a, stale, data.lookbackDays)}
                    leading={<TeamAvatar name={a.name} hue={a.hue} size={28} />}
                    onPress={() => router.push(`/coach/athlete/${a.id}`)}
                  />
                ))
              )}
            </ListSection>

            {/* RunGuard 2.0 (CAC 2026): can the score be trusted on this team?
                AI-assisted, see DISCLOSURE.md. */}
            <View onLayout={(e) => setAuditY(e.nativeEvent.layout.y)}>
              <TeamAuditSection onModelLayout={setModelY} />
            </View>

            {/* Team distance, complete weeks only — the server drops the week
                in progress so a Tuesday does not read as a collapse. */}
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Team distance</Text>
                <Text style={styles.panelNote}>through last week</Text>
              </View>
              {stats.weeks.length === 0 ? (
                <Text style={styles.body}>Not enough history yet.</Text>
              ) : (
                <LoadSpark data={stats.weeks.map((w) => ({ date: w.week, load: w.km }))} />
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Workload spread</Text>
                <Text style={styles.panelNote}>context only</Text>
              </View>
              {stats.acwr.rated === 0 ? (
                <Text style={styles.body}>
                  Not enough training history on anyone yet for a workload ratio.
                </Text>
              ) : (
                <>
                  <BandBar
                    total={stats.acwr.rated}
                    segments={[
                      { n: stats.acwr.under, label: "under 0.8", tint: color.series1 },
                      { n: stats.acwr.inZone, label: "0.8–1.3", tint: color.ok },
                      { n: stats.acwr.over, label: "above 1.3", tint: color.watch },
                    ]}
                  />
                  <Text style={styles.footnote}>
                    {stats.acwr.rated} of {athletes.length} have enough history to rate
                    {stats.acwr.unrated > 0
                      ? `; ${stats.acwr.unrated} have not synced enough yet`
                      : ""}
                    . This ratio showed no link to injury in a 5,205-runner study — it is
                    context, not a verdict.
                  </Text>
                </>
              )}
            </View>

            {/*
              The window is in the TITLE. Unlabelled, this sat as "0 of 14"
              under a tile reading "Not checking in — everyone reporting", and
              both were true: nobody has logged one since midnight, and everyone
              has logged one in the last few days.
            */}
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Self-reports logged today</Text>
                <Text style={styles.panelNote}>
                  {stats.reportedToday} of {athletes.length}
                </Text>
              </View>
              <BandBar
                total={athletes.length}
                segments={[
                  { n: stats.reportedToday, label: "logged today", tint: color.ok },
                  {
                    n: athletes.length - stats.reportedToday,
                    label: "not yet today",
                    tint: color.surface3,
                  },
                ]}
              />
              <Text style={styles.footnote}>
                Today only — the tile above counts anyone quiet for {stale}+ days, which is the
                one worth chasing. A quiet athlete is not a healthy one, they are an unknown one.
              </Text>
            </View>

            <ListSection title="Squad by tier" footer="From each athlete's own fitness score.">
              {stats.tiers.map((t) => (
                <ListRow key={t.tier} label={t.tier} value={String(t.n)} />
              ))}
            </ListSection>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

/** The one-line reason this athlete is on the list. Same words as the roster. */
function flagLine(a: RosterAthlete, stale: number, lookback: number): string {
  if (a.spike) return `${fmtMiles(a.spike.km)} run · ${a.spike.pctAbove}% over usual`;
  if (a.soreness.persistentPart && a.soreness.persistentDays >= 3) {
    return `${a.soreness.persistentPart} · ${a.soreness.persistentDays}/7d`;
  }
  // Null is "nothing inside the window we looked at", never "never".
  if (a.daysSinceCheckIn === null) return `no check-in in ${lookback}d`;
  if (a.daysSinceCheckIn >= stale) return `no check-in · ${a.daysSinceCheckIn}d`;
  return "";
}

/**
 * A proportion bar with the counts written on it.
 *
 * The numbers are printed beside each swatch rather than left to the segment
 * widths, because a band holding one athlete out of fourteen is a sliver — and
 * "one athlete is ramping hard" is exactly the case a coach must not lose to a
 * rounding error in a bar.
 */
function BandBar({
  segments,
  total,
}: {
  segments: { n: number; label: string; tint: ColorValue }[];
  total: number;
}) {
  return (
    <>
      <View style={styles.bandTrack}>
        {segments
          .filter((s) => s.n > 0)
          .map((s) => (
            <View
              key={s.label}
              style={{ flex: s.n / Math.max(1, total), backgroundColor: s.tint }}
            />
          ))}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.tint }]} />
            <Text style={styles.legendCount}>{s.n}</Text>
            <Text style={styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  page: { padding: layout.page, paddingTop: space.md, gap: space.lg, paddingBottom: space.xxxl },
  skeleton: { height: 320, borderRadius: radius.card, backgroundColor: color.well },

  panel: {
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    backgroundColor: color.card,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    gap: space.sm,
    ...shadow.card,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  panelTitle: { ...text.baseSemi, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },
  body: { ...text.base, color: color.ink2 },
  footnote: { ...text.meta, color: color.muted, marginTop: space.xs },

  bandTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: color.surface3,
    marginTop: space.xs,
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: ruleWidth, borderColor: color.ruleSoft },
  legendCount: { ...text.baseSemi, color: color.ink },
  legendLabel: { ...text.meta, color: color.muted },
});
