/**
 * The coach's roster. The native twin of the website's `/dashboard`.
 *
 * Both render `buildRoster` (website/src/lib/roster.ts), so the numbers and the
 * ORDER are the server's, not this screen's. That is deliberate: the sort is
 * "missing data first, never by risk", and a client that re-sorted by its own
 * idea of urgency would quietly reintroduce the risk ranking the spec forbids.
 * This file lays the data out; it does not decide anything about it.
 *
 * ── THE RULES THIS SCREEN OBEYS ────────────────────────────────────────────
 *  - `—` is NEVER used here. In this product a dash means "we don't know", and
 *    on the web roster it once meant "nothing to flag" — the opposite — two
 *    clicks from a detail page where it meant unknown again. Nothing needing a
 *    look says `clear`, which is the product's own advisory word for it.
 *  - Absent check-ins take the DASHED treatment, the same shape `Absent` uses
 *    on the athlete side, so "unknown" reads identically on both sides of the
 *    product (visual-spec § "Coach dashboard").
 *  - `daysSinceCheckIn === null` prints the WINDOW, not "never". The server
 *    only looked back `lookbackDays`; a bigger claim would not be measured.
 *  - Distance goes through `lib/units`. The API ships kilometres and every
 *    figure on screen is welded to its unit in one text node.
 *  - No composite score anywhere. There is no risk number on this screen and
 *    there is not meant to be one.
 */
import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Card } from "../../../components/Card";
import { Press } from "../../../components/Press";
import { LoadSpark } from "../../../components/LoadSpark";
import { RangePicker } from "../../../components/RangePicker";
import { StatGroup } from "../../../components/StatGroup";
import { TeamAvatar } from "../../../components/TeamAvatar";
import { ViewSwitcher } from "../../../components/ViewSwitcher";
import { ApiError } from "../../../lib/api";
import { getRoster, type RosterAthlete, type RosterResponse } from "../../../lib/coachApi";
import { DEFAULT_RANGE, type RangeKey } from "../../../lib/range";
import { useSession } from "../../../lib/session";
import { fmtMiles } from "../../../lib/units";
import { color, shadow } from "../../../theme/tokens";
import { text } from "../../../theme/type";
import { layout, radius, ruleWidth, space, target } from "../../../theme/space";

