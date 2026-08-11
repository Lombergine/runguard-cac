/**
 * The run log.
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
import { ReactNode, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../../components/Card";
import { Absent } from "../../components/Nothing";
import { RunCard, runCardMetrics } from "../../components/RunCard";
import { getProfile } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import type { Profile, RecentRun } from "../../lib/types";
import { layout, radius, space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

/** How many placeholder cards to hold while the profile is in flight. */
const SKELETON_ROWS = 3;

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
 */
function Header({ count }: { count: number | null }) {
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

export default function RunsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  if (failed) {
    return (
      <Screen>
        <View style={styles.page}>
          <Header count={null} />
          <Card>
            <Text style={styles.failed}>Your runs could not be loaded.</Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <View style={styles.page}>
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
        ListHeaderComponent={<Header count={runs.length} />}
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
