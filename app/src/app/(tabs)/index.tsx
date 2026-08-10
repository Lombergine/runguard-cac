/**
 * Home — the check-in hero, and what the check-in unlocks. See
 * ../../../../docs/visual-spec.md § "The signature".
 *
 * The inversion: the hero is the check-in PROMPT, not readiness. Readiness is
 * demoted to a consequence of having checked in.
 *
 * BEFORE a check-in the screen is unchanged — one question, three targets, a lot
 * of air, and the readiness footer reading "— unknown". The emptiness is the
 * product's main call to action and nothing is stacked above it.
 *
 * AFTER a check-in the same space carries the day's picture, in this order:
 * receipt → readiness + verdict → the insight → recovery → weekly mileage →
 * today's session → next race.
 *
 * Four things this screen is careful about:
 *
 *  1. Readiness renders ONLY through readinessState(). The server sends 100 for
 *     an athlete it knows nothing about, so `profile.readiness` is never read
 *     here (visual-spec non-negotiable #6).
 *  2. The advisory uses displayFlag() and `athleteReason`. The server's
 *     `reason` is written in the third person for a coach ("They reported…")
 *     and must not reach an athlete.
 *  3. Every date is a pre-formatted local string from lib/dates. A check-in
 *     loaded from the server carries a day but NO time of day, so its receipt
 *     shows the day alone — inventing a clock time would be inventing data.
 *  4. A blank is never a zero. `weekKm` is always a number and the recovery
 *     readings are always present as keys, so each block is gated on the flag
 *     that says whether the figure was measured at all — `hasActivityHistory`
 *     and `recovery.hasData` — and renders <Absent/> when it was not.
 */
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";

