/**
 * Data sources — is each athlete's watch data actually reaching the coach.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT SHOW ───────────────────────────────────
 * The website's `/dashboard/connect` lists every athlete's `device_token` so a
 * coach can read one out to a runner setting up the app. This screen does not,
 * and the endpoint does not send them.
 *
 * A device token is a full, non-expiring credential for one athlete's health
 * data. Putting fourteen of them on a device that lives in a pocket, gets
 * handed around, screenshots easily and syncs to a backup turns one lost phone
 * into every athlete on the team, permanently, with no revocation. Pairing
 * stays on the desktop, where the token already lives. This screen answers the
 * question a coach actually has at the track: whose data is arriving.
 *
 * ── WHY "LAST RUN", NOT "CONNECTED" ────────────────────────────────────────
 * The server sends the newest ACTIVITY per athlete. Null means no runs
 * recorded, which is NOT the same as "not connected": a paired athlete who has
 * not run yet is null, and so is one who never installed the app. So a null
 * renders as the dashed unknown with the word "no runs recorded" — never as a
 * red "disconnected", which would be a claim this data cannot support and would
 * send a coach chasing a problem that may not exist.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../../../components/Card";
import { Press } from "../../../components/Press";
import { TeamAvatar } from "../../../components/TeamAvatar";
import { ApiError } from "../../../lib/api";
import { getSources, type SourcesResponse } from "../../../lib/coachApi";
import { useSession } from "../../../lib/session";
import { color, shadow } from "../../../theme/tokens";
import { text } from "../../../theme/type";
import { layout, radius, ruleWidth, space, target } from "../../../theme/space";

/** Whole days between an ISO instant and now, floored at 0. */
function daysAgo(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/** Pre-formatted and local, per the spec's date rule. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const n = daysAgo(iso);
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (n === 0) return `today · ${day}`;
  if (n === 1) return `yesterday · ${day}`;
  return `${n} days ago · ${day}`;
}

export default function CoachSourcesScreen() {
  const router = useRouter();
  const { signOutCoach } = useSession();

  const [data, setData] = useState<SourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getSources());
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load data sources.");
    }
  }, [signOutCoach]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const quiet =
    data?.athletes.filter((a) => a.lastSync === null || daysAgo(a.lastSync) >= 7).length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DATA SOURCES</Text>
        <Text style={styles.title}>Where the numbers come from</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <Card>
            <Text style={styles.blockTitle}>Could not load data sources</Text>
            <Text style={styles.body}>{error}</Text>
          </Card>
        ) : !data ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            <Card>
              <Text style={styles.blockTitle}>Apple Health</Text>
              <Text style={styles.body}>
                Runs arrive from Apple Health — Apple Watch, Garmin, anything that
                writes to it. Athletes sign in to the RunGuard app on their own
                phone and it syncs after every workout.
              </Text>
              <Text style={styles.note}>
                Android arrives through Health Connect after the iOS launch.
              </Text>
            </Card>

            {data.team.joinCode ? (
              <Card>
                <Text style={styles.eyebrow}>TEAM CODE</Text>
                <Text style={styles.code}>{data.team.joinCode}</Text>
                <Text style={styles.note}>
                  An athlete enters this in the app to join {data.team.name ?? "your team"}.
                  It identifies the team; it is not a password and grants nobody
                  access to anyone&apos;s data.
                </Text>
              </Card>
            ) : null}

            <Text style={styles.sectionHead}>
              {quiet === 0
                ? `All ${data.athletes.length} athletes have run in the last week`
                : `${quiet} of ${data.athletes.length} have not synced a run in a week`}
            </Text>

            {data.athletes.map((a) => {
              const stale = a.lastSync !== null && daysAgo(a.lastSync) >= 7;
              return (
                <View key={a.id} style={styles.row}>
                  <TeamAvatar name={a.name} hue={a.hue} />
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{a.name}</Text>
                    {a.lastSync === null ? (
                      /* Dashed: we do not know that they are disconnected, only
                         that no run has arrived. */
                      <View style={styles.absentChip}>
                        <Text style={styles.absentText}>no runs recorded</Text>
                      </View>
                    ) : (
                      <Text style={[styles.when, stale && styles.whenStale]}>
                        Last run {whenLabel(a.lastSync)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}

            {/*
              Sign-out lives here rather than on the roster header, where the
              switcher now sits. Ending a session and moving between the two
              sides of the product are different acts, and putting them next to
              each other is how someone destroys a session meaning to switch.

              It clears ONLY the coach token: a phone may legitimately hold an
              athlete session too, and that one is not this button's business.
            */}
            <Press
              onPress={async () => {
                await signOutCoach();
                router.replace("/coach/login");
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign out of the coach view"
              style={styles.signOut}
              pressedStyle={styles.pressed}
            >
              <Text style={styles.signOutLabel}>Sign out of the coach view</Text>
            </Press>
            <Text style={styles.signOutNote}>
              Leaves any athlete session on this phone untouched.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Initials only. This product shows no photographs of minors. */
const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  safe: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: layout.page, paddingBottom: space.md },
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.title, color: color.ink, marginTop: space.xs },

  page: { paddingHorizontal: layout.page, paddingBottom: space.xxxl, gap: space.md },
  skeleton: { height: 320, borderRadius: radius.card, backgroundColor: color.well },

  blockTitle: { ...text.title, color: color.ink },
  body: { ...text.base, color: color.ink2, marginTop: space.sm },
  note: { ...text.meta, color: color.muted, marginTop: space.sm },
  code: { ...text.stat, color: color.brandText, marginTop: space.xs },

  sectionHead: { ...text.meta, color: color.muted, marginTop: space.sm },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  rowText: { flex: 1, alignItems: "flex-start", gap: space.xs },
  name: { ...text.baseSemi, color: color.ink },
  when: { ...text.meta, color: color.muted },
  whenStale: { color: color.watchText },
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

  signOut: {
    marginTop: space.lg,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    backgroundColor: color.card,
  },
  signOutLabel: { ...text.baseSemi, color: color.unusualText },
  signOutNote: { ...text.meta, color: color.muted, textAlign: "center" },
});
