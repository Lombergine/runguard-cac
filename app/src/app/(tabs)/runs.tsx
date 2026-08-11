/**
 * The Training tab — this week's plan, then the runs already done.
 *
 * The route keeps its `runs` name (the tab bar relabels it); what changed is
 * that the plan now sits above the log. That is the order the parenthetical in
 * the brief asks for and it is the order the screen reads best in: what you are
 * meant to do today, then what you have actually done. NOTE that the web portal
 * puts its "Recent runs" panel FIRST (tabs.tsx:360) and the plan last — the two
 * surfaces deliberately differ here, and only here.
 *
 * Two limitations in the payload are visible here rather than papered over:
 *
 *   1. `recentRuns` has no time of day. Two runs on the same date are therefore
 *      indistinguishable and no clock time is shown — inventing one would be
 *      inventing data.
 *   2. `recentRuns` has no activity type. The session label is recovered by
 *      matching the run's local day against the plan, and when the plan has
 *      nothing for that day the card carries the date alone rather than a
 *      guess.
 */
import { ReactNode, useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../../components/Card";
import { Absent } from "../../components/Nothing";
import { PlanWeek, planWeekMetrics } from "../../components/PlanWeek";
import { RunCard, runCardMetrics } from "../../components/RunCard";
import { dayLabel } from "../../lib/dates";
import { useProfile } from "../../lib/profileStore";
import type { PlanAdjustment, RecentRun } from "../../lib/types";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

/** How many placeholder cards to hold while the profile is in flight. */
const SKELETON_ROWS = 3;

/**
 * What the plan looks like when nothing was eased. `/api/mobile/home` sends
 * `plan` without an `adjustment`, so the type makes it optional and this is the
 * value that stands in — scale 1, and no reason, which is exactly "nothing to
 * say". It is NOT a claim that the plan was checked and found unadjusted; it is
 * the absence of the field, and the banner it feeds simply does not render.
 */
const NO_ADJUSTMENT: PlanAdjustment = { scale: 1, reason: null };

/**
 * The sunrise ground: the warm top fading into the page over 420dp, ported
 * from the website's body gradient (globals.css:55). It is fixed to the
 * viewport rather than scrolled with the list, exactly as `background` on the
 * web body behaves, so the light stays where the light is.
 */
const SUNRISE_STOPS = [color.bgTop, color.bg] as const;
const SUNRISE_HEIGHT = 420;

/**
 * "12 runs" — the numeral and its noun in ONE node, never a bare count with the
 * word rendered beside it.
 */
function countLabel(n: number): string {
  return `${n} ${n === 1 ? "run" : "runs"}`;
}

/** The page, over the sunrise ground. Every branch below renders through it. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={SUNRISE_STOPS}
        style={styles.sunrise}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/**
 * The screen header, in the Panel hierarchy: title, then the figure, then the
 * note that says how to read the list.
 *
 * `count` is null until the payload lands, and the count is withheld at zero on
 * purpose: an empty log is Absent, and "0 runs" would state a measured fact we
 * do not have. The slot sits beside the heading rather than below it, so
 * nothing moves vertically when the figure appears.
 *
 * The note takes its own line rather than the Panel's right-hand slot: it is a
 * whole sentence, and at 360dp beside a 19px title it would have nowhere to go.
 *
 * `stale` adds ONE quiet line when a refetch failed over runs that are already
 * on screen. The full-page failure below is reserved for having nothing at all:
 * a timed-out refresh is no reason to take away a log that loaded fine.
 */
function Header({ count, stale }: { count: number | null; stale?: boolean }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Run log</Text>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Recent runs</Text>
        {count !== null && count > 0 ? (
          <Text style={styles.count}>{countLabel(count)}</Text>
        ) : null}
      </View>
      <Text style={styles.note}>
        Long runs well past your usual are flagged.
      </Text>
      {stale ? (
        <Text style={styles.note}>
          Could not reach your server just now. These are the runs last loaded.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Holds the shape of a card while the payload is in flight. It reserves the
 * header, and the stats row at its tallest — a missing pace renders a bordered
 * `Absent` slot, which is not knowable in advance. A spike is not reserved; see
 * `runCardMetrics` for why that trade flipped once the advisory grew into a
 * paragraph.
 */
function RunSkeleton() {
  return (
    <Card>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonStats} />
    </Card>
  );
}

/**
 * Holds the plan's shape while the payload is in flight — the head, then seven
 * collapsed rows, from `planWeekMetrics`.
 *
 * This exists for a tap, not for tidiness. Without it the seven rows arrive all
 * at once ABOVE the run cards and shove them most of a screen down; a thumb
 * already on its way to a run would land on a different one. The reservation is
 * approximate by construction (see `planWeekMetrics`), and the two banners are
 * not reserved at all — most weeks have neither, and holding room for both
 * would leave a permanent hole on every load to save a shift that usually does
 * not happen.
 */
function PlanSkeleton() {
  return (
    <Card padded={false}>
      <View style={styles.skeletonPlanHead} />
      {Array.from({ length: planWeekMetrics.rows }, (_, i) => (
        <View key={i} style={styles.skeletonPlanRow} />
      ))}
    </Card>
  );
}

export default function RunsScreen() {
  /*
   * One shared `/me` for every screen that needs it, and one 401 path inside
   * it — see lib/profileStore. Nothing about the load is this screen's to
   * decide any more; all it does is read the three flags.
   */
  const { profile, state, refreshing, refresh } = useProfile();
  const failed = state === "failed";

  /** Newest first. Dates are YYYY-MM-DD, so they sort lexically. */
  const runs = useMemo(
    () =>
      profile
        ? [...profile.recentRuns].sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [profile],
  );

  const planTypeByDate = useMemo(() => {
    const byDate = new Map<string, string>();
    for (const day of profile?.plan.days ?? []) byDate.set(day.date, day.type);
    return byDate;
  }, [profile]);

  // The whole-page failure is for having NOTHING. With runs already on screen
  // the failure is one line in the header instead — see `Header`.
  if (failed && !profile) {
    return (
      <Screen>
        <View style={styles.page}>
          <Header count={null} />
          <Card>
            <Text style={styles.failed}>Your runs could not be loaded.</Text>
            {/*
             * Only ever reached by a transport failure — a 401 leaves through
             * the session gate — which is exactly the kind a second attempt can
             * clear. Dropping back to the skeleton is honest about the state:
             * nothing is known yet.
             */}
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              style={styles.retry}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        </View>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <View style={styles.page}>
          <View style={styles.plan}>
            <PlanSkeleton />
          </View>
          <Header count={null} />
          <View style={styles.rows}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <RunSkeleton key={i} />
            ))}
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList<RecentRun>
        data={runs}
        keyExtractor={(run) => String(run.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        /* A refetch never dims or shimmers what is already here: the spinner
           says a request is out, the numbers stay exactly as true as they were. */
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
        /*
         * The plan rides in the list header so the whole tab is ONE scroll —
         * a second scroll view around seven rows would fight the log's.
         *
         * `taperMode` / `taperCountdown` / `adjustment` are optional on
         * `Profile.plan` because `/api/mobile/home` omits them; this screen
         * reads `/me`, which sends all three. The fallbacks are for the type,
         * not for a state the athlete can reach: a missing field means the
         * payload did not carry it, and each of the three then renders nothing
         * rather than a claim.
         */
        ListHeaderComponent={
          <>
            <View style={styles.plan}>
              <PlanWeek
                days={profile.plan.days}
                taperMode={profile.plan.taperMode ?? false}
                taperCountdown={profile.plan.taperCountdown ?? null}
                adjustment={profile.plan.adjustment ?? NO_ADJUSTMENT}
              />
            </View>
            <Header count={runs.length} stale={failed} />
          </>
        }
        /*
         * Absent, not NoRun. An empty log means the payload carried no runs —
         * "we have nothing", not "the athlete rested". `plan.days` cannot
         * upgrade it either: it is always the current Mon–Sun week and never
         * all rest, while `recentRuns` spans the whole synced history. Rest is
         * a property of one day; it can never be a property of the log.
         */
        ListEmptyComponent={<Absent label="No runs synced yet." />}
        renderItem={({ item }) => (
          <RunCard
            run={item}
            dateLabel={dayLabel(item.date)}
            sessionLabel={planTypeByDate.get(item.date)}
          />
        )}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  sunrise: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SUNRISE_HEIGHT,
  },
  /** Transparent: the gradient behind it is the ground. */
  safe: { flex: 1 },
  page: {
    flex: 1,
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
  },
  list: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  /** Matches the FlatList separator, so loading and loaded rhythm agree. */
  rows: { gap: space.md },
  separator: { height: space.md },

  header: { marginBottom: layout.section },
  /**
   * The ember signature, once per screen, on the eyebrow. `brandText`, never
   * `brand`: the fill is 2.01:1 and unreadable outdoors, while this measures
   * 4.88:1 on the page and 4.74:1 on the warm top of the gradient.
   */
  eyebrow: { ...text.micro, color: color.brandText },
  headingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
    marginTop: space.xs,
  },
  heading: { ...text.title, color: color.ink },
  /** Mono, with the noun welded on. Never a bare numeral. */
  count: { ...text.stat, color: color.ink2 },
  note: { ...text.meta, color: color.muted, marginTop: space.xs },

  failed: { ...text.base, color: color.ink2 },
  /** The same button the home screen offers on the same failure. */
  retry: {
    marginTop: space.lg,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },
  /** The plan sits on the same section rhythm as the header below it. */
  plan: { marginBottom: layout.section },
  /**
   * The plan skeleton's two shapes. `well` is the sunken fill, exactly as the
   * run skeleton uses it — and unlike `Absent` there is no dashed border and no
   * dash, so a placeholder can never be read as "not recorded".
   */
  skeletonPlanHead: {
    height: planWeekMetrics.head,
    backgroundColor: color.well,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  skeletonPlanRow: {
    height: planWeekMetrics.row,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  skeletonHeader: {
    height: runCardMetrics.headerLine,
    width: "58%",
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  skeletonStats: {
    height: runCardMetrics.statsRowAbsent,
    marginTop: runCardMetrics.gap,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
});
