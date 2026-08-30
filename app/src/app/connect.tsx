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
 *  - Apple Health is the only source, so this screen reports no link state it
 *    could not verify anyway.
 *  - Anything unknown renders through <Absent/>. A source list that failed to
 *    load must never look like an empty one.
 *
 * WHY THIS SCREEN ASKS THE SESSION GATE.
 *
 * Half of this screen never talks to the server: the last-sync line and the
 * READ / NEW figures come out of `runguard.health.state` in SecureStore, so
 * before the gate existed they rendered the PREVIOUS athlete's numbers to
 * whoever held the phone next. `clearAllStoredState()` now erases that key on
 * sign-out, which closes the leak at its source; the checks below are the
 * second layer. Every athlete-derived value here is gated on
 * `useSession().status === "in"` at RENDER time, not merely at fetch time, so
 * no in-flight read that resolves after the gate shuts can put anything back
 * on the glass.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";

import { useScreenHeader } from "../theme/header";
import { Absent } from "../components/Nothing";
import { ListRow } from "../components/List";
import { Panel } from "../components/Panel";
import { Stat } from "../components/Stat";
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
import { useProfile } from "../lib/profileStore";
import { useSession } from "../lib/session";
import type { Profile } from "../lib/types";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
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
  const { status, signOut } = useSession();
  const signedIn = status === "in";

  /*
   * `connectedSources` comes off the shared `/me` (lib/profileStore) rather
   * than a fetch of this screen's own — including the 401 branch, which used to
   * be spelled out here and in four other screens. The store signs out on 401
   * and the gate unmounts this screen with the rest of the authed group.
   */
  const { profile, state, refreshing, refresh } = useProfile();

  const [health, setHealth] = useState<HealthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const avail = availability();

  /*
   * Still gated on `signedIn` at RENDER time, not merely at fetch time — the
   * reason is in the file header, and it holds for a shared store exactly as it
   * held for a local fetch. `sources === null` covers both "not loaded yet" and
   * "could not be loaded", and both must render absent rather than as an empty
   * list: a source list that failed must never look like a source list that is
   * empty.
   */
  const sources: string[] | null =
    signedIn && profile ? ((profile as ProfileWithSources).connectedSources ?? []) : null;
  const sourcesFailed = state === "failed";
  /**
   * The sources that are real names, or null.
   *
   * Derived once because the panel below asks the same question twice: which
   * branch to render, and whether the card should carry its own padding (rows
   * are full-bleed and bring their own; an <Absent/> slot is not and does not).
   * Two spellings of "is there anything to list" is how one of them ends up
   * disagreeing with the other. `NO_SOURCES` is a placeholder, not a name — see
   * its declaration — so a list containing it is an empty list.
   */
  const listedSources =
    sources && sources.length > 0 && !sources.includes(NO_SOURCES) ? sources : null;

  useEffect(() => {
    if (!signedIn) {
      // Not a fetch guard — a scrub. The gate normally unmounts this screen
      // outright, so this branch covers the frames before that lands: drop
      // every athlete-derived value rather than let one outlive the session.
      setHealth(null);
      setFailure(null);
      return;
    }
    // Inside an async closure rather than the effect body: this settles after
    // an await, so it does not render synchronously off the mount.
    void (async () => {
      setHealth(await getState());
    })();
  }, [signedIn]);

  /**
   * A failed sync, with its 401 acted on HERE.
   *
   * `isUnauthorized` FIRST and `signOut()` UNGUARDED — the rule lib/profileStore
   * states and calendar.tsx once got wrong. `postIngest` throws this kind on a
   * 401 from /api/mobile/ingest and on a missing token, and both mean this
   * device no longer has a session.
   *
   * This used to be left entirely to the `refresh()` below to discover, on the
   * theory that a token /api/mobile/ingest rejects will be rejected by /me too.
   * That is a guarantee resting on convention rather than structure, and it has
   * a hole: `refresh()` JOINS an already in-flight `/me` rather than issuing a
   * new one, so a request sent moments before the token was revoked can resolve
   * 200 and sign nobody out — leaving a revoked device signed in, with every
   * other tab still rendering the previous athlete's cached numbers. A screen
   * holding direct proof of a dead credential must not delegate that proof.
   */
  const onFailure = useCallback(
    (err: unknown) => {
      if (err instanceof HealthError && err.kind === "unauthorized") void signOut();
      setFailure(explainFailure(err));
    },
    [signOut]
  );

  /** Connect = ask, then immediately read. The read is the only real evidence. */
  const connect = useCallback(async () => {
    if (busy || !signedIn) return;
    setBusy(true);
    setFailure(null);
    try {
      await requestPermissions();
      await sync();
    } catch (err) {
      onFailure(err);
    }
    setHealth(await getState());
    // `refresh()`, not `invalidate()`: a sync can add the very first source, so
    // this has to fetch even when `/me` has never landed on this device.
    await refresh();
    setBusy(false);
  }, [busy, signedIn, refresh, onFailure]);

  const syncNow = useCallback(async () => {
    if (busy || !signedIn) return;
    setBusy(true);
    setFailure(null);
    try {
      await sync();
    } catch (err) {
      onFailure(err);
    }
    setHealth(await getState());
    await refresh();
    setBusy(false);
  }, [busy, signedIn, refresh, onFailure]);

  // The gate, applied where it cannot be raced: a stale `health` — one read
  // before the session ended, or resolved after it — cannot reach the screen,
  // because `last` is only ever derived while signed in.
  const last = signedIn ? (health?.lastSync ?? null) : null;
  const lastAt = last ? syncLabel(last.at) : null;
  const readNothing = last !== null && last.read.workouts === 0 && last.read.metrics === 0;
  /**
   * Entries the server REFUSED, when there were any and when it said so.
   *
   * `rejected` undefined means a record written before the count existed —
   * UNKNOWN, not zero — and lands here as null exactly like "none were refused"
   * does. That collapse is deliberate and it is the safe direction: the only
   * thing either state suppresses is a warning, so an unknown never becomes a
   * reassurance, and the next sync fills the field in.
   */
  const refused =
    last?.rejected && (last.rejected.workouts > 0 || last.rejected.metrics > 0)
      ? last.rejected
      : null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Pushed from Settings, so without this the only way back was the iOS
          edge-swipe — invisible, untappable, and absent on Android. */}
      <Stack.Screen options={useScreenHeader("Connect")} />
      <ScrollView
        contentContainerStyle={styles.page}
        /*
         * Required by `screenHeader`, not decoration: without it the iOS large
         * title never collapses and sits permanently above content scrolling
         * behind it. See theme/header.ts.
         */
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        {/*
          No eyebrow and no in-content heading. `screenHeader` draws the iOS
          large title, so this screen used to carry TWO headings — "Connect" in
          the bar and "DATA SOURCES / Where your numbers come from" immediately
          under it. theme/header.ts names this file for exactly that doubling.
          The native title is the heading; the lede below is the first thing the
          screen actually claims.
        */}
        <Text style={styles.lede}>
          RunGuard reads your workouts and your overnight recovery figures from Apple
          Health on this phone, and sends them to your team&apos;s RunGuard server.
        </Text>
        {/* One quiet line. The source list below it is the last one the server
            confirmed, and it is still what the server last said. */}
        {sourcesFailed && sources !== null ? (
          <Text style={styles.stale}>
            Could not reach your server just now. This is what it last reported.
          </Text>
        ) : null}

        {/* ── Apple Health ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          {/*
            `Panel`, not a locally drawn head. Panel.tsx counts nine files that
            spelled this title-left, note-right shape out by hand from the same
            tokens; this was one of them, and one of the ones that had drifted
            to a 19pt title rather than the website's 14.

            The note is the second half of the old head: "Never synced" is a
            claim about an athlete's history and must not be made on their
            behalf once they are gone, so with no session it says what it
            actually knows instead.
          */}
          <Panel
            title="Apple Health"
            note={lastAt ? `Last synced ${lastAt}` : signedIn ? "Never synced" : "Signed out"}
          >
            {!avail.ok ? (
              <Text style={styles.body}>{explainUnavailable(avail)}</Text>
            ) : (
              <>
                <Text style={styles.body}>
                  {!signedIn
                    ? "Sign in on this phone to see what RunGuard has read from Apple Health."
                    : !health?.requestedAt
                      ? "Not connected. RunGuard has not asked for access to Apple Health on this phone yet."
                      : last === null
                        ? "Access has been requested, but nothing has been read yet. Sync to find out what Apple Health will hand over."
                        : readNothing
                          ? "Apple Health returned nothing. That is either an empty Health app, or access that was declined — Apple does not tell an app which, so RunGuard cannot claim to be connected."
                          : "Reading from Apple Health on this phone."}
                </Text>

                {/* No session, no button: a sync reads this phone's Health data
                    and posts it under whatever token is still on the device. */}
                {signedIn ? (
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
                ) : null}

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
                    {/* Refusals, when there were any. Without this the figures
                        above cannot be told apart from a healthy repeat sync:
                        both read N and import 0, and the caption below used to
                        say a zero could only mean "nothing had changed". */}
                    {refused ? (
                      <Text style={styles.problem} accessibilityLiveRegion="polite">
                        Your server refused{" "}
                        {/*
                          The counts are numerals sitting in prose, so they
                          change FACE — mono and tabular — while keeping the
                          sentence's size and colour. The thing counted is
                          welded into the same node ("3 workouts", never "3" +
                          "workouts"); "of readings" is a qualifier, not a unit,
                          so it stays in the body face.
                        */}
                        {refused.workouts > 0 ? (
                          <Text style={styles.figure}>
                            {`${refused.workouts} workout${refused.workouts === 1 ? "" : "s"}`}
                          </Text>
                        ) : null}
                        {refused.workouts > 0 && refused.metrics > 0 ? " and " : ""}
                        {refused.metrics > 0 ? (
                          <>
                            <Text style={styles.figure}>
                              {`${refused.metrics} day${refused.metrics === 1 ? "" : "s"}`}
                            </Text>
                            {" of readings"}
                          </>
                        ) : null}{" "}
                        as unreadable. They were not stored, and they are not counted as
                        new.
                      </Text>
                    ) : null}
                    {/* The caveat that stops a zero reading as a failure. Its
                        second sentence is only true when nothing was refused. */}
                    <Text style={styles.caption}>
                      New counts only the workouts your server had not already stored.
                      {refused ? "" : " Zero means nothing had changed since the last sync."}
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            {/* OUTSIDE the availability branch, deliberately. The 401 wording
                ("no longer paired") is set by a call to the server, which this
                screen makes on every device — including the ones where Apple
                Health is unavailable. Nested inside `avail.ok` it was
                unreachable on Android, in Expo Go and on the Simulator: the
                one message that explains why nothing loads, invisible on the
                devices most likely to see it. */}
            {failure ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {failure}
              </Text>
            ) : null}
          </Panel>
        </View>

        {/* ── Connected sources ────────────────────────────────────────── */}
        <View style={styles.section}>
          {/*
            `padded` follows the CONTENT, the way PrTable does it: a list of
            sources is full-bleed rows that inset their own separators and set
            their own 52pt height, while every other state here is a single
            <Absent/> slot that needs the card's normal padding around it.
          */}
          <Panel
            title="Connected sources"
            note="As your server sees them"
            padded={listedSources === null}
          >
            {!signedIn ? (
              // Not "nothing has reported data" — that would be a claim about an
              // athlete we are not entitled to describe. Dashed: we don't know.
              <Absent label="Not signed in on this phone" />
            ) : sources === null ? (
              <Absent
                label={
                  sourcesFailed
                    ? "Could not reach your server"
                    : "Checking with your server"
                }
              />
            ) : listedSources === null ? (
              <Absent label="Nothing has reported data yet" />
            ) : (
              /*
                Wrapped in ONE view rather than returned as loose children:
                `Panel` puts a 12pt gap between its children, which would strand
                each row's separator in the middle of a band of card instead of
                pooling the rows into a continuous list.

                The rows are inert — no `onPress`, so no chevron, no press flash
                and no role. A source is a fact the server reported, and there is
                nothing underneath it to open. See List.tsx's one non-cosmetic
                rule.
              */
              <View>
                {listedSources.map((src, i) => (
                  <ListRow
                    key={src}
                    title={src}
                    isLast={i === listedSources.length - 1}
                  />
                ))}
              </View>
            )}
          </Panel>
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
  /**
   * The screen's opening sentence, and now its first element — the eyebrow and
   * the 19pt heading above it are gone with the doubled heading. No
   * `marginTop`: the page's own padding already spaces it.
   */
  lede: { ...text.base, color: color.ink2 },
  /** The stale-data line. Quiet by construction: the size and colour of a note. */
  stale: { ...text.meta, color: color.muted, marginTop: space.md },
  section: { marginTop: layout.section },

  /**
   * No `marginTop` here or on `problem` below. `Panel` carries a 12pt `gap`, so
   * every direct child is already spaced from the one above it, and the margins
   * these used to set were laid on TOP of that gap once the hand-written head
   * became a Panel. Where a child still needs more than 12, it now asks for the
   * DIFFERENCE rather than the whole distance.
   */
  body: { ...text.base, color: color.ink2 },

  /**
   * The ember signature, on the one thing you tap. See app/pair.tsx.
   *
   * No `dim` and no `rowPress`: an ember button drops its GRADIENT to the flat
   * `brandStrong` ground beneath, which is the richer signal and the one the
   * four other ember screens use. theme/press.ts says so explicitly.
   *
   * `space.md` + the Panel's 12pt gap keeps the 24pt of air this button had
   * before the Panel existed.
   */
  action: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    // The squircle iOS draws itself, rather than a circular arc.
    borderCurve: "continuous",
    marginTop: space.md,
    overflow: "hidden",
  },
  /** INK on the ember, never white — 5.25:1 on the pressed `brandStrong`. */
  actionLabel: { ...text.baseSemi, color: color.ink },

  /**
   * `space.xs` + the Panel's 12pt gap puts 16pt above the rule to match the
   * 16pt below it — the rule reads as a divider between two blocks rather than
   * as an underline on the button.
   */
  figures: {
    marginTop: space.xs,
    paddingTop: space.lg,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
    gap: space.lg,
  },
  row: { flexDirection: "row", gap: space.md },
  cell: { flex: 1 },
  caption: { ...text.meta, color: color.muted },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2 },

  /**
   * A numeral inside a sentence. Keeps the surrounding size and colour and
   * changes only the face, so a count reads as a figure rather than a word —
   * the same span the other screens use (chat, stats, races, WeekProgress).
   */
  figure: { fontFamily: font.mono, ...tabular },
});
