/**
 * Data sources — where the athlete's numbers come from.
 *
 * Mirrors the content of `website/src/app/dashboard/connect/page.tsx`, not its
 * layout: that page is COACH-facing and renders every athlete's device token in
 * a table. Nothing here links to it, and nothing here shows a token.
 *
 * The honesty rules this screen exists to obey:
 *
 *  - Apple never discloses READ denial. `requestAuthorization` resolves
 *    identically whether the athlete allowed everything or nothing, so a
 *    completed permission prompt is NOT a connection. The only evidence this
 *    app has is what a sync actually read, which is why the figures below say
 *    "read" and "new" rather than a green tick.
 *  - `imported.workouts === 0` means nothing was NEW (the server inserts with
 *    ON CONFLICT DO NOTHING). On the second sync of an unchanged week that is
 *    the correct answer, and it must not be styled as a failure.
 *  - Strava's connection is a redirect the SERVER performs, and this app has no
 *    way to check whether the server is configured for it. So the panel reports
 *    the one fact it actually has — whether the server currently counts Strava
 *    among the athlete's sources — and says plainly that the rest happens on
 *    the web app.
 *  - Anything unknown renders through <Absent/>. A source list that failed to
 *    load must never look like an empty one.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { Absent } from "../components/Nothing";
import { Card } from "../components/Card";
import { Stat } from "../components/Stat";
import { getProfile, isUnauthorized } from "../lib/api";
import { dayLabel, localDay, timeLabel } from "../lib/dates";
import {
  availability,
  getState,
  HealthError,
  requestPermissions,
  sync,
  type Availability,
  type HealthState,
} from "../lib/health";
import type { Profile } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * `connectedSources` is on the /api/mobile/me payload
 * (`website/src/lib/profile.ts:120`) but is not declared in ../lib/types.ts, so
 * it is widened here rather than redefined. When types.ts grows the field this
 * alias collapses to a no-op and should be deleted.
 *
 * NOTE: /api/mobile/home does NOT carry it — that route enumerates its keys
 * explicitly — so this screen has to pay for the full /me payload.
 */
type ProfileWithSources = Profile & { connectedSources?: string[] };

/**
 * `connectedSources()` returns this single entry instead of an empty array when
 * an athlete has no data at all. It is a placeholder, not the name of a source,
 * so it must not be rendered as one.
 */
const NO_SOURCES = "No data yet";