import { Advisory } from "../../components/Advisory";
import {
  areaLabel,
  CheckInCard,
  checkInMetrics,
  type CheckInAnswers,
  type SleepAnswer,
  type SorenessAnswer,
} from "../../components/CheckInCard";
import { CheckInReceipt } from "../../components/CheckInReceipt";
import { Absent } from "../../components/Nothing";
import { Tile } from "../../components/Tile";
import { NextRaceBlock, TodayBlock } from "../../components/TodayBlock";
import { WeekProgress } from "../../components/WeekProgress";
import { ApiError, BASE_URL, isUnauthorized, postCheckin } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { sorenessLabel } from "../../lib/bodyParts";
import {
  readinessColor,
  readinessValue,
  readinessVerdict,
} from "../../lib/readinessVerdict";
import { checkinHeader, dayLabel, localDay, receiptLabel } from "../../lib/dates";
import { displayFlag, readinessState } from "../../lib/readiness";
import type { Flag, ProfileWithNextRace, RecoverySnapshot } from "../../lib/types";
import { duration, layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/**
 * GET /api/mobile/home — the home screen's own slice of the profile: readiness,
 * pre-practice, today's check-in, the plan, the full recovery snapshot, the
 * weekly target, the insight line and the next race. 5.3 KB against /me's 57 KB,
 * because /me also ships a 366-day calendar and two long series this screen
 * renders none of.
 *
 * It lives HERE rather than in lib/api.ts because this segment does not own that
 * file and `getHome()` did not exist in it. It is a copy of that module's
 * `request()` narrowed to one GET; move it across and delete this when the
 * client grows the method.
 */
const HOME_TIMEOUT_MS = 15_000;

async function getHome(): Promise<ProfileWithNextRace> {
  const token = await getToken();
  // Fail closed rather than sending an unauthenticated request.
  if (!token) throw new ApiError(401, "No device token. Pair this device first.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOME_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/home`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch {
    // The thrown value can echo the request, token and all; never re-use it.
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status}).`);
  return (await res.json()) as ProfileWithNextRace;
}

/**
 * "How did you sleep?" maps to `energy`, which is the only self-report field
 * readinessScore() reads (website/src/lib/engine.ts: 6/10 is its neutral
 * point). There is no sleep column on a check-in row.
 */
const ENERGY_BY_SLEEP: Record<SleepAnswer, number> = { bad: 3, ok: 6, good: 9 };

/**
 * The triage word becomes a 0–10 severity, because that is the only shape
 * `sorenessSeverity` has.
 *
 * The two numbers are prePracticeFlag's own thresholds (website/src/lib/
 * engine.ts: `>= 4` → watch, `>= 7` → unusual). Choosing them means the flag
 * the athlete reads back is the one their answer names: "a bit" lands exactly
 * on watch, "a lot" exactly on unusual. Any other pair would let the app show
 * `clear` to someone who just said they were sore.
 */
const SEVERITY_BY_SORENESS: Record<Exclude<SorenessAnswer, "none">, number> = {
  some: 4,
  lot: 7,
};

/** How the stored soreness level is described back to the athlete. */
const SORENESS_WORD: Record<Exclude<SorenessAnswer, "none">, string> = {
  some: "A bit sore",
  lot: "Very sore",
};

/**
 * Advisory copy when the server sent no athlete-facing phrasing. These restate
 * what the flag MEANS; they never invent an observation, and none of them is an
 * instruction.
 */
const FALLBACK_REASON: Record<Flag, string> = {
  clear: "Nothing stood out in what you've reported.",
  watch: "Something you reported is worth keeping an eye on.",
  unusual: "Something you reported stands out from your usual.",
  unknown: "There is nothing to go on until you check in.",
};

const STAT_LINE = text.stat.lineHeight as number;
/**
 * The flag row, then TWO lines of reason. Every `athleteReason` the engine
 * writes wraps past one line at 360px, so reserving one made the answer targets
 * above jump upward the moment the profile landed — a layout shift under a
 * thumb that is already reaching, which the spec forbids. Reserving the common
 * height costs nothing: in the prompt state the footer is the last block on the
 * screen.
 */
const ADVISORY_BLOCK =
  (text.base.lineHeight as number) + space.xs + (text.meta.lineHeight as number) * 2;

export default function CheckInScreen() {
  const [profile, setProfile] = useState<ProfileWithNextRace | null>(null);
  const [loadError, setLoadError] = useState<"none" | "unpaired" | "failed">("none");
  /** Set only when this session submitted the check-in — the one time we know. */
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  /**
   * What the server actually took, set only after every call succeeded. The
   * receipt describes this and nothing else — it must never name soreness the
   * server does not hold.
   */
  const [stored, setStored] = useState<{
    soreness: SorenessAnswer;
    parts: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  /** The post-submit refetch never landed, so the new readiness is unknown. */
  const [staleReadiness, setStaleReadiness] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Starts opaque: nothing on this screen has an entrance animation. It is only
  // driven for the 180ms reveal after a check-in.
  const reveal = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;
    getHome()
      .then((p) => {
        if (alive) setProfile(p);
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
  }, [reveal]);

  async function submit({ sleep, soreness, parts }: CheckInAnswers) {
    setSubmitting(true);
    setSubmitFailed(false);
    try {
      await postCheckin({ energy: ENERGY_BY_SLEEP[sleep] });
      if (soreness !== "none") {
        // ONE PART PER REQUEST — the route stores a single `sorenessPart` per
        // call (lib/api.ts, CheckinInput). Sequential, because every one of
        // these upserts the same check-in row. Any failure throws out of the
        // whole submit: a receipt is only allowed to follow a complete write.
        for (const partKey of parts) {
          await postCheckin({
            // The map toggles a lateral part as one state, so which side is
            // genuinely unknown. `sorenessLabel(key, null)` stores the bare
            // part rather than inventing "left" or "both".
            sorenessPart: sorenessLabel(partKey, null),
            sorenessSeverity: SEVERITY_BY_SORENESS[soreness],
          });
        }
      }
    } catch {
      setSubmitFailed(true);
      setSubmitting(false);
      return;
    }
    setStored({ soreness, parts: parts.length });
    setSubmittedAt(new Date());
    setSubmitting(false);
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reduceMotion ? 0 : duration.reveal,
      useNativeDriver: true,
    }).start();
    // Readiness is recomputed server-side, so it has to be re-read rather than
    // guessed at locally.
    try {
      setProfile(await getHome());
    } catch {
      setStaleReadiness(true);
    }
  }

  if (loadError !== "none") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Text style={styles.loadError}>
            {loadError === "unpaired"
              ? "This device isn't paired to an athlete yet, so there is nothing to show."
              : "Your check-in couldn't be loaded."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // The submitted check-in is on the server but this render has not seen it in
  // a profile yet: known to exist, value not yet known.
  const awaitingReadiness =
    submittedAt !== null && profile?.todayCheckin === null && !staleReadiness;

  let receipt: string | null = null;
  if (submittedAt) receipt = receiptLabel(submittedAt);
  else if (profile?.todayCheckin) {
    // No time of day exists on a check-in row; the day alone is what is true.
    receipt = `Checked in · ${dayLabel(profile.todayCheckin.date)}`;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* The bottom inset belongs to the tab bar, which reserves it in its own
          height (see _layout.tsx), so the scroll view stops exactly above the
          bar and its last card clears it by one section. */}
      <ScrollView contentContainerStyle={styles.page}>
        {!profile ? (
          <>
            <Skeleton />
            <ReadinessFooter profile={null} />
          </>
        ) : receipt ? (
          // One reveal for the whole collapsed state, so the receipt and what
          // it unlocked arrive together rather than in two steps.
          <Animated.View style={{ opacity: reveal }}>
            <CheckInReceipt label={receipt} />
            <SorenessNote stored={stored} />
            <ReadinessFooter profile={awaitingReadiness ? null : profile} />
            <AfterCheckIn profile={profile} />
          </Animated.View>
        ) : (
          <>
            <CheckInCard
              header={checkinHeader(localDay())}
              onComplete={submit}
              submitting={submitting}
              failed={submitFailed}
            />
            <ReadinessFooter profile={profile} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Everything the check-in unlocks, in the order the day is read: what the server
 * makes of the training, then the body, then the week, then today, then the next
 * thing on the calendar.
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
      {/*
        One server-written sentence about this athlete's training, given the
        prominence the web portal gives it: prose at the base size, directly
        under the verdict, no card and no rule of its own. It DESCRIBES, so it
        gets no dot, no colour and no alarm weight.
      */}
      {profile.aiInsight ? (
        <Text style={styles.insight}>{profile.aiInsight}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Recovery</Text>
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
    </View>
  );
}

/** "+3" / "-12" — the sign is part of the figure, so it stays in the same node. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * The wearable readings: Sleep · 7d, HRV, Resting HR.
 *
 * Deliberately NOT <RecoveryTiles/>, whose fourth tile is this week's mileage.
 * That figure renders below through <WeekProgress/> instead, which carries the
 * target alongside it — the more useful framing, and the one the athlete can act
 * on — and the same number cannot appear twice on one screen in two different
 * framings without one of them looking wrong. The vacated slot is left blank
 * rather than backfilled with an invented reading; it sits directly above the
 * block the week moved into.
 *
 * Every figure is already rounded by the server (website/src/lib/risk.ts), so
 * nothing is re-formatted here beyond welding the unit on. Null is a reading
 * that was never taken and renders <Absent/> through <Tile/> — never 0.
 */
function RecoveryGrid({ recovery }: { recovery: RecoverySnapshot }) {
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <Tile
          label="Sleep · 7d"
          value={recovery.sleepAvg !== null ? `${recovery.sleepAvg} h` : null}
        />
        <Tile
          label="HRV"
          value={recovery.hrv !== null ? `${recovery.hrv} ms` : null}
          sub={
            recovery.hrvDeltaPct !== null
              ? `${signed(recovery.hrvDeltaPct)}% vs base`
              : undefined
          }
        />
      </View>
      <View style={styles.gridRow}>
        <Tile
          label="Resting HR"
          value={recovery.restingHr !== null ? `${recovery.restingHr} bpm` : null}
          sub={
            recovery.restingHrDelta !== null
              ? `${signed(recovery.restingHrDelta)} bpm vs base`
              : undefined
          }
        />
        {/* The week's slot, left empty. Not an Absent: nothing is unknown here,
            the figure simply lives in the block below. */}
        <View style={styles.gridSlot} />
      </View>
    </View>
  );
}

/**
 * One line naming exactly what the soreness half of the check-in put on the
 * server, and nothing beyond it. It renders only for a check-in this session
 * submitted, because that is the only one whose soreness this screen witnessed.
 *
 * "No" is a reported fact and says so; anything else names the count of regions
 * that were stored. It never mentions what was not captured — an earlier
 * version read "where isn't recorded yet", which implied the severity HAD been
 * kept when in fact nothing had been sent at all.
 */
function SorenessNote({
  stored,
}: {
  stored: { soreness: SorenessAnswer; parts: number } | null;
}) {
  if (!stored) return null;
  if (stored.soreness === "none") {
    return <Text style={styles.sorenessNote}>No soreness reported.</Text>;
  }
  return (
    <Text style={styles.sorenessNote}>
      {`${SORENESS_WORD[stored.soreness]}, recorded in `}
      <Text style={styles.sorenessCount}>{areaLabel(stored.parts)}</Text>.
    </Text>
  );
}

/**
 * Readiness, and the advisory under it. `profile` is null whenever the value is
 * not yet knowable — first load, or the refetch after a submit — and the footer
 * then reserves its height rather than claiming "unknown", which is a statement
 * about the athlete and not about the network.
 */
function ReadinessFooter({ profile }: { profile: ProfileWithNextRace | null }) {
  const state = profile ? readinessState(profile) : null;
  const known = state?.known === true;

  if (!profile || !state) {
    return (
      <View style={styles.footer}>
        <DashedRule />
        <View style={styles.readinessPlaceholder} />
        <View style={styles.advisoryPlaceholder} />
      </View>
    );
  }

  const flag = displayFlag(profile);
  const reason =
    (flag === "unknown" ? undefined : profile.prePractice.athleteReason) ??
    FALLBACK_REASON[flag];

  return (
    <View style={styles.footer}>
      {/* Dashed means "we don't know" everywhere in this app, so the rule above
          readiness firms up once there is something to know. */}
      {known ? <View style={styles.solidRule} /> : <DashedRule />}

      <View style={styles.readinessRow}>
        <Text style={styles.readinessLabel}>Readiness</Text>
        {state.known ? (
          <>
            {/* Mirrors the web athlete portal: the numeral with "/100" welded
                on, then the verdict. See lib/readinessVerdict for the bands and
                wording, which are copied from tabs.tsx rather than invented. */}
            <Text style={styles.readinessValue}>{readinessValue(state.value)}</Text>
            <Text
              style={[styles.readinessVerdict, { color: readinessColor(state.value) }]}
            >
              {readinessVerdict(state.value)}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.readinessDash}>—</Text>
            <Text style={styles.readinessQualifier}>unknown until you check in</Text>
          </>
        )}
      </View>

      <View style={styles.advisory}>
        <Advisory flag={flag} reason={reason} />
      </View>
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
 * Reserves the prompt's exact height, block for block.
 *
 * It reserves the PROMPT and not the collapsed state on purpose: ten of fourteen
 * athletes have not checked in, so the prompt is what usually lands, and it is
 * the state whose targets a thumb is already reaching for. The blocks below a
 * receipt are not reserved because they cannot be — whether they exist at all is
 * the thing the payload is being fetched to find out — but every one of them
 * arrives in the same render as the receipt, so nothing shifts once it does.
 */
function Skeleton() {
  return (
    <View style={styles.body}>
      <View style={styles.skeletonEyebrow} />
      <View style={styles.skeletonPrompt} />
      <View style={styles.spacer} />
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonAnswer} />
        <View style={styles.skeletonAnswer} />
        <View style={styles.skeletonAnswer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    flexGrow: 1,
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  body: { flex: 1 },
  loadError: { ...text.base, color: color.ink2 },
  readinessVerdict: { ...text.baseSemi },
  sorenessNote: { ...text.meta, color: color.muted, marginTop: space.sm },
  /** Numerals are mono everywhere, and the count keeps its noun welded on. */
  sorenessCount: { ...tabular, fontFamily: font.mono, color: color.ink2 },

  sections: { marginTop: layout.section, gap: layout.section },
  section: { gap: space.md },
  sectionLabel: { ...text.micro, color: color.muted },
  /** Prose, not a figure and not a status: base weight, ink2, no ornament. */
  insight: { ...text.base, color: color.ink2 },
  grid: { gap: space.md },
  // Two explicit rows rather than a wrapping grid: `flex: 1` on each tile keeps
  // the pair the same width and the same height at 360px, which a flexBasis
  // wrap does not guarantee once one tile carries a sub-line.
  gridRow: { flexDirection: "row", gap: space.md },
  /** Holds the second column open so the lone tile stays half-width. */
  gridSlot: { flex: 1 },

  footer: { marginTop: layout.section },
  solidRule: { height: ruleWidth, backgroundColor: color.rule },
  readinessRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
  readinessLabel: { ...text.base, color: color.ink2 },
  readinessValue: { ...text.stat, color: color.ink },
  readinessDash: { ...text.stat, color: color.unknown },
  readinessQualifier: { ...text.meta, color: color.muted },
  advisory: { marginTop: space.md },

  readinessPlaceholder: {
    height: STAT_LINE,
    width: "70%",
    marginTop: space.md,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  advisoryPlaceholder: {
    height: ADVISORY_BLOCK,
    marginTop: space.md,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },

  spacer: { flex: 1, minHeight: space.xl },
  skeletonEyebrow: {
    height: checkInMetrics.eyebrowLine,
    width: "62%",
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  skeletonPrompt: {
    height: checkInMetrics.promptBlock,
    marginTop: space.lg,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  skeletonRow: { flexDirection: "row", gap: target.gap },
  skeletonAnswer: {
    flex: 1,
    height: checkInMetrics.answer,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
});