export default function CoachRosterScreen() {
  const router = useRouter();
  const { signOutCoach } = useSession();

  const [data, setData] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);

  const load = useCallback(async () => {
    try {
      setData(await getRoster(range));
      setError(null);
    } catch (e) {
      // A 401 means the coach token is gone or the secret rotated. End the
      // session rather than showing a roster-shaped error the coach cannot act
      // on — the gate then unmounts this screen and its data with it.
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load the roster.");
    }
    // `range` is a dependency: changing the window refetches, because the
    // team's distance and every athlete's mileage are computed over it
    // server-side — see lib/roster.ts. Windowing on the client would mean
    // re-deriving the engine's own numbers here, wrongly.
  }, [range, signOutCoach]);

  useEffect(() => {
    // Inside an async closure rather than the effect body: this settles after
    // an await, so it does not set state synchronously off the mount. Same
    // shape connect.tsx uses.
    void (async () => {
      await load();
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>BEFORE PRACTICE</Text>
          <Text style={styles.title}>{data?.team.name ?? "Roster"}</Text>
        </View>
        {/*
          The way back to the athlete side, and it is NOT sign-out. Sign-out was
          the only control here, so leaving the coach view meant destroying the
          session — see ViewSwitcher. Sign-out still exists, one tap further in,
          because ending a session is a deliberate act and should not sit where
          a switch belongs.
        */}
        <ViewSwitcher to="athlete" />
      </View>

      {/* ONE window for the whole screen — see RangePicker. */}
      <View style={styles.rangeRow}>
        <RangePicker value={range} onChange={setRange} label="Window for every figure below" />
      </View>

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <Card>
            <Text style={styles.errorTitle}>Could not load the roster</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </Card>
        ) : !data ? (
          // Reserves roughly the real height so the layout does not jump when
          // the data lands.
          <View style={styles.skeleton} />
        ) : (
          <>
            <TodaySession plan={data.plan.today} tomorrow={data.plan.tomorrow} />

            <StatGroup
              figures={[
                {
                  label: "Long-run spikes",
                  value: String(data.summary.spikes),
                  caption: "past their usual",
                  tone: data.summary.spikes > 0 ? color.watchText : color.okText,
                },
                {
                  label: "Soreness patterns",
                  value: String(data.summary.sore),
                  caption: "same spot, 3+ days",
                  tone: data.summary.sore > 0 ? color.watchText : color.okText,
                },
                {
                  label: "Team distance",
                  value: fmtMiles(data.summary.teamKm),
                  caption:
                    data.summary.teamChangePct === null
                      ? `${data.range.short} · no previous window`
                      : `${data.range.short} · ${data.summary.teamChangePct > 0 ? "+" : ""}${data.summary.teamChangePct}% vs previous`,
                },
                {
                  label: "Not checking in",
                  value: String(data.summary.quiet),
                  caption: data.summary.quiet > 0 ? "no recent report" : "everyone reporting",
                  tone: data.summary.quiet > 0 ? color.ink : color.okText,
                },
              ]}
            />

            <Text style={styles.sectionHead}>
              {data.athletes.length} athletes · sorted by who we have not heard from
            </Text>

            {/*
              ONE panel, rows divided by hairlines — not fourteen floating
              cards. ../../../../docs/visual-spec.md § "Coach dashboard" says
              it outright: "The roster is a table, not a feed." A stack of
              equally-shadowed cards is a feed, and it also makes every athlete
              look like a separate decision when the coach's job here is to
              scan one list.
            */}
            <View style={styles.roster}>
              {data.athletes.map((a, i) => (
                <RosterRow
                  key={a.id}
                  athlete={a}
                  first={i === 0}
                  staleAfterDays={data.staleAfterDays}
                  lookbackDays={data.lookbackDays}
                  rangeShort={data.range.short}
                  onPress={() => router.push(`/coach/athlete/${a.id}`)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** What the team is doing today, straight off the coach's own calendar. */
function TodaySession({
  plan,
  tomorrow,
}: {
  plan: RosterResponse["plan"]["today"];
  tomorrow: RosterResponse["plan"]["tomorrow"];
}) {
  if (!plan) {
    return (
      <Card>
        <Text style={styles.eyebrowSmall}>Today</Text>
        <Text style={styles.sessionNone}>
          Nothing written for today. The athletes see their generated plan instead.
        </Text>
      </Card>
    );
  }
  const distance = plan.distance_m === null ? null : fmtMiles(plan.distance_m / 1000);
  return (
    <Card>
      <Text style={styles.eyebrowSmall}>Today</Text>
      <Text style={styles.sessionTitle}>
        {plan.type}
        {distance ? ` · ${distance}` : ""}
        {plan.target_pace ? ` · ${plan.target_pace}` : ""}
      </Text>
      {plan.details ? (
        // Two lines, not the whole brief. A coach wrote it and knows it; this
        // is a reminder of what today is, not the session sheet.
        <Text style={styles.sessionBody} numberOfLines={2}>
          {plan.details}
        </Text>
      ) : null}
      {tomorrow ? (
        <Text style={styles.sessionNext}>
          Tomorrow: {tomorrow.type}
          {tomorrow.distance_m === null ? "" : ` · ${fmtMiles(tomorrow.distance_m / 1000)}`}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * One athlete. Everything the coach could act on today, and nothing they can't.
 *
 * The flag order matters and mirrors the web: what we KNOW (a spike, a soreness
 * pattern) reads as plain coloured text, and what we DON'T (no check-in) takes
 * the dashed chip. A row can carry both, and several do.
 */
function RosterRow({
  athlete: a,
  first,
  staleAfterDays,
  lookbackDays,
  rangeShort,
  onPress,
}: {
  athlete: RosterAthlete;
  /** The first row draws no top hairline — the panel's own edge is there. */
  first: boolean;
  staleAfterDays: number;
  lookbackDays: number;
  rangeShort: string;
  onPress: () => void;
}) {
  const persistent = a.soreness.persistentPart && a.soreness.persistentDays >= 3;
  const acute = !persistent && a.soreness.todayMax >= 6;
  const stale = a.daysSinceCheckIn !== null && a.daysSinceCheckIn >= staleAfterDays;
  const flagged = a.spike !== null || persistent;

  const known: string[] = [];
  if (a.spike) {
    known.push(`${fmtMiles(a.spike.km)} run · ${a.spike.pctAbove}% over usual`);
  }
  if (persistent) {
    known.push(
      `${a.soreness.persistentPart} · ${a.soreness.persistentDays}/7d${a.soreness.escalating ? " ↑" : ""}`
    );
  } else if (acute) {
    known.push(`${a.soreness.todayPart} · ${a.soreness.todayMax}/10 today`);
  }

  const absent =
    a.daysSinceCheckIn === null
      ? `no check-in in ${lookbackDays}d`
      : stale
        ? `no check-in · ${a.daysSinceCheckIn}d`
        : null;

  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${a.name}`}
      style={[styles.row, !first && styles.rowRule, flagged && styles.rowFlagged]}
      scale={false}
      pressedStyle={styles.pressed}
    >
      <View style={styles.rowHead}>
        <TeamAvatar name={a.name} hue={a.hue} />
        <View style={styles.rowName}>
          <Text style={styles.name}>{a.name}</Text>
          <Text style={styles.sub}>
            {a.grade === null ? a.tier : `Grade ${a.grade} · ${a.tier}`}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowKm}>{fmtMiles(a.rangeKm)}</Text>
          <Text style={styles.rowRange}>{rangeShort}</Text>
        </View>
      </View>


      {/*
        Flags left, four weeks of load right, on ONE line.
        Stacked, a row ran to ~230pt and fourteen of them made the roster a long
        scroll for a screen whose whole promise is five minutes before practice.
        The website keeps an athlete to a single table row; this is that row,
        folded for a phone. What needs a look stays first in reading order —
        the sparkline is context and sits after it.
      */}
      <View style={styles.rowFoot}>
        <View style={styles.flags}>
          {known.map((line) => (
            <Text key={line} style={styles.flagKnown}>
              {`⚠ ${line}`}
            </Text>
          ))}
          {absent ? (
            <View style={styles.absentChip}>
              <Text style={styles.absentText}>{absent}</Text>
            </View>
          ) : null}
          {known.length === 0 && absent === null ? (
            <Text style={styles.clear}>clear</Text>
          ) : null}
        </View>
        <LoadSpark data={a.spark} width={104} />
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  safe: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.page,
    paddingBottom: space.md,
  },
  headerText: { flex: 1 },
  eyebrow: { ...text.micro, color: color.muted },
  /* Sentence case. The tracked-out mono caps voice is reserved for the one
     eyebrow at the top of the screen; spending it on every card is most of
     what made these screens read as machine-assembled. */
  eyebrowSmall: { ...text.meta, color: color.muted },
  title: { ...text.title, color: color.ink, marginTop: space.xs },
  headerAction: { minHeight: target.min, justifyContent: "center" },
  headerActionLabel: { ...text.base, color: color.brandText },

  rangeRow: { paddingHorizontal: layout.page, paddingBottom: space.sm },
  page: { paddingHorizontal: layout.page, paddingBottom: space.xxxl, gap: space.md },
  skeleton: { height: 320, borderRadius: radius.card, backgroundColor: color.well },

  errorTitle: { ...text.title, color: color.ink },
  errorBody: { ...text.meta, color: color.ink2, marginTop: space.sm },

  sessionTitle: { ...text.title, color: color.ink, marginTop: space.sm },
  sessionBody: { ...text.base, color: color.ink2, marginTop: space.sm },
  sessionNext: { ...text.meta, color: color.muted, marginTop: space.md },
  sessionNone: { ...text.base, color: color.ink2, marginTop: space.sm },


  sectionHead: { ...text.meta, color: color.muted, marginTop: space.sm },
  rowRangeQuiet: { ...text.meta, color: color.muted },

  /** The panel. One edge, one shadow, for the whole list. */
  roster: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    overflow: "hidden",
    ...shadow.card,
  },
  row: { padding: layout.cardPadding },
  rowRule: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  /** The same 3px inset bar the web roster uses for a flagged row. */
  rowFlagged: { borderLeftWidth: 3, borderLeftColor: color.watch },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  rowName: { flex: 1 },
  rowRight: { alignItems: "flex-end" },
  rowRange: { ...text.micro, color: color.muted },
  name: { ...text.baseSemi, color: color.ink },
  sub: { ...text.meta, color: color.muted },
  rowKm: { ...text.stat, color: color.ink },

  rowFoot: {
    marginTop: space.md,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
  },
  flags: { flex: 1, gap: space.sm, alignItems: "flex-start", flexShrink: 1 },
  flagKnown: { ...text.meta, color: color.watchText },
  clear: { ...text.meta, color: color.muted },
  /** Dashed: the one thing in this app that means "we don't know". */
  absentChip: {
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    backgroundColor: color.well,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  absentText: { ...text.meta, color: color.ink2 },

});
