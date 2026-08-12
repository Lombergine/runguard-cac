/**
 * Home — the check-in hero, and what the check-in unlocks. See
 * ../../../../docs/visual-spec.md § "The signature" and ../../theme/tokens.ts,
 * whose sunrise palette supersedes that document's colours.
 *
 * The inversion: the hero is the check-in PROMPT, not readiness. Readiness is
 * demoted to a consequence of having checked in.
 *
 * BEFORE a check-in the screen is one question, three targets, a lot of air,
 * and a footer reading "— unknown". The emptiness is the product's main call to
 * action and nothing is stacked above it.
 *
 * AFTER a check-in the same space carries the day's picture, in the shape the
 * web portal uses (`website/src/components/athlete/tabs.tsx`, HomeTab): the
 * receipt, then a hero panel holding readiness with its verdict and the insight
 * paragraph, then the recovery tiles, then weekly mileage, today's session and
 * the next race.
 *
 * WHAT THE ATHLETE IS NOT SHOWN. `prePractice` does not appear on this screen
 * at all. It is a coach-facing reading — the web app renders it only on
 * `dashboard/athlete/[id]` — and stacked under readiness it produced a live
 * contradiction: "73/100 · Good to go" in green directly above "unusual — your
 * shin was 7/10" in red, two true statements telling the athlete opposite
 * things. The prose line under readiness is `aiInsight`, which is what the
 * website puts there. `Advisory` and `StatusDot` are untouched and still ship
 * in /gallery.
 *
 * Three things this screen is still careful about:
 *
 *  1. Readiness renders ONLY through readinessState(). The server sends 100 for
 *     an athlete it knows nothing about, so `profile.readiness` is never read
 *     here (visual-spec non-negotiable #6). The pre-check-in footer is
 *     structurally incapable of printing a number.
 *  2. Every date is a pre-formatted local string from lib/dates. A check-in
 *     loaded from the server carries a day but NO time of day, so its receipt
 *     shows the day alone — inventing a clock time would be inventing data.
 *  3. A blank is never a zero. `weekKm` is always a number and the recovery
 *     readings are always present as keys, so each block is gated on the flag
 *     that says whether the figure was measured at all — `hasActivityHistory`
 *     and `recovery.hasData` — and renders <Absent/> when it was not.
 */
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";

