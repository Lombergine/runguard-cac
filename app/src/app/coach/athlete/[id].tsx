/**
 * One athlete, as their coach sees them. The native twin of the website's
 * `/dashboard/athlete/[id]`.
 *
 * ── WHOSE DATA IS THIS ─────────────────────────────────────────────────────
 * The name is pinned above the scroll view rather than scrolling away with the
 * content. ../../../../docs/visual-spec.md § "Coach dashboard" is blunt about
 * it: "Whose data is this is the thing that must never be misread… Never rely
 * on the user remembering which row they clicked." On the web that rule was
 * missed and a coach could scroll to a "log an injury" control with nothing on
 * screen naming who they were about to write against. Here the header is
 * outside the ScrollView, so it cannot scroll away by construction.
 *
 * ── READINESS IS NEVER A BARE NUMBER ───────────────────────────────────────
 * The route sends `{known:false}` or `{known:true,value}`, never `p.readiness`,
 * because `readinessScore()` returns a confident 100 from no data at all. This
 * screen therefore has no number to render when there has been no check-in, and
 * renders the dash and the word "unknown" instead — visual-spec non-negotiable
 * #6, on the coach's side of the product.
 *
 * ── WHAT A COACH DOES NOT SEE ──────────────────────────────────────────────
 * No chat, in any form — not the content, not a count. The route has no chat
 * field at all, so there is nothing here to leak. No device token either: it is
 * stripped server-side before the wire.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Advisory } from "../../../components/Advisory";
import { Press } from "../../../components/Press";
import { StatGroup } from "../../../components/StatGroup";
import { BodyScan } from "../../../components/BodyScan";
import { HrZones } from "../../../components/HrZones";
import { InfoDot } from "../../../components/InfoDot";
import { RangePicker } from "../../../components/RangePicker";
import { YearGrid } from "../../../components/YearGrid";
import { AcwrChart } from "../../../components/charts/AcwrChart";
import { FitnessChart } from "../../../components/charts/FitnessChart";
import { MentalChart } from "../../../components/charts/MentalChart";
import { PaceChart } from "../../../components/charts/PaceChart";
import { PrChart } from "../../../components/charts/PrChart";
import { SleepChart } from "../../../components/charts/SleepChart";
import { SleepStages } from "../../../components/charts/SleepStages";
import { LoadChart } from "../../../components/charts/LoadChart";
import { WeeklyKmChart } from "../../../components/charts/WeeklyKmChart";
import { Card } from "../../../components/Card";
import { TeamAvatar } from "../../../components/TeamAvatar";
import { ApiError } from "../../../lib/api";
import {
  getCoachAthlete,
  getCoachChat,
  type CoachAthlete,
  type CoachChatMessage,
} from "../../../lib/coachApi";
import { DEFAULT_RANGE, parseRange, type RangeKey } from "../../../lib/range";
import { useSession } from "../../../lib/session";
import { fmtMiles, fmtDuration } from "../../../lib/units";
import { color } from "../../../theme/tokens";
import { font, tabular, text } from "../../../theme/type";
import { layout, radius, ruleWidth, space, target } from "../../../theme/space";

/**
 * The four sections, in the order a coach reads an athlete: what to do about
 * them today, then the training behind it, then how they are recovering, then
 * what is coming up. The same grouping the website's tabs use, minus the ones
 * that belong to the athlete's own app.
 */
type TabKey = "overview" | "training" | "recovery" | "races" | "chat";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Today" },
  { key: "training", label: "Training" },
  { key: "recovery", label: "Recovery" },
  { key: "races", label: "Races" },
  { key: "chat", label: "Chat" },
];

