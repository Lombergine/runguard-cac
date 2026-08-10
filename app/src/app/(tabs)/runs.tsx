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
 *      nothing for that day the eyebrow carries the date alone rather than a
 *      guess.
 */
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
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
 * Reserves the height of the tallest card the log can produce, so the list
 * cannot shift as data lands. Neither of the two things that make a card taller
 * — a missing pace, which renders a bordered `Absent` slot, and a spike, which
 * adds an advisory — is knowable before the payload arrives, so room is held
 * for both. See `runCardMetrics` for why over-reserving is the right trade.
 */
function RunSkeleton() {
  return (
    <Card>
      <View style={styles.skeletonEyebrow} />
      <View style={styles.skeletonStats} />
      <View style={styles.skeletonSpike} />
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
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Text style={styles.failed}>Your runs could not be loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <RunSkeleton key={i} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList<RecentRun>
        data={runs}
        keyExtractor={(run) => String(run.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
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
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    flex: 1,
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    gap: space.md,
  },
  list: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  separator: { height: space.md },
  failed: { ...text.base, color: color.ink2 },
  skeletonEyebrow: {
    height: runCardMetrics.eyebrowLine,
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
  skeletonSpike: {
    height: runCardMetrics.spikeAdvisory,
    marginTop: runCardMetrics.spikeGap,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
});