import {
  CheckInCard,
  CheckInCardSkeleton,
  SorenessList,
  type LoggedSoreness,
  type SleepAnswer,
} from "../../components/CheckInCard";
import { CheckInReceipt } from "../../components/CheckInReceipt";
import { Absent } from "../../components/Nothing";
import { Tile } from "../../components/Tile";
import { Notifications } from "../../components/Notifications";
import { NextRaceBlock, TodayBlock } from "../../components/TodayBlock";
import { WeekProgress } from "../../components/WeekProgress";
import { ApiError, getHome, isUnauthorized, postCheckin } from "../../lib/api";
import { getBodyPart, sorenessLabel, type Side } from "../../lib/bodyParts";
import { useInvalidateProfile } from "../../lib/profileStore";
import {
  readinessBand,
  readinessValue,
  readinessVerdict,
  type ReadinessBand,
} from "../../lib/readinessVerdict";
import { dayLabel, localDay, receiptLabel } from "../../lib/dates";
import { checkedInToday, readinessState } from "../../lib/readiness";
import type {
  ProfileWithNextRace,
  ReadinessState,
  RecoverySnapshot,
} from "../../lib/types";
import { duration, layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/**
 * "How did you sleep?" maps to `energy`, which is the only self-report field
 * readinessScore() reads (website/src/lib/engine.ts: 6/10 is its neutral
 * point). There is no sleep column on a check-in row.
 */
const ENERGY_BY_SLEEP: Record<SleepAnswer, number> = { bad: 3, ok: 6, good: 9 };

/**
 * The three sides a lateral part can be filed under, and what each one
 * SUPERSEDES when it is logged.
 *
 * `both` replaces separately-logged left and right; either single side makes a
 * prior `both` stale. This is the website's rule (`widgets.tsx:159-165`) and it
 * is not cosmetic: a supersede that does not land leaves a score on the coach's
 * screen that the athlete believes they replaced.
 *
 * The website skips a clear whose key it does not think is set. This does not:
 * the clears are emitted UNCONDITIONALLY, because the only thing that could
 * license skipping one is a local mirror of the server, and trusting a mirror
 * over the server is the whole shape of the bug. A DELETE of a row that is not
 * there costs one request and is a no-op; a skipped DELETE of a row that IS
 * there is a stale soreness nobody will notice.
 */
function supersededBy(part: string, side: Side | null): string[] {
  if (side === null || getBodyPart(part)?.lateral !== true) return [];
  return side === "both"
    ? [sorenessLabel(part, "left"), sorenessLabel(part, "right")]
    : [sorenessLabel(part, "both")];
}

/**
 * The verdict is a GLYPH, so it takes the text-safe half of each accent pair.
 * `readinessColor()` returns the FILL values, which are the website's own hex:
 * `watch` is 3.2:1 on white and `ok` 3.3:1 — fine for a gauge ring, under the
 * floor for a word read at 6am. These three measure 5.13:1, 5.18:1 and 5.21:1
 * on `card`.
 */
const VERDICT_COLOR: Record<ReadinessBand, string> = {
  under: color.unusualText,
  partial: color.watchText,
  recovered: color.okText,
};

const STAT_LINE = text.stat.lineHeight as number;

/** The website's `--ember`: `linear-gradient(135deg, …)` with a stop at 45%. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

export default function CheckInScreen() {
  const router = useRouter();
  /**
   * `invalidate` ONLY. This screen's own data comes from the 5.3 KB `/home`,
   * and it stays that way — `useProfile()` here would trip the shared store's
   * lazy first fetch and pull 57 KB of `/me` on every cold start for a payload
   * nothing on this screen renders. What a check-in does change is what `/me`
   * says about soreness and readiness, so the screens backed by it are told
   * their copy is out of date.
   */
  const invalidateProfile = useInvalidateProfile();
  const [profile, setProfile] = useState<ProfileWithNextRace | null>(null);
  const [loadError, setLoadError] = useState<"none" | "unpaired" | "failed">("none");
  /** Set only when this session submitted the check-in — the one time we know. */
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  /**
   * The athlete asked to add soreness AFTER today's check-in was already done.
   * Suppresses the receipt branch so the card comes back; see the control there.
   */
  const [reopened, setReopened] = useState(false);
  /**
   * THE MIRROR OF WHAT THE SERVER HOLDS, keyed "left knee" → 0–10.
   *
   * A key is added only after its POST has returned, and removed only after its
   * clear has. Everything the athlete sees about soreness — the lit regions on
   * the figure, the side chips, the readout, and finally the receipt — is
   * rendered from this and from nothing else, so there is no draft state that a
   * receipt could describe as though it had been written.
   *
   * IT IS SEEDED FROM `profile.todaySoreness` ON LOAD, and it has to be. It
   * used to start empty, on the reasoning that a soreness row creates a
   * `checkins` row (`upsertCheckinSoreness` → `upsertCheckin`) and so any
   * soreness stored for today implied `todayCheckin`, which collapsed this
   * screen to the receipt. That stopped being true the moment the gate became
   * `checkedInToday` (lib/readiness.ts): a soreness-only write leaves `rpe`,
   * `energy` and `motivation` all NULL, so the row no longer opens the gate and
   * this card renders WITH soreness already on the server — after the athlete
   * scored a knee in the browser, or scored one here and relaunched the app.
   *
   * An empty mirror in that state was not a cosmetic gap. It drew the figure
   * with no lit region, told the athlete "Not scored yet." over a row that was
   * scored, took the tap-to-clear gesture away from those rows, hid a
   * failed supersede (`held` below is computed from this map), and finished by
   * printing "No soreness reported." on a receipt for a day that had soreness
   * reported. Seeding from the server is what this map always claimed to be.
   */
  const [logged, setLogged] = useState<LoggedSoreness>({});
  /**
   * Keys whose supersede clear failed. They are STILL IN `logged`, because they
   * are still on the server; this list is what lets the card and the receipt
   * say so out loud instead of quietly reporting a clean write.
   */
  const [uncleared, setUncleared] = useState<string[]>([]);
  /** Why the last soreness write did not do what it said. */
  const [sorenessError, setSorenessError] = useState<string | null>(null);
  /**
   * What the server actually took, set only after every call succeeded. The
   * receipt describes this and nothing else — it must never name soreness the
   * server does not hold.
   */
  const [stored, setStored] = useState<{
    entries: [string, number][];
    uncleared: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  /**
   * Bumped by "Try again", and the ONLY thing that re-runs the load.
   *
   * Without it the button cleared `loadError` and nothing else: the effect's
   * deps held one stable ref, so it never ran a second time, `profile` stayed
   * null, and the screen fell to the skeleton branch and stayed there. A
   * retry that renders a permanent loading state is worse than no retry —
   * it reads as "still working" for a request that was never made.
   */
  const [reloadKey, setReloadKey] = useState(0);

  // Starts opaque: nothing on this screen has an entrance animation. It is only
  // driven for the 180ms reveal after a check-in.
  const reveal = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;
    getHome()
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        // Only the FIRST load seeds. `finish()` refetches into `setProfile`
        // directly, by which point `stored` has already been captured and the
        // card is gone — re-seeding there would rewrite a mirror nothing reads.
        // `todaySoreness` is the server's own list of today's rows, keyed in
        // the same "left knee" form `sorenessLabel` produces.
        setLogged(
          Object.fromEntries((p.todaySoreness ?? []).map((s) => [s.part, s.severity]))
        );
      })
      .catch((err: unknown) => {
        if (alive) setLoadError(isUnauthorized(err) ? "unpaired" : "failed");
      });
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduceMotion(on);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [reveal, reloadKey]);

  /**
   * ONE ROW PER REQUEST, plus its supersedes. The route stores a single
   * `sorenessPart` per call (lib/api.ts, `CheckinInput`), and the part and the
   * severity are mandatory together — `severity: null` is the explicit CLEAR,
   * never a way of leaving a field out.
   *
   * The order matters. The row the athlete asked for is written FIRST; only
   * once it has landed are the rows it supersedes cleared. Clearing first would
   * mean a failure between the two steps left the athlete with neither the old
   * score nor the new one.
   *
   * Every outcome is reported for what it is:
   *   the write failed          → nothing changed, and the sentence says so
   *   the write landed          → the mirror takes it
   *   a supersede clear failed  → the mirror KEEPS the superseded row, which is
   *                               the truth, and the key is remembered so the
   *                               card and the receipt both name it
   */
  async function logSoreness(part: string, side: Side | null, severity: number | null) {
    const key = sorenessLabel(part, side);
    const supersedes = severity === null ? [] : supersededBy(part, side);
    // Only rows we believe are actually set can be left stale by a failed
    // clear; a failed DELETE of a row that was never there has cost nothing.
    const held = supersedes.filter((other) => logged[other] !== undefined);

    setSubmitting(true);
    setSorenessError(null);
    try {
      await postCheckin({ sorenessPart: key, sorenessSeverity: severity });
    } catch (err) {
      // The reason, not just the outcome. This catch was bare, so a revoked
      // token, a timed-out request and a BASE_URL pointing at localhost from a
      // physical phone all produced one sentence — and the one thing an athlete
      // could do about each of them is different. `request()` already lifts a
      // 400's `error` string onto ApiError.message; the race forms surface it.
      const why = err instanceof ApiError ? ` ${err.message}` : "";
      setSorenessError(
        severity === null
          ? `That didn't clear — ${key} is still recorded. Tap the score again.${why}`
          : `That didn't save. Nothing was recorded for ${key}. Tap the number again.${why}`
      );
      setSubmitting(false);
      return;
    }
    setLogged((prev) => {
      const next = { ...prev };
      if (severity === null) delete next[key];
      else next[key] = severity;
      return next;
    });
    setUncleared((prev) => prev.filter((k) => k !== key));

    const stale: string[] = [];
    for (const other of supersedes) {
      try {
        await postCheckin({ sorenessPart: other, sorenessSeverity: null });
        setLogged((prev) => {
          const next = { ...prev };
          delete next[other];
          return next;
        });
        setUncleared((prev) => prev.filter((k) => k !== other));
      } catch {
        if (held.includes(other)) stale.push(other);
      }
    }
    if (stale.length > 0) {
      setUncleared((prev) => [...prev, ...stale.filter((k) => !prev.includes(k))]);
      setSorenessError(
        `Saved ${key} ${severity}/10, but the earlier score for ${stale.join(
          " and "
        )} could not be removed. It is still recorded.`
      );
    }
    setSubmitting(false);
  }

  /**
   * The finishing write: the sleep answer, and then the collapse.
   *
   * The soreness rows are already on the server by now — each one was written
   * as it was tapped — so this call carries only `energy`. It is safe for it to
   * carry only that: `upsertCheckin` merges with `COALESCE`
   * (website/src/lib/db.ts:420-426), so the soreness-only calls above did not
   * blank anything and this one does not either.
   */
  async function finish(sleep: SleepAnswer) {
    setSubmitting(true);
    setSubmitFailed(false);
    try {
      await postCheckin({ energy: ENERGY_BY_SLEEP[sleep] });
    } catch {
      setSubmitFailed(true);
      setSubmitting(false);
      return;
    }
    // The receipt is built from the mirror, which holds only rows the server
    // reported holding plus rows whose own write returned — so it cannot name
    // soreness the server does not have, and the uncleared list stops it
    // claiming a replacement that did not happen.
    setStored({ entries: Object.entries(logged), uncleared });
    setSubmittedAt(new Date());
    setSubmitting(false);
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reduceMotion ? 0 : duration.reveal,
      useNativeDriver: true,
    }).start();
    // Readiness is recomputed server-side, so it has to be re-read rather than
    // guessed at locally. If the refetch never lands the hero holds its
    // placeholder: unknown-for-now claims nothing, where a stale figure would.
    const refreshed = await getHome().catch(() => null);
    if (refreshed) setProfile(refreshed);
    // The runs, calendar, races and profile screens read `/me`, which now
    // reports different soreness and a recomputed readiness. Anything already
    // holding it refetches; anything that never loaded it does nothing, and
    // gets the new figures from its own first load.
    invalidateProfile();
  }

  if (loadError !== "none") {
    // An unpaired device is not an error state, it is a first run — and until
    // this button existed it was a dead end: the copy explained the problem and
    // offered nothing to do about it, on the one screen a fresh install opens.
    const unpaired = loadError === "unpaired";
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Text style={styles.loadError}>
            {unpaired
              ? "This device isn't signed in yet, so there is nothing to show."
              : "Your check-in couldn't be loaded."}
          </Text>
          {unpaired ? (
            <Pressable
              onPress={() => router.replace("/login")}
              accessibilityRole="button"
              accessibilityLabel="Sign in to RunGuard"
              style={styles.loadErrorAction}
            >
              <Text style={styles.loadErrorActionLabel}>Sign in</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                setLoadError("none");
                setReloadKey((n) => n + 1);
              }}
              accessibilityRole="button"
              style={styles.loadErrorAction}
            >
              <Text style={styles.loadErrorActionLabel}>Try again</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  let receipt: string | null = null;
  // `reopened` suppresses the receipt so the card renders again — the athlete
  // asked to add something, and the receipt branch cannot take input.
  if (reopened) receipt = null;
  else if (submittedAt) receipt = receiptLabel(submittedAt);
  else if (!reopened && profile && checkedInToday(profile) && profile.todayCheckin) {
    // `checkedInToday`, not `todayCheckin !== null` — the same gate readiness
    // uses, for the same reason. A soreness-only write creates a checkins row
    // with every self-report column NULL, and "Checked in" over a row the
    // athlete never answered is a receipt for something that did not happen.
    // No time of day exists on a check-in row; the day alone is what is true.
    receipt = `Checked in · ${dayLabel(profile.todayCheckin.date)}`;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Chat and Settings are stack routes, not tabs — the bar is four items by
          design. Without this header nothing in the app reached either of them,
          and Settings is the only way to Profile, Connect and the privacy
          policy, so the whole account half of the app was unreachable. */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>RunGuard</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/chat")}
            accessibilityRole="button"
            accessibilityLabel="Ask the RunGuard coach"
            hitSlop={hitSlopFor(styles.headerAction)}
            style={styles.headerAction}
          >
            <Text style={styles.headerActionLabel}>RunGuard AI</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={hitSlopFor(styles.headerAction)}
            style={styles.headerAction}
          >
            <Text style={styles.headerActionLabel}>Settings</Text>
          </Pressable>
        </View>
      </View>
      {/* The bottom inset belongs to the tab bar, which reserves it in its own
          height (see _layout.tsx), so the scroll view stops exactly above the
          bar and its last card clears it by one section. */}
      <ScrollView contentContainerStyle={styles.page}>
        {!profile ? (
          <>
            <CheckInCardSkeleton />
            <UnknownReadiness pending />
          </>
        ) : receipt ? (
          // One reveal for the whole collapsed state, so the receipt and what
          // it unlocked arrive together rather than in two steps.
          <Animated.View style={{ opacity: reveal }}>
            <CheckInReceipt label={receipt} />
            <SorenessNote stored={stored} />
            {/*
              THE WAY BACK IN.

              This branch had no soreness affordance at all, and it is the only
              screen in the app that writes soreness — so once any self-report
              existed for today, soreness became unaddable for the rest of the
              day, silently. One accidental tap on "No" was enough, since that
              submits on the tap; so was checking in on the website.

              The website has no such door: its body-part chips sit on Home all
              day. This reopens the card in its `askingWhere` state, with
              everything already logged lit from the same `logged` mirror, so
              adding a second sore spot at 4pm works exactly like adding the
              first at 7am.
            */}
            <Pressable
              style={styles.addSoreness}
              onPress={() => setReopened(true)}
              accessibilityRole="button"
              accessibilityLabel="Add or change soreness for today"
            >
              <Text style={styles.addSorenessLabel}>Add or change soreness</Text>
            </Pressable>
            <ReadinessHero
              state={readinessState(profile)}
              insight={profile.aiInsight}
            />
            <AfterCheckIn profile={profile} />
          </Animated.View>
        ) : (
          <>
            <CheckInCard
              dateLabel={dayLabel(localDay())}
              logged={logged}
              uncleared={uncleared}
              onLogSoreness={logSoreness}
              onComplete={finish}
              submitting={submitting}
              sorenessError={sorenessError}
              failed={submitFailed}
              sorenessOnly={reopened}
              onDone={() => setReopened(false)}
            />
            {/* No receipt means no check-in today — `readinessState` is
                `{known:false}` by construction, so this footer is given no way
                to render a value at all. */}
            <UnknownReadiness pending={false} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The ember hairline along a hero panel's top edge — the port of the website's
 * `.card-ember`, which it reserves for hero cards. Decoration with no state in
 * it, so it is hidden from assistive tech.
 */
function EmberEdge() {
  return (
    <LinearGradient
      colors={color.ember}
      locations={EMBER_STOPS}
      start={EMBER_START}
      end={EMBER_END}
      style={styles.emberEdge}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/**
 * The hero: readiness, its verdict, and the sentence the server wrote about
 * this athlete's training.
 *
 * This is the website's hero shape (tabs.tsx:168-189) minus the gauge — one
 * figure, the verdict beside it in the verdict's own colour, then the insight
 * paragraph with its ember "RunGuard AI:" byline, which is the one place the
 * web portal spends the brand on type.
 *
 * `state.known` is false only in the seconds between a submit and the refetch
 * that recomputes readiness, or forever if that refetch failed. Either way the
 * value slot holds its height and says nothing: this panel sits directly under
 * a receipt, so "unknown until you check in" would contradict the line above
 * it, and any figure at all would be invented.
 */
function ReadinessHero({
  state,
  insight,
}: {
  state: ReadinessState;
  insight?: string;
}) {
  return (
    <View style={styles.hero}>
      <EmberEdge />
      <View style={styles.panelBody}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>Readiness</Text>
          <Text style={styles.panelNote}>higher is fresher</Text>
        </View>

        {state.known ? (
          <View style={styles.readinessRow}>
            {/* The numeral with "/100" welded on, then the verdict. See
                lib/readinessVerdict for the bands and wording, which are
                copied from tabs.tsx rather than invented. */}
            <Text style={styles.readinessValue}>{readinessValue(state.value)}</Text>
            <Text
              style={[
                styles.readinessVerdict,
                { color: VERDICT_COLOR[readinessBand(state.value)] },
              ]}
            >
              {readinessVerdict(state.value)}
            </Text>
          </View>
        ) : (
          <View style={styles.readinessPlaceholder} />
        )}

        {/*
          INSIDE the `known` gate, not beside it.

          This sat outside the branch above, so on the unknown arm the numeral
          was correctly suppressed and the sentence explaining it was not — the
          panel read "Readiness · —" with a confident "RunGuard AI: …" paragraph
          underneath, sourced from the same engine whose figure we had just
          decided we could not stand behind.

          Non-negotiable #6 is about the claim, not the numeral. A withheld
          number under a paragraph that speaks anyway is the number leaking out
          in prose. `aiInsight` is composed from the same inputs `readiness` is,
          so if one is not founded neither is the other.
        */}
        {state.known && insight ? (
          <Text style={styles.insight}>
            <Text style={styles.insightByline}>RunGuard AI: </Text>
            {insight}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Readiness before there is anything to know. It takes no profile and holds no
 * branch that could print a figure — visual-spec non-negotiable #6 is enforced
 * by the shape of this component, not by a check inside it.
 *
 * `pending` is the first load, where even "unknown" would be a claim about the
 * athlete rather than about the network, so the slot only reserves its height.
 */
function UnknownReadiness({ pending }: { pending: boolean }) {
  return (
    <View style={styles.footer}>
      {/* Dashed means "we don't know", everywhere in this app. */}
      <DashedRule />
      {pending ? (
        <View style={styles.readinessPlaceholder} />
      ) : (
        <View style={styles.readinessRow}>
          <Text style={styles.readinessLabel}>Readiness</Text>
          <Text style={styles.readinessDash}>—</Text>
          <Text style={styles.readinessQualifier}>unknown until you check in</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Everything the check-in unlocks, in the order the day is read: the body, then
 * the week, then today, then the next thing on the calendar.
 *
 * None of it renders before a check-in. The empty prompt screen is the
 * signature, and a stack of tiles above the fold would be exactly the summary
 * widget the spec leaves the space empty instead of.
 */
function AfterCheckIn({ profile }: { profile: ProfileWithNextRace }) {
  const today = profile.plan.days.find((d) => d.isToday);
  const next = profile.races?.upcoming[0];

  return (
    <View style={styles.sections}>
      <View style={styles.section}>
        {/* The Panel head, on a section whose content is itself made of cards:
            title left, the caveat right. The tiles below are the website's
            bento, which stands on the ground rather than nesting in a panel. */}
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>Recovery</Text>
          <Text style={styles.panelNote}>from your wearable</Text>
        </View>
        {profile.risk.recovery.hasData ? (
          <RecoveryGrid recovery={profile.risk.recovery} />
        ) : (
          // No wearable at all. One dashed slot rather than a grid of them:
          // three Absents would state three separate unknowns where there is
          // really only one.
          <Absent label="No wearable data recorded" />
        )}
      </View>

      {/*
        `weekKm` is always a number, so the guard is `hasActivityHistory`, not
        the value. "0 mi of 40 mi target" from an athlete who has never synced a
        run is a blank reading as a measured fact, which is the one failure the
        visual spec exists to prevent.
      */}
      {profile.risk.hasActivityHistory ? (
        <WeekProgress
          weekKm={profile.risk.weekKm}
          weeklyTargetKm={profile.weeklyTargetKm ?? null}
        />
      ) : (
        <Absent eyebrow="Weekly mileage" label="No runs recorded yet" />
      )}

      <TodayBlock day={today} dateLabel={dayLabel(localDay())} />

      {/* Renders nothing at all when the calendar is empty — see NextRaceBlock. */}
      <NextRaceBlock
        race={
          next
            ? {
                name: next.name,
                daysUntil: next.daysUntil,
                dateLabel: dayLabel(next.date),
              }
            : null
        }
      />

      {/*
        Last on the screen, and renders nothing when there is nothing — see
        Notifications for why an empty list is not "All good".

        Last on purpose: these are the server's observations about the athlete,
        and putting them above the check-in would answer the screen's question
        before it was asked.
      */}
      <Notifications items={profile.notifications} />
    </View>
  );
}

/** "+3" / "-12" — the sign is part of the figure, so it stays in the same node. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * The wearable readings: Sleep · 7d, then HRV and Resting HR.
 *
 * Deliberately NOT <RecoveryTiles/>, whose fourth tile is this week's mileage.
 * That figure renders below through <WeekProgress/> instead, which carries the
 * target alongside it — the more useful framing, and the one the athlete can
 * act on — and the same number cannot appear twice on one screen in two
 * different framings without one of them looking wrong.
 *
 * THE VACATED SLOT IS NOT LEFT EMPTY. Three tiles in a two-up grid used to
 * leave a hole in the bottom-right, which read as a tile that had failed to
 * load — the one thing this app must never let a blank do. So the grid is
 * mixed-size, the way the website's bento is: sleep takes a full row on its
 * own, and the two readings that carry a "vs base" delta pair off beneath it.
 * Nothing is invented to fill a slot and no slot is left open.
 *
 * Every figure is already rounded by the server (website/src/lib/risk.ts), so
 * nothing is re-formatted here beyond welding the unit on. Null is a reading
 * that was never taken and renders as absent through <Tile/> — never 0.
 */
function RecoveryGrid({ recovery }: { recovery: RecoverySnapshot }) {
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <Tile
          label="Sleep · 7d"
          value={recovery.sleepAvg !== null ? `${recovery.sleepAvg} h` : null}
        />
      </View>
      <View style={styles.gridRow}>
        <Tile
          label="HRV"
          value={recovery.hrv !== null ? `${recovery.hrv} ms` : null}
          sub={
            recovery.hrvDeltaPct !== null
              ? `${signed(recovery.hrvDeltaPct)}% vs base`
              : undefined
          }
        />
        <Tile
          label="Resting HR"
          value={recovery.restingHr !== null ? `${recovery.restingHr} bpm` : null}
          sub={
            recovery.restingHrDelta !== null
              ? `${signed(recovery.restingHrDelta)} bpm vs base`
              : undefined
          }
        />
      </View>
    </View>
  );
}

/**
 * Exactly what the server holds for today, and nothing beyond it. It renders
 * only for a check-in this session submitted, because that is the only one this
 * screen has a mirror for.
 *
 * It names every stored row in full — "left knee 6/10 · shin 0/10" — through
 * the same component the card's own readout used, so the two cannot word the
 * same rows differently. An empty list means the server holds no soreness for
 * today, which is a reported fact and says so; it is never printed for a
 * check-in that simply failed to record something, and — since the mirror is
 * seeded from `todaySoreness` — never for a day whose soreness was logged
 * somewhere other than this session.
 *
 * AND IT CLAIMS NO MORE THAN THAT. A supersede clear that did not land leaves a
 * row on the server the athlete believes they replaced, so the second line
 * names it. This is the exact failure this screen has already shipped once, in
 * the other direction: a receipt that announced a clean save for soreness that
 * had never been sent.
 */
function SorenessNote({
  stored,
}: {
  stored: { entries: [string, number][]; uncleared: string[] } | null;
}) {
  if (!stored) return null;
  return (
    <View style={styles.sorenessNote}>
      {stored.entries.length === 0 ? (
        <Text style={styles.sorenessNoteLine}>No soreness reported.</Text>
      ) : (
        <SorenessList lead="Recorded: " entries={stored.entries} />
      )}
      {stored.uncleared.length > 0 ? (
        <Text style={styles.sorenessNoteLine}>
          {`An earlier score for ${stored.uncleared.join(
            " and "
          )} could not be removed, and is still recorded.`}
        </Text>
      ) : null}
    </View>
  );
}

function DashedRule() {
  return (
    <Svg width="100%" height={ruleWidth}>
      <Line
        x1="0"
        y1={ruleWidth / 2}
        x2="100%"
        y2={ruleWidth / 2}
        stroke={color.rule}
        strokeWidth={ruleWidth}
        strokeDasharray={[space.xs, space.xs]}
      />
    </Svg>
  );
}


/**
 * The header actions are text, so their natural box is well under the 48pt
 * minimum. Rather than pad the labels apart — which would fight the header's
 * rhythm — the shortfall is added back as hitSlop, which is the same fix
 * BodyMap uses for anatomically small regions: enlarge the target, not the mark.
 */
function hitSlopFor(style: { paddingVertical?: number; paddingHorizontal?: number }) {
  const v = Math.max(0, (target.min - ((style.paddingVertical ?? 0) * 2 + 16)) / 2);
  const h = Math.max(0, (target.min - ((style.paddingHorizontal ?? 0) * 2 + 40)) / 2);
  return { top: v, bottom: v, left: h, right: h };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.page,
    paddingTop: space.sm,
  },
  wordmark: { ...text.title, color: color.ink },
  headerActions: { flexDirection: "row", gap: space.lg },
  headerAction: { paddingVertical: space.xs, paddingHorizontal: space.xs },
  headerActionLabel: { ...text.meta, color: color.brandText },
  page: {
    flexGrow: 1,
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  loadErrorAction: {
    marginTop: space.xl,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    backgroundColor: color.brand,
  },
  loadErrorActionLabel: { ...text.baseSemi, color: color.ink },
  loadError: { ...text.base, color: color.ink2 },
  sorenessNote: { marginTop: space.md, gap: space.xs },
  sorenessNoteLine: { ...text.meta, color: color.muted },

  /**
   * The hero panel. `shadow.card` is elevation and nothing else — the same
   * two-layer shadow every surface gets, not a device for making this card
   * shout over the tiles below it.
   */
  hero: {
    marginTop: layout.section,
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    ...shadow.card,
  },
  /** Sits inside the panel's rule, so it takes the same top corners. */
  emberEdge: {
    height: space.xs,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  panelBody: { padding: layout.cardPadding },

  /** Title left, muted note right — the website's Panel head (tabs.tsx:22). */
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  panelTitle: { ...text.title, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },

  readinessRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
  readinessLabel: { ...text.base, color: color.ink2 },
  readinessValue: { ...text.stat, color: color.ink },
  readinessVerdict: { ...text.baseSemi },
  readinessDash: { ...text.stat, color: color.unknown },
  readinessQualifier: { ...text.meta, color: color.muted },
  /** Exactly one line of the figure it stands in for, so nothing shifts. */
  readinessPlaceholder: {
    height: STAT_LINE,
    width: "70%",
    marginTop: space.md,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },

  /** Prose, not a figure and not a status: base weight, ink2, no ornament. */
  insight: { ...text.base, color: color.ink2, marginTop: space.md },
  /**
   * The website's one ember byline (tabs.tsx:184). `brandText`, never `brand`:
   * the brand hex is 2.1:1 on white, this is 5.2:1.
   */
  insightByline: { ...text.baseSemi, color: color.brandText },

  sections: { marginTop: layout.section, gap: layout.section },
  section: { gap: space.md },
  grid: { gap: space.md },
  // Explicit rows rather than a wrapping grid: `flex: 1` on each tile keeps a
  // pair the same width and the same height at 360px, which a flexBasis wrap
  // does not guarantee once one tile carries a sub-line. A row with one tile in
  // it is the full-width tile.
  gridRow: { flexDirection: "row", gap: space.md },

  /**
   * The way back into soreness after the check-in is done. An outlined control,
   * not the ember: the ember is reserved for the card's one system action, and
   * this is a door rather than a commitment.
   */
  addSoreness: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.card,
    marginTop: space.md,
  },
  addSorenessLabel: { ...text.base, color: color.ink2 },

  footer: { marginTop: layout.section },
});