export default function CoachAthleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { signOutCoach } = useSession();

  const [data, setData] = useState<CoachAthlete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  /**
   * The window the daily charts are drawn over.
   *
   * Client-side, unlike the roster's: everything it changes is already in the
   * payload (the series reaches 6 months), so switching redraws instantly
   * instead of refetching 57 KB. The roster's picker DOES refetch, because
   * there the range changes numbers the engine computes server-side.
   */
  const [rangeKey, setRangeKey] = useState<RangeKey>(DEFAULT_RANGE);
  /**
   * The transcript, fetched only when the tab is opened.
   *
   * Lazy on purpose: it is the one part of this screen that is somebody's
   * private conversation, so it is not pulled onto the phone unless a coach
   * actually asks for it. `null` is "not asked yet", `[]` is "asked, nothing
   * there" — the two render differently.
   */
  const [chat, setChat] = useState<CoachChatMessage[] | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const range = parseRange(rangeKey);

  /**
   * Rest days off the current plan week — the only thing that turns an
   * unrecorded day inside the observed period into NO RUN rather than a
   * measured ZERO. Memoised because it is a Set: a fresh one every render
   * would rebuild the whole 366-day grid each time. Same shape (tabs)/stats.tsx
   * uses for the athlete's own copy of this grid.
   */
  const restDays = useMemo(
    () => new Set((data?.plan.days ?? []).filter((d) => d.type === "Rest").map((d) => d.date)),
    [data]
  );

  const load = useCallback(async () => {
    const n = Number(id);
    if (!Number.isInteger(n)) {
      setError("That athlete could not be found.");
      return;
    }
    try {
      setData(await getCoachAthlete(n));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      // A 404 here means the athlete is not on this coach's team. The message
      // says "not found" rather than "another team", because which athletes
      // exist elsewhere is itself information about another team's roster.
      setError(e instanceof Error ? e.message : "Could not load this athlete.");
    }
  }, [id, signOutCoach]);

  useEffect(() => {
    // Inside an async closure rather than the effect body: this settles after
    // an await, so it does not set state synchronously off the mount. Same
    // shape connect.tsx uses.
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (tab !== "chat" || chat !== null) return;
    const n = Number(id);
    if (!Number.isInteger(n)) return;
    void (async () => {
      try {
        setChat((await getCoachChat(n)).history);
        setChatError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await signOutCoach();
          return;
        }
        setChatError(e instanceof Error ? e.message : "Could not load the chat.");
      }
    })();
  }, [tab, chat, id, signOutCoach]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Outside the ScrollView on purpose — see the header. */}
      <View style={styles.identity}>
        <Press
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to roster"
          style={styles.back}
          pressedStyle={styles.pressed}
        >
          <Text style={styles.backLabel}>← Roster</Text>
        </Press>
        <View style={styles.identityRow}>
          {data ? <TeamAvatar name={data.athlete.name} hue={data.athlete.hue} /> : null}
          <View style={styles.identityText}>
            <Text style={styles.name}>{data?.athlete.name ?? " "}</Text>
            <Text style={styles.sub}>
              {data
                ? `${data.athlete.grade === null ? "" : `Grade ${data.athlete.grade} · `}${data.fitness.tier} tier`
                : " "}
            </Text>
          </View>
          {data ? <Readiness state={data.readiness} /> : null}
        </View>
      </View>

      {/*
        FOUR SECTIONS INSTEAD OF ONE LONG PAGE.
        All of this used to be a single scroll — advisory, three charts, pattern
        detection, recovery, races, PRs, runs, injuries — which is over ten
        screens of travel on a phone to reach the injuries a coach opened the
        athlete to check. A desktop page can afford that; this cannot.

        Outside the ScrollView, like the identity header, so the sections stay
        reachable from wherever the coach has scrolled to instead of having to
        be scrolled back up to.
      */}
      {data ? (
        // Scrollable rather than five equal flex cells: at the 360pt floor a
        // fifth of the width cannot hold "Recovery" without truncating it, and
        // a truncated section name is worse than one you have to swipe to.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segments}
        >
          {TABS.map((t) => (
            <Press
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              accessibilityLabel={t.label}
              style={[styles.segment, tab === t.key && styles.segmentOn]}
              pressedStyle={styles.pressed}
            >
              <Text style={[styles.segmentLabel, tab === t.key && styles.segmentLabelOn]}>
                {t.label}
              </Text>
            </Press>
          ))}
        </ScrollView>
      ) : null}

      {/*
        Only on the section that has daily charts. Putting it on every section
        would imply it moves figures it cannot: the recovery block is a fixed
        7-night mean, "days since rest" is a count to today, and the training
        year is a year by definition. A control that appears to do nothing is
        worse than one that is absent.
      */}
      {data && tab === "training" ? (
        <View style={styles.rangeRow}>
          <RangePicker value={rangeKey} onChange={setRangeKey} label="Window for the charts" />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.page}>
        {error ? (
          <Card>
            <Text style={styles.blockTitle}>Could not load this athlete</Text>
            <Text style={styles.body}>{error}</Text>
          </Card>
        ) : !data ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            {tab === "overview" && (
            <>
            <Card>
              <Text style={styles.eyebrow}>Before practice</Text>
              <View style={styles.advisory}>
                {/*
                  The shared `Advisory`, not a hand-rolled word. It carries the
                  StatusDot, and SHAPE is what makes the four states survive
                  greyscale and colour-blindness — a bare lowercase word does
                  not. It also applies the text-safe `…Text` colours, where the
                  fill tokens this screen has to hand would be under the 4.5:1
                  floor on a glyph.
                */}
                <Advisory
                  flag={data.prePractice.flag}
                  reason={data.prePractice.reason ?? "Nothing stood out in what was recorded."}
                />
              </View>
            </Card>

            <StatGroup
              figures={[
                {
                  label: "7-day distance",
                  value: fmtMiles(data.risk.weekKm),
                  caption:
                    data.risk.rampPct === null
                      ? "no previous week"
                      : `${data.risk.rampPct > 0 ? "+" : ""}${data.risk.rampPct}% vs last week`,
                },
                {
                  label: "Workload ratio",
                  value: data.risk.acwr === null ? null : data.risk.acwr.toFixed(2),
                  caption: "safe zone 0.8–1.3",
                },
                {
                  label: "Days since rest",
                  value: String(data.risk.daysSinceRest),
                  caption: "days with a run",
                },
                {
                  label: "Monotony",
                  value: data.risk.monotony === null ? null : data.risk.monotony.toFixed(1),
                  caption: "above 2 is flat",
                },
              ]}
            />

            {/*
              The body scan. Read-only here: a coach reads where it hurts, and
              soreness is the ATHLETE's to enter — the picker mode of this same
              component lives on their check-in screen and nowhere else.
            */}
            {/* Renders its own panel, title and "nothing flagged" note — a
                wrapping Card here printed the heading twice. */}
            <BodyScan injuries={data.injuries} soreness={data.todaySoreness} />

            <Card>
              <Text style={styles.blockTitle}>What they reported today</Text>
              {data.energyTrend ? (
                <View style={styles.trend}>
                  <Text style={styles.trendText}>
                    Reported energy has fallen {data.energyTrend.days} check-ins running,{" "}
                    {data.energyTrend.from}/10 down to {data.energyTrend.to}/10. Not a number to
                    act on by itself, worth asking about.
                  </Text>
                </View>
              ) : null}
              {data.todayCheckin === null ? (
                <View style={styles.absentBlock}>
                  <Text style={styles.absentDash}>—</Text>
                  <Text style={styles.absentLabel}>No check-in today</Text>
                </View>
              ) : (
                <>
                  <PatternRow
                    label="Energy"
                    value={
                      data.todayCheckin.energy === null ? null : `${data.todayCheckin.energy}/10`
                    }
                    note="how they said they felt"
                    warn={(data.todayCheckin.energy ?? 10) <= 4}
                  />
                  <PatternRow
                    label="Session RPE"
                    value={data.todayCheckin.rpe === null ? null : `${data.todayCheckin.rpe}/10`}
                    note="how hard the session felt"
                    warn={false}
                  />
                  <PatternRow
                    label="Academic stress"
                    value={data.todayCheckin.academic_stress ? "yes" : "no"}
                    note="school stress is training stress"
                    warn={Boolean(data.todayCheckin.academic_stress)}
                  />
                </>
              )}
              {data.todaySoreness.length > 0 ? (
                <Text style={styles.body}>
                  Sore today:{" "}
                  {data.todaySoreness.map((x) => `${x.part} ${x.severity}/10`).join(" · ")}
                </Text>
              ) : null}
            </Card>

            {data.chatSummary.length > 0 ? (
              <Card>
                <Text style={styles.blockTitle}>What they&apos;ve been asking</Text>
                <Text style={styles.note}>
                  Their last few questions. Anything the safety filter caught is
                  not here and never will be.
                </Text>
                {data.chatSummary.map((q, i) => (
                  <Text key={i} style={styles.quote}>
                    &ldquo;{q}&rdquo;
                  </Text>
                ))}
              </Card>
            ) : null}

            {data.risk.insights.length > 0 ? (
              <Card>
                <Text style={styles.blockTitle}>What the data says</Text>
                {data.risk.insights.map((line, i) => (
                  <Text key={i} style={styles.body}>
                    {line}
                  </Text>
                ))}
              </Card>
            ) : null}


            {/*
              The same three charts the web coach page draws, and the SAME
              components the athlete's own app uses — not reimplementations.
              Each already knows how to render its own absent state, which is
              why a coach looking at a brand-new athlete gets "not enough data"
              rather than a flat line at zero.
            */}
            </>
            )}

            {tab === "training" && (
            <>
            {/* Both follow the picker. */}
            <AcwrChart series={data.series} windowDays={range.days} />
            <LoadChart series={data.series} windowDays={range.days} />
            {/*
              This one does NOT, and the note says so. `buildProfile` builds
              exactly 12 weeks upstream, so a "6 months" selection has nothing
              extra to draw — letting it appear to respond would be the chart
              lying about its own window.
            */}
            <WeeklyKmChart weeks={data.weeks} />
            <Text style={styles.rangeNote}>
              Weekly mileage, pace, fitness and the training year are fixed
              windows: the picker moves the two daily charts above.
            </Text>

            <HrZones zones={data.load.weekZones} />
            <PaceChart paceSeason={data.paceSeason} />
            {/*
              Gated the way (tabs)/stats.tsx gates it: `computeFitness` falls
              back to a bare 50 when no week holds enough running, and a chart
              drawn from that fallback is a flat line presented as a season.
              `fitness.weekly` is empty exactly when there was nothing to
              compute from, so its length is the honest test.
            */}
            {(data.fitness.weekly?.length ?? 0) > 0 ? (
              <FitnessChart weekly={data.fitness.weekly} />
            ) : null}

            <Card>
              <Text style={styles.blockTitle}>Training year</Text>
              <Text style={styles.note}>how hard they went, every single day</Text>
              <YearGrid days={data.calendar} restDays={restDays} />
            </Card>

            {/*
              Fitness is a MODEL OUTPUT, not a measurement, and the tier is a
              bucket of the score — so every one of these is gated on
              `hasActivityHistory`. `computeFitness` falls back to a bare 50
              with no running behind it, which buckets to "Intermediate" and
              reports a "plateau" trend: three fabricated facts presented as
              plain labels. Absent is the honest answer.
            */}
            <StatGroup
              figures={[
                {
                  label: "Fitness score",
                  value:
                    data.risk.hasActivityHistory && data.fitness.score !== undefined
                      ? String(data.fitness.score)
                      : null,
                  caption: "0–100, modelled",
                },
                {
                  label: "Tier",
                  value: data.risk.hasActivityHistory ? (data.fitness.tier ?? null) : null,
                  caption: "bucket of the score",
                },
                {
                  label: "Trend",
                  // `?? null`: `trend` is optional on the app's Fitness type, and
                  // `undefined` would render as a blank rather than the dash.
                  value: data.risk.hasActivityHistory ? (data.fitness.trend ?? null) : null,
                  caption: "week over week",
                },
                {
                  label: "Freshness",
                  value:
                    data.risk.hasActivityHistory && data.fitness.freshness !== undefined
                      ? String(data.fitness.freshness)
                      : null,
                  caption: "0–100",
                },
              ]}
            />

            <StatGroup
              figures={[
                {
                  label: "Week TRIMP",
                  value: String(data.load.weekTrimp),
                  caption: "training impulse, 7d",
                },
                {
                  label: "Acute load",
                  value: String(Math.round(data.load.acuteLoad)),
                  caption: "7-day average",
                },
                {
                  label: "Chronic load",
                  value: String(Math.round(data.load.chronicLoad)),
                  caption: "28-day average",
                },
                {
                  label: "Mileage spike",
                  value: data.load.spikePct === null ? null : `${data.load.spikePct}%`,
                  caption: "week over week",
                  tone:
                    data.load.spikePct !== null && data.load.spikePct > 30
                      ? color.watchText
                      : undefined,
                },
              ]}
            />

            <Card>
              <Text style={styles.blockTitle}>Pattern detection</Text>
              <PatternRow
                label="Monotony"
                info="Foster's training monotony: the average of the last 7 days' training load divided by how much that load varied from day to day. Every day looking the same scores high. Above 2 with real volume behind it starts adding to the risk score. Hard days and easy days have to actually differ. Blank when the week's loads barely varied at all."
                value={data.patterns.monotony === null ? null : data.patterns.monotony.toFixed(1)}
                note="Above 2 means every day looks the same"
                warn={data.patterns.monotony !== null && data.patterns.monotony > 2}
              />
              <PatternRow
                label="Days since hard effort"
                info="Days since a session whose load was more than 40% above their median training day. A long gap is not automatically bad. It is what a taper or a recovery week looks like. But it is the number to check before assuming an athlete is sharp."
                value={
                  data.patterns.daysSinceHardEffort === null
                    ? null
                    : String(data.patterns.daysSinceHardEffort)
                }
                note="A long gap is what a taper looks like too"
                warn={false}
              />
              <PatternRow
                label="Sleep debt (7d)"
                info="Hours short of 8 h, added up across the last 7 nights of Apple Health sleep data. Only shortfalls count: a 9-hour night does not pay back a 6-hour one. Blank rather than stale when nothing was recorded in the window."
                value={data.patterns.sleepDebtH === null ? null : `${data.patterns.sleepDebtH} h`}
                note="Hours short of 8 h, added up"
                warn={data.patterns.sleepDebtH !== null && data.patterns.sleepDebtH > 4}
              />
              <PatternRow
                label="Sleep consistency"
                info="0–100, from how much sleep length swung night to night across the last 7 nights. The same hours every night scores near 100; 5 h then 10 h scores low even when the average looks healthy. Needs at least 4 nights recorded."
                value={
                  data.patterns.sleepConsistency === null
                    ? null
                    : `${data.patterns.sleepConsistency}/100`
                }
                note="Same hours every night scores high"
                warn={
                  data.patterns.sleepConsistency !== null && data.patterns.sleepConsistency < 60
                }
              />
              <PatternRow
                label="High-effort streak"
                info="Consecutive days, counting back from today, where the day's training load sat more than 15% above this athlete's own median training day. Six or more is one of the three things that trips the Overreaching flag."
                value={`${data.patterns.highEffortStreak} days`}
                note="above their own median day"
                warn={data.patterns.highEffortStreak >= 5}
              />
              {/*
                The three flags, worded as flags. "yes"/"no" in lower case and
                body weight, never a badge: § "Status and advisory" is explicit
                that a description must not be typed as an instruction, and
                each one's own note says it is a pattern to ask about.
              */}
              <PatternRow
                label="Overreaching"
                info="Trips when any one of three things is true: workload ratio above 1.5; ratio above 1.4 together with monotony above 1.7; or six straight high-effort days. It is a flag to ask about, not a diagnosis."
                value={data.patterns.overreaching ? "yes" : "no"}
                note="ratio, monotony or a long high streak"
                warn={data.patterns.overreaching}
              />
              <PatternRow
                label="Undertraining"
                info="Trips only when the workload ratio is under 0.7 AND the last 7 days are under 70% of their 4-week average, and only for athletes averaging real volume. Deliberately hard to trip, so a planned easy week does not set it off."
                value={data.patterns.undertraining ? "yes" : "no"}
                note="deliberately hard to trip"
                warn={data.patterns.undertraining}
              />
              <PatternRow
                label="Illness pattern"
                info="Resting heart rate at least 5 bpm above their baseline at the same time as HRV at least 15% below it. That combination often appears a day or two before someone feels ill. A pattern, not a diagnosis. Ask them how they feel."
                value={data.illness ? "yes" : "no"}
                note="resting HR up with HRV down. Ask how they feel"
                warn={data.illness}
              />
            </Card>

            <Card>
              <Text style={styles.blockTitle}>Recent runs</Text>
              {data.recentRuns.length === 0 ? (
                <Text style={styles.body}>No runs recorded yet.</Text>
              ) : (
                data.recentRuns.slice(0, 8).map((r) => (
                  // Tappable. The list used to be inert, which is the one thing
                  // a coach reliably tries after spotting a spike in it.
                  <Press
                    key={r.id}
                    onPress={() => router.push(`/coach/activity/${r.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open the run on ${r.date.slice(0, 10)}`}
                    style={styles.runRow}
                    scale={false}
                    pressedStyle={styles.pressed}
                  >
                    <Text style={styles.runDate}>{r.date.slice(0, 10)}</Text>
                    <Text style={styles.runStat}>{fmtMiles(r.km)}</Text>
                    <Text style={styles.runStat}>{fmtDuration(r.durationS)}</Text>
                    <Text style={styles.runChevron}>›</Text>
                  </Press>
                ))
              )}
            </Card>

            </>
            )}

            {tab === "recovery" && (
            <>
            <Card>
              <Text style={styles.blockTitle}>Recovery</Text>
              <Text style={styles.note}>from their wearable</Text>
              {!data.risk.recovery.hasData ? (
                // One dashed slot, not three: there is really only one unknown
                // here — no wearable data at all.
                <View style={styles.absentBlock}>
                  <Text style={styles.absentDash}>—</Text>
                  <Text style={styles.absentLabel}>No wearable data recorded</Text>
                </View>
              ) : (
                <StatGroup
                  figures={[
                    {
                      label: "Sleep · 7d",
                      value:
                        data.risk.recovery.sleepAvg === null
                          ? null
                          : `${data.risk.recovery.sleepAvg.toFixed(1)} h`,
                      caption: "mean of 7 nights",
                    },
                    {
                      label: "HRV",
                      value:
                        data.risk.recovery.hrv === null
                          ? null
                          : `${Math.round(data.risk.recovery.hrv)} ms`,
                      caption:
                        data.risk.recovery.hrvDeltaPct === null
                          ? "no baseline yet"
                          : `${data.risk.recovery.hrvDeltaPct > 0 ? "+" : ""}${data.risk.recovery.hrvDeltaPct}% vs base`,
                    },
                    {
                      label: "Resting HR",
                      value:
                        data.risk.recovery.restingHr === null
                          ? null
                          : `${Math.round(data.risk.recovery.restingHr)} bpm`,
                      caption:
                        data.risk.recovery.restingHrDelta === null
                          ? "no baseline yet"
                          : `${data.risk.recovery.restingHrDelta > 0 ? "+" : ""}${data.risk.recovery.restingHrDelta} bpm vs base`,
                    },
                    {
                      label: "VO₂max",
                      value:
                        data.risk.recovery.vo2max === null
                          ? null
                          : data.risk.recovery.vo2max.toFixed(1),
                      caption: "Apple Cardio Fitness",
                    },
                  ]}
                />
              )}
            </Card>

            <SleepChart sleep30={data.sleep30} />
            <SleepStages sleep30={data.sleep30} />
            {/*
              Self-reported energy and motivation. On the coach's side this is
              the athlete's own words as numbers, so it sits with recovery
              rather than with training — it is how they say they are, not what
              they did.
            */}
            <MentalChart mental30={data.mental30} />

            <Card>
              <Text style={styles.blockTitle}>Injuries</Text>
              {data.injuries.filter((i) => !i.resolved_at).length === 0 ? (
                <Text style={styles.body}>No active injuries.</Text>
              ) : (
                data.injuries
                  .filter((i) => !i.resolved_at)
                  .map((i) => (
                    <Text key={i.id} style={styles.body}>
                      {i.body_part} · since {i.date.slice(0, 10)}
                    </Text>
                  ))
              )}
            </Card>
            </>
            )}

            {tab === "races" && (
            <>
            {data.races.upcoming.length > 0 ? (
              <Card>
                <Text style={styles.blockTitle}>Next race</Text>
                <Text style={styles.raceName}>{data.races.upcoming[0].name}</Text>
                <Text style={styles.body}>
                  {data.races.upcoming[0].event} · in {data.races.upcoming[0].daysUntil} days
                </Text>
                <Text style={styles.note}>
                  Predicted {data.races.upcoming[0].predicted}
                </Text>
              </Card>
            ) : null}

            <Card>
              <Text style={styles.blockTitle}>PRs vs predicted</Text>
              {data.prs.length === 0 ? (
                <Text style={styles.body}>No races logged yet.</Text>
              ) : (
                data.prs.map((pr) => (
                  <View key={pr.event} style={styles.prRow}>
                    <Text style={styles.prEvent}>{pr.event}</Text>
                    <Text style={styles.prValue}>{pr.label}</Text>
                    <Text style={styles.prPredicted}>
                      {data.predictions[pr.event]?.label ?? "—"}
                    </Text>
                  </View>
                ))
              )}
              <Text style={styles.note}>PR · predicted from recent training</Text>
            </Card>

            <PrChart progression={data.prProgression} />

            <Card>
              <Text style={styles.blockTitle}>Recent races</Text>
              {data.races.history.length === 0 ? (
                <Text style={styles.body}>No races logged yet.</Text>
              ) : (
                data.races.history.map((r) => (
                  <View key={r.id} style={styles.raceRow}>
                    <View style={styles.raceLeft}>
                      <Text style={styles.raceEvent}>{r.event}</Text>
                      <Text style={styles.raceDate}>{r.date.slice(0, 10)}</Text>
                    </View>
                    <Text style={styles.raceTime}>{r.time}</Text>
                    {/* A place is a fact and may genuinely be absent; the dash
                        is the unknown, never a 0 that would read as a result. */}
                    <Text style={styles.racePlace}>
                      {r.place === null ? "—" : `#${r.place}`}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            </>
            )}

            {tab === "chat" && (
            <>
            <Card>
              <Text style={styles.blockTitle}>What they&apos;ve asked</Text>
              <Text style={styles.note}>
                Their last 30 messages. Anything the safety filter caught is not
                here and never will be. See the route. You cannot reply from
                here; this is a record, not a conversation.
              </Text>
            </Card>

            {chatError ? (
              <Card>
                <Text style={styles.blockTitle}>Could not load the chat</Text>
                <Text style={styles.body}>{chatError}</Text>
              </Card>
            ) : chat === null ? (
              <View style={styles.skeleton} />
            ) : chat.length === 0 ? (
              <View style={styles.absentBlock}>
                <Text style={styles.absentDash}>—</Text>
                <Text style={styles.absentLabel}>
                  Nothing asked yet, or nothing a coach may see
                </Text>
              </View>
            ) : (
              chat
                // `safety` is false for every row by construction. A true one
                // means the server changed, not that a message arrived, so it
                // is dropped rather than rendered.
                .filter((m) => !m.safety)
                .map((m, i) => (
                  <View
                    key={i}
                    style={[styles.msg, m.role === "user" ? styles.msgAthlete : styles.msgAssistant]}
                  >
                    <Text style={styles.msgWho}>
                      {m.role === "user" ? data.athlete.name.split(" ")[0] : "RunGuard"}
                    </Text>
                    <Text style={styles.msgText}>{m.text}</Text>
                  </View>
                ))
            )}
            </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Readiness, or an explicit absence.
 *
 * The `known: false` arm is dashed, matching the roster's absent chip and the
 * athlete app's `Absent`. It is deliberately NOT a ring at some default value:
 * a partly-drawn gauge reads as low-but-present, which is the exact
 * misreading non-negotiable #6 forbids.
 */
function Readiness({ state }: { state: CoachAthlete["readiness"] }) {
  if (!state.known) {
    return (
      <View style={styles.readinessAbsent}>
        <Text style={styles.readinessDash}>—</Text>
        <Text style={styles.readinessAbsentLabel}>unknown</Text>
        <Text style={styles.readinessAbsentSub}>no check-in</Text>
      </View>
    );
  }
  return (
    <View style={styles.readinessKnown}>
      <Text style={styles.readinessValue}>{`${state.value}/100`}</Text>
      <Text style={styles.readinessLabel}>readiness</Text>
    </View>
  );
}

/**
 * One named pattern: a label, a figure, and one line saying how to read it.
 *
 * `value === null` is the absent case and prints the dash — an engine that
 * could not compute monotony has not measured 0.0, and the two must not look
 * alike. `warn` tints the FIGURE only, never the row: § "Status and advisory"
 * forbids turning a description into an alert, so there is no fill, no badge
 * and no icon here.
 */
function PatternRow({
  label,
  value,
  note,
  warn,
  info,
}: {
  label: string;
  value: string | null;
  note: string;
  warn: boolean;
  /**
   * The full definition, behind a tap. The website puts one on every pattern
   * row and it is the difference between a coach trusting a number and
   * guessing at it — "monotony 2.2" means nothing without knowing it is
   * Foster's, computed over 7 days, and what a high one implies.
   *
   * Behind a dot rather than inline because the short `note` is what gets read
   * every morning and the definition is read once.
   */
  info?: string;
}) {
  return (
    <View style={styles.patternRow}>
      <View style={styles.patternText}>
        <View style={styles.patternLabelRow}>
          <Text style={styles.patternLabel}>{label}</Text>
          {info ? <InfoDot label={label} text={info} /> : null}
        </View>
        <Text style={styles.patternNote}>{note}</Text>
      </View>
      <Text
        style={[
          styles.patternValue,
          value === null && styles.patternValueAbsent,
          value !== null && warn && styles.patternValueWarn,
        ]}
      >
        {value ?? "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  safe: { flex: 1, backgroundColor: color.bg },
  identity: {
    paddingHorizontal: layout.page,
    paddingBottom: space.md,
    borderBottomWidth: ruleWidth,
    borderBottomColor: color.ruleSoft,
    backgroundColor: color.bg,
  },
  back: { minHeight: target.min, justifyContent: "center" },
  backLabel: { ...text.base, color: color.muted },
  identityRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  identityText: { flex: 1 },
  name: { ...text.title, color: color.ink },
  sub: { ...text.meta, color: color.muted },

  segments: {
    flexDirection: "row",
    // Without this the chips stretch to the ScrollView's full height — a
    // horizontal ScrollView gives its children the whole cross axis, so the
    // selected one rendered as a tall column instead of a pill.
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: layout.page,
    paddingVertical: space.sm,
  },
  segment: {
    minHeight: target.min,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: ruleWidth,
    borderColor: "transparent",
  },
  /* The selected section carries the ember — the one accent this product
     spends on the thing you tapped. Fill AND border, so the selection survives
     greyscale rather than resting on hue alone. */
  segmentOn: { backgroundColor: color.accentSoft, borderColor: color.brandStrong },
  segmentLabel: { ...text.meta, color: color.muted },
  segmentLabelOn: { color: color.ink },

  rangeRow: { paddingHorizontal: layout.page, paddingBottom: space.xs },
  rangeNote: { ...text.meta, color: color.muted },
  page: { padding: layout.page, gap: space.lg, paddingBottom: space.xxxl },
  skeleton: { height: 280, borderRadius: radius.card, backgroundColor: color.well },

  /* Sentence case — see the roster. */
  eyebrow: { ...text.meta, color: color.muted },
  advisory: { marginTop: space.sm },
  blockTitle: { ...text.title, color: color.ink, marginBottom: space.sm },
  body: { ...text.base, color: color.ink2, marginTop: space.xs },
  score: { fontFamily: font.mono, color: color.ink, ...tabular },


  readinessKnown: { alignItems: "flex-end" },
  readinessValue: { ...text.stat, color: color.ink },
  readinessLabel: { ...text.meta, color: color.muted },
  readinessAbsent: {
    alignItems: "center",
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    backgroundColor: color.well,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  readinessDash: { ...text.stat, color: color.unknown, lineHeight: 22 },
  readinessAbsentLabel: { ...text.meta, color: color.ink2 },
  readinessAbsentSub: { ...text.meta, color: color.muted, fontSize: 11 },

  runRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min,
    paddingVertical: space.sm,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  note: { ...text.meta, color: color.muted, marginTop: space.xs },

  patternRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  patternText: { flex: 1 },
  patternLabelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  patternLabel: { ...text.base, color: color.ink },
  patternNote: { ...text.meta, color: color.muted },
  patternValue: { ...text.stat, color: color.ink, ...tabular },
  patternValueAbsent: { color: color.unknown },
  /** The FIGURE only. Never the row — a tinted row reads as an alert. */
  patternValueWarn: { color: color.watchText },

  /** One dashed slot for "no wearable at all", never three. */
  absentBlock: {
    marginTop: space.md,
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    backgroundColor: color.well,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  absentDash: { ...text.stat, color: color.unknown },
  absentLabel: { ...text.meta, color: color.ink2, marginTop: space.xs },

  raceName: { ...text.baseSemi, color: color.ink, marginTop: space.sm },

  /**
   * The falling-energy notice. A LEFT RULE, not a filled banner.
   * § "Status and advisory" forbids alert styling: no fill, no icon from a
   * warning set, no imperative. It is a description of what was reported, and
   * its own copy says so — "not a number to act on by itself".
   */
  trend: {
    marginTop: space.md,
    paddingLeft: space.md,
    borderLeftWidth: 3,
    borderLeftColor: color.watch,
  },
  trendText: { ...text.meta, color: color.ink2 },

  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  prEvent: { ...text.meta, color: color.muted, flex: 1 },
  prValue: { ...text.meta, fontFamily: font.mono, color: color.ink, width: 72, textAlign: "right", ...tabular },
  prPredicted: { ...text.meta, fontFamily: font.mono, color: color.brandText, width: 72, textAlign: "right", ...tabular },

  quote: { ...text.base, color: color.ink2, marginTop: space.sm, fontStyle: "italic" },

  /*
   * Deliberately NOT the athlete app's ChatBubble geometry.
   *
   * That component is the athlete's own conversation. This is a coach reading
   * a record of it, and dressing it as a live chat invites the one thing the
   * route forbids — trying to answer. Flat rows on a left rule, no bubbles, no
   * tails, no timestamps, no reply affordance anywhere on the screen.
   */
  msg: {
    paddingLeft: space.md,
    paddingVertical: space.sm,
    borderLeftWidth: 3,
  },
  msgAthlete: { borderLeftColor: color.brandStrong },
  msgAssistant: { borderLeftColor: color.rule },
  msgWho: { ...text.micro, color: color.muted },
  msgText: { ...text.base, color: color.ink2, marginTop: space.xs },

  raceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  raceLeft: { flex: 1 },
  raceEvent: { ...text.base, color: color.ink },
  raceDate: { ...text.meta, color: color.muted },
  raceTime: { ...text.meta, fontFamily: font.mono, color: color.ink, ...tabular },
  racePlace: { ...text.meta, fontFamily: font.mono, color: color.muted, width: 40, textAlign: "right", ...tabular },

  runDate: { ...text.meta, color: color.muted, flex: 1 },
  runChevron: { ...text.base, color: color.muted, marginLeft: space.xs },
  runStat: { ...text.meta, fontFamily: font.mono, color: color.ink, ...tabular },
});
