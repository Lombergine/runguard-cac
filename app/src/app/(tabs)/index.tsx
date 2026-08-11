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
  areaLabel,
  CheckInCard,
  CheckInCardSkeleton,
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
  readinessBand,
  readinessValue,
  readinessVerdict,
  type ReadinessBand,
} from "../../lib/readinessVerdict";
import { dayLabel, localDay, receiptLabel } from "../../lib/dates";
import { readinessState } from "../../lib/readiness";
import type {
  ProfileWithNextRace,
  ReadinessState,
  RecoverySnapshot,
} from "../../lib/types";
import { duration, layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
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
 * engine.ts: `>= 4` → watch, `>= 7` → unusual) — the flag the coach reads is
 * then the one the athlete's own word named.
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
    // guessed at locally. If the refetch never lands the hero holds its
    // placeholder: unknown-for-now claims nothing, where a stale figure would.
    const refreshed = await getHome().catch(() => null);
    if (refreshed) setProfile(refreshed);
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
              onPress={() => setLoadError("none")}
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
  if (submittedAt) receipt = receiptLabel(submittedAt);
  else if (profile?.todayCheckin) {
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
            <Text style={styles.headerActionLabel}>Coach</Text>
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
              onComplete={submit}
              submitting={submitting}
              failed={submitFailed}
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

        {insight ? (
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
  sorenessNote: { ...text.meta, color: color.muted, marginTop: space.md },
  /** Numerals are mono everywhere, and the count keeps its noun welded on. */
  sorenessCount: { ...tabular, fontFamily: font.mono, color: color.ink2 },

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

  footer: { marginTop: layout.section },
});