/** The website's `--ember` stops and its 135°, as in app/pair.tsx. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/** "6:12am · Tue 14 Oct", composed from lib/dates. Never derived in a component. */
function syncLabel(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${timeLabel(d)} · ${dayLabel(localDay(d))}`;
}

/** Why HealthKit cannot be used, in words the athlete can act on. */
function explainUnavailable(a: Exclude<Availability, { ok: true }>): string {
  switch (a.reason) {
    case "notIos":
      return "Apple Health exists only on iPhone, so there is nothing for RunGuard to read on this device.";
    case "noModule":
      return "This build of RunGuard cannot open Apple Health. Reading Health data needs a build that carries Apple's HealthKit entitlement, which Expo Go and the iOS Simulator do not.";
    case "noHealthStore":
      return "This device has no Health store. Apple Health is unavailable on the Simulator and on some iPads, and there is no data there to read.";
  }
}

function explainFailure(err: unknown): string {
  const kind = err instanceof HealthError ? err.kind : "server";
  switch (kind) {
    case "unavailable":
      return "Apple Health could not be opened on this device. Nothing was sent.";
    case "read":
      return "Apple Health did not return your data. Nothing was sent.";
    case "unauthorized":
      return "This device is no longer paired with RunGuard. Pair it again, then sync.";
    case "network":
      return "Could not reach the RunGuard server. Your data stayed on this phone.";
    case "server":
      // Deliberately encouraging: every insert dedupes and every metric day is
      // an upsert, so a retry finishes the job rather than doubling it.
      return "The server did not finish the upload. Syncing again is safe — nothing is stored twice.";
  }
}

export default function ConnectScreen() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [sources, setSources] = useState<string[] | null>(null);
  const [sourcesFailed, setSourcesFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const avail = availability();

  const loadSources = useCallback(async () => {
    try {
      const profile = (await getProfile()) as ProfileWithSources;
      setSources(profile.connectedSources ?? []);
      setSourcesFailed(false);
    } catch (err) {
      // A 401 and a dead LAN address are both "we do not know what the server
      // thinks", and both must render absent rather than as an empty list.
      setSources(null);
      setSourcesFailed(true);
      if (isUnauthorized(err)) setFailure(explainFailure(new HealthError("unauthorized")));
    }
  }, []);

  useEffect(() => {
    // Inside an async closure rather than the effect body: both of these settle
    // after an await, so neither renders synchronously off the mount.
    void (async () => {
      setHealth(await getState());
      await loadSources();
    })();
  }, [loadSources]);

  /** Connect = ask, then immediately read. The read is the only real evidence. */
  const connect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await requestPermissions();
      await sync();
    } catch (err) {
      setFailure(explainFailure(err));
    }
    setHealth(await getState());
    await loadSources();
    setBusy(false);
  }, [busy, loadSources]);

  const syncNow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await sync();
    } catch (err) {
      setFailure(explainFailure(err));
    }
    setHealth(await getState());
    await loadSources();
    setBusy(false);
  }, [busy, loadSources]);

  const last = health?.lastSync ?? null;
  const lastAt = last ? syncLabel(last.at) : null;
  const readNothing = last !== null && last.read.workouts === 0 && last.read.metrics === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>DATA SOURCES</Text>
        <Text style={styles.heading}>Where your numbers come from</Text>
        <Text style={styles.lede}>
          RunGuard reads your workouts and your overnight recovery figures from Apple
          Health on this phone, and sends them to your team&apos;s RunGuard server.
        </Text>

        {/* ── Apple Health ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Card>
            <View style={styles.head}>
              <Text style={styles.title}>Apple Health</Text>
              <Text style={styles.note}>
                {lastAt ? `Last synced ${lastAt}` : "Never synced"}
              </Text>
            </View>

            {!avail.ok ? (
              <Text style={styles.body}>{explainUnavailable(avail)}</Text>
            ) : (
              <>
                <Text style={styles.body}>
                  {!health?.requestedAt
                    ? "Not connected. RunGuard has not asked for access to Apple Health on this phone yet."
                    : last === null
                      ? "Access has been requested, but nothing has been read yet. Sync to find out what Apple Health will hand over."
                      : readNothing
                        ? "Apple Health returned nothing. That is either an empty Health app, or access that was declined — Apple does not tell an app which, so RunGuard cannot claim to be connected."
                        : "Reading from Apple Health on this phone."}
                </Text>

                <Pressable
                  style={styles.action}
                  onPress={() => void (health?.requestedAt ? syncNow() : connect())}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                >
                  {({ pressed }) => (
                    <>
                      {/* Pressing drops the gradient to the flat `brandStrong`
                          ground beneath it, exactly as app/pair.tsx does. */}
                      {pressed ? null : (
                        <LinearGradient
                          colors={color.ember}
                          locations={EMBER_STOPS}
                          start={EMBER_START}
                          end={EMBER_END}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Text style={styles.actionLabel}>
                        {busy
                          ? "Syncing…"
                          : health?.requestedAt
                            ? "Sync now"
                            : "Connect Apple Health"}
                      </Text>
                    </>
                  )}
                </Pressable>

                {last ? (
                  <View style={styles.figures}>
                    <View style={styles.row}>
                      <View style={styles.cell}>
                        <Stat label="WORKOUTS READ" value={String(last.read.workouts)} />
                      </View>
                      <View style={styles.cell}>
                        <Stat label="DAYS OF READINGS" value={String(last.read.metrics)} />
                      </View>
                    </View>
                    <View style={styles.row}>
                      <View style={styles.cell}>
                        <Stat label="NEW WORKOUTS" value={String(last.imported.workouts)} />
                      </View>
                      <View style={styles.cell} />
                    </View>
                    {/* The caveat that stops a zero reading as a failure. */}
                    <Text style={styles.caption}>
                      New counts only the workouts your server had not already stored.
                      Zero means nothing had changed since the last sync.
                    </Text>
                  </View>
                ) : null}

                {failure ? (
                  <Text style={styles.problem} accessibilityLiveRegion="polite">
                    {failure}
                  </Text>
                ) : null}
              </>
            )}
          </Card>
        </View>

        {/* ── Strava ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Card>
            <View style={styles.head}>
              <Text style={styles.title}>Strava</Text>
              <Text style={styles.note}>Set up on the web app</Text>
            </View>
            <Text style={styles.body}>
              {sources === null
                ? "RunGuard could not check whether your Strava is linked."
                : sources.includes("Strava")
                  ? "Linked. Your Strava runs arrive through the RunGuard server, not through this app."
                  : "Not linked."}
            </Text>
            {/*
              The web flow is a server redirect to /api/strava/connect, which
              needs STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET set on the server.
              The app has no endpoint that reports whether they are, so this
              copy must not claim either way — and it must not deep-link to
              /dashboard/connect, which renders device tokens.
            */}
            <Text style={styles.body}>
              Linking Strava happens on the RunGuard web app, and it only works once
              your team&apos;s server has been set up for it. This app cannot start that,
              or check it.
            </Text>
          </Card>
        </View>

        {/* ── Connected sources ────────────────────────────────────────── */}
        <View style={styles.section}>
          <Card>
            <View style={styles.head}>
              <Text style={styles.title}>Connected sources</Text>
              <Text style={styles.note}>As your server sees them</Text>
            </View>
            {sources === null ? (
              <Absent
                label={
                  sourcesFailed
                    ? "Could not reach your server"
                    : "Checking with your server"
                }
              />
            ) : sources.length === 0 || sources.includes(NO_SOURCES) ? (
              <Absent label="Nothing has reported data yet" />
            ) : (
              <View style={styles.chips}>
                {sources.map((s) => (
                  <Text key={s} style={styles.chip}>
                    {s}
                  </Text>
                ))}
              </View>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
  },
  eyebrow: { ...text.micro, color: color.muted },
  heading: { ...text.title, color: color.ink, marginTop: space.sm },
  lede: { ...text.base, color: color.ink2, marginTop: space.md },
  section: { marginTop: layout.section },

  /** The Panel head: title left, note right, both on the same baseline. */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.md,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted },

  body: { ...text.base, color: color.ink2, marginTop: space.sm },

  /** The ember signature, on the one thing you tap. See app/pair.tsx. */
  action: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    marginTop: space.xl,
    overflow: "hidden",
  },
  /** INK on the ember, never white — 5.25:1 on the pressed `brandStrong`. */
  actionLabel: { ...text.baseSemi, color: color.ink },

  figures: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
    gap: space.lg,
  },
  row: { flexDirection: "row", gap: space.md },
  cell: { flex: 1 },
  caption: { ...text.meta, color: color.muted },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2, marginTop: space.md },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    ...text.baseSemi,
    color: color.ink2,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    overflow: "hidden",
  },
});
