/**
 * Races — what is coming, and what has already been run.
 *
 * Sunrise skin: cream ground, white cards, and the ember reserved for two jobs —
 * the gradient strip on a race that is nearly here, and the split markers in the
 * pacing plan. A PR is still a plain two-letter label, not a badge, a medal or a
 * fill: the screen is a printed results sheet, not a trophy cabinet, and that
 * call survives the re-skin.
 *
 * Every block follows the website's Panel hierarchy (`website/src/components/
 * athlete/tabs.tsx:22`): title on the left, a muted note on the right carrying
 * the caveat, then the content.
 *
 * HONESTY: `race.predicted` is a model output, not a measurement. With no synced
 * activity it is the model talking to itself, so — exactly as the website does
 * (`tabs.tsx:681`) — everything downstream of it is gated on
 * `risk.hasActivityHistory`. That includes `race.pacing`, whose sentences quote
 * the predicted splits back at you.
 *
 * `UpcomingRace` and `RaceHistoryEntry` both come from lib/types, which is the
 * single declaration of what /api/mobile/me sends. This screen used to narrow
 * the history leg locally, because the contract did not carry it; it does now,
 * and two descriptions of one payload are free to drift apart.
 */
import { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { Absent } from "../../components/Nothing";
import { Card } from "../../components/Card";
import { Stat } from "../../components/Stat";
import { AddRaceForm, RemoveRace } from "../../components/AddRaceForm";
import { LogResultForm } from "../../components/LogResultForm";
import { PrChart } from "../../components/charts/PrChart";
import { dayLabel } from "../../lib/dates";
import { fmtDuration } from "../../lib/units";
import { useProfile } from "../../lib/profileStore";
import { fitnessKnown } from "../../lib/readiness";
import type { Profile, RaceHistoryEntry, UpcomingRace } from "../../lib/types";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/**
 * Inside this many days the card wears the ember strip. Ported from the
 * website, which switches the race card's border to `--brand` at the same
 * threshold (tabs.tsx:668).
 */
const IMMINENT_DAYS = 7;

/** "in 12 days", welded, in one node. Today and tomorrow read as words. */
function countdownLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil} days`;
}

/** 3 → "3rd". The ordinal is welded to the numeral, never rendered apart. */
function placeLabel(place: number): string {
  const teens = place % 100;
  if (teens >= 11 && teens <= 13) return `${place}th`;
  const last = place % 10;
  const suffix = last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${place}${suffix}`;
}

/**
 * "6 races" — the numeral and its noun in ONE node, never a bare count with the
 * word rendered beside it.
 */
function countLabel(n: number): string {
  return `${n} ${n === 1 ? "race" : "races"}`;
}

/**
 * The screen header. `count` is null until the payload lands, and is withheld
 * at zero: an empty card is Absent, and "0 races" would state a measured fact
 * we do not have. The figure sits beside the heading, so nothing shifts
 * vertically when it appears.
 *
 * `stale` adds ONE quiet line when a refetch failed over races already on
 * screen. The whole-page failure below stays reserved for having nothing.
 */
function Header({ count, stale }: { count: number | null; stale?: boolean }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Race log</Text>
      <View style={styles.panelHead}>
        <Text style={styles.heading}>Races</Text>
        {count !== null && count > 0 ? (
          <Text style={styles.count}>{countLabel(count)}</Text>
        ) : null}
      </View>
      <Text style={styles.note}>
        {"What is coming, and what you have already run."}
      </Text>
      {stale ? (
        <Text style={styles.note}>
          Could not reach your server just now. These are the races last loaded.
        </Text>
      ) : null}
    </View>
  );
}

/** The Panel hierarchy: title left, caveat right, content below. */
function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.panelHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionNote}>{note}</Text>
    </View>
  );
}

/**
 * The split-by-split plan. Server-composed sentences, rendered as description —
 * markers are shapes, so the block never reads as a set of orders.
 *
 * Only ever mounted when the prediction is trustworthy; see `UpcomingCard`.
 */
function Pacing({ lines, predicted }: { lines: string[]; predicted: string }) {
  return (
    <View style={styles.pacing}>
      <View style={styles.panelHead}>
        <Text style={styles.pacingTitle}>Pacing strategy</Text>
        <Text style={styles.pacingNote}>{`from your predicted ${predicted}`}</Text>
      </View>
      {lines.map((line, i) => (
        <View key={i} style={styles.splitRow}>
          {/* A shape, not a glyph: `brand` is a fill token and unreadable as type. */}
          <View style={styles.splitMarkCol}>
            <View style={styles.splitMark} />
          </View>
          <Text style={styles.splitText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function UpcomingCard({
  race,
  predictionKnown,
  onChanged,
}: {
  race: UpcomingRace;
  /** `risk.hasActivityHistory`. False = the model has nothing to stand on. */
  predictionKnown: boolean;
  onChanged: () => void;
}) {
  const soon = race.daysUntil <= IMMINENT_DAYS;
  return (
    <Card padded={false}>
      {soon ? (
        <LinearGradient
          colors={color.ember}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ember}
        />
      ) : null}
      <View style={styles.upcomingBody}>
        <View style={styles.panelHead}>
          <Text style={styles.title}>{race.name}</Text>
          <Text style={soon ? styles.countdownSoon : styles.countdown}>
            {countdownLabel(race.daysUntil)}
          </Text>
        </View>
        {/*
          Everything known about WHERE and WHEN, joined at render.

          Built by filtering then joining rather than interpolating with
          separators: the old line was `${date} · ${location}` behind a ternary,
          and adding two more optional parts that way produces "Sat 12 Sep ·  ·
          09:30" the moment one of them is missing — a gap that reads as data
          that failed to load rather than a field nobody filled in.

          All three new fields are optional on the wire (see lib/types), so an
          older server simply contributes fewer parts.
        */}
        <Text style={styles.eyebrow}>
          {[
            dayLabel(race.date),
            race.course_type,
            race.location,
            race.start_time ? `gun ${race.start_time}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        {/*
          The priority, spelled out rather than shown as a bare letter. "A" is
          jargon; what the athlete needs to know is whether this is the race the
          season points at. No colour and no fill — it describes the race, it
          does not rate it (non-negotiable #5).
        */}
        {race.priority ? (
          <Text style={styles.priority}>{PRIORITY_WORD[race.priority] ?? race.priority}</Text>
        ) : null}

        {race.notes ? <Text style={styles.raceNote}>{race.notes}</Text> : null}

        <View style={styles.upcomingStats}>
          <Stat label="Event" value={race.event} />
          {predictionKnown ? (
            <Stat label="Predicted" value={race.predicted} />
          ) : null}
        </View>

        {predictionKnown ? (
          race.pacing.length > 0 ? (
            <Pacing lines={race.pacing} predicted={race.predicted} />
          ) : null
        ) : (
          // Dashed, because we do not know — never a confident finishing time
          // for an athlete who has synced nothing.
          <View style={styles.predictedAbsent}>
            <Absent eyebrow="Predicted" label="Not enough data yet." />
          </View>
        )}

        {/*
          The website's pre-race checklist (tabs.tsx:700-705), reworded and
          gated.

          REWORDED because a checklist is imperative by construction and
          non-negotiable #5 says the app describes rather than instructs. Four
          `☐` boxes with orders beside them is the most instructional thing the
          app could render, and it would sit next to a green tick glyph that
          § "Nothing shouts" also rules out. What survives is the same four
          facts, stated as what athletes usually do — which is what the list was
          actually telling you.

          GATED because a checklist for a race five months away is noise. It
          appears inside the same imminence window the ember strip uses, so the
          card grows detail as the race gets close rather than carrying it all
          season.
        */}
        {soon ? (
          <View style={styles.checklist}>
            <Text style={styles.checklistHead}>In the last few days</Text>
            {PRE_RACE.map((line) => (
              <Text key={line} style={styles.checklistLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Renders null unless `canEdit` — coach-added and seeded races are not
            the athlete's to remove, and the server agrees on the same
            comparison, so this is the boundary and not a hint. */}
        <RemoveRace race={race} onChanged={onChanged} />
      </View>
    </Card>
  );
}

/**
 * How the race went, in the athlete's own word.
 *
 * `feel` is null when they did not say — which is NOT "ok". The form that writes
 * this deliberately pre-selects nothing (the website defaults to "ok", so an
 * athlete who touches neither control stores a verdict they never gave), and
 * that care would be undone here by printing a default. A missing feel renders
 * nothing at all rather than a neutral-looking word.
 *
 * No colour on any of the three: "rough" is a description of a race, not a
 * failure to style in red (non-negotiable #5).
 */
/**
 * The website's four checklist items, restated as description.
 *
 *   "8+ hours of sleep the two nights before"
 *     → "Most people sleep 8+ hours on each of the two nights before."
 *   "Carbs + water with every meal the day prior"
 *     → "The day before usually means carbohydrate and water with every meal."
 *   "Kit laid out the night before"
 *     → "Kit is usually laid out the night before."
 *   "20 min warmup + 4 strides, done 15 min before the gun"
 *     → "A warm-up is usually 20 minutes plus four strides, finishing about 15
 *        minutes before the gun."
 *
 * Same four facts, same numbers, no imperative verb and no checkbox. The last
 * one is also the wording `lib/workout`'s race-day block already uses, so the
 * two places that describe a warm-up agree.
 */
const PRE_RACE = [
  "Most people sleep 8+ hours on each of the two nights before.",
  "The day before usually means carbohydrate and water with every meal.",
  "Kit is usually laid out the night before.",
  "A warm-up is usually 20 minutes plus four strides, finishing about 15 minutes before the gun.",
] as const;

/**
 * What an A/B/C race actually is, in words.
 *
 * The letters are coaching shorthand an athlete may never have been taught, and
 * the difference matters most to the person deciding how hard to go: a C race
 * run flat out is how a season gets wrecked in September.
 */
const PRIORITY_WORD: Record<string, string> = {
  A: "A race — the one this season points at",
  B: "B race — race it, but the week is not built around it",
  C: "C race — a training effort",
};

const FEEL_WORD: Record<string, string> = {
  great: "felt great",
  ok: "felt ok",
  rough: "felt rough",
};

function ResultRow({ result }: { result: RaceHistoryEntry }) {
  const feel = result.feel ? FEEL_WORD[result.feel] : null;
  const splits = result.splits ?? null;
  return (
    <View style={styles.resultRow}>
      <View style={styles.resultLeft}>
        <Text style={styles.eyebrow}>
          {`${dayLabel(result.date)} · ${result.event}`}
        </Text>
        <Text style={styles.time}>{result.time}</Text>

        {/*
          Splits, conditions and feel have been on the payload and declared in
          lib/types since the app was built, and rendered nowhere until now.

          Splits wrap as a mono run of times rather than becoming a table: a
          variable-length list of 3–12 figures has no column count that works at
          360px, and every one goes through fmtDuration so none is a bare
          numeral (non-negotiable #3).
        */}
        {splits && splits.length > 0 ? (
          <Text style={styles.splits}>
            {splits.map((s) => fmtDuration(s)).join("  ·  ")}
          </Text>
        ) : null}
        {feel || result.conditions ? (
          <Text style={styles.raceNote}>
            {[feel, result.conditions].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {/* The athlete's own sentence about the race, on its own line rather
            than joined to the row above: it is prose, and joining it to "felt
            rough · windy" with a dot would read as a fourth tag. */}
        {result.notes ? <Text style={styles.raceNote}>{result.notes}</Text> : null}
      </View>
      <View style={styles.resultRight}>
        {result.isPr ? <Text style={styles.pr}>PR</Text> : null}
        {result.place === null ? (
          // Not a value slot: prose, so a missing place cannot be misread as a
          // finishing position.
          <Text style={styles.placeAbsent}>place not recorded</Text>
        ) : (
          <Text style={styles.place}>{placeLabel(result.place)}</Text>
        )}
      </View>
    </View>
  );
}

export default function RacesScreen() {
  // Shared `/me`, and with it the single 401 path — a revoked token ends the
  // session from inside the store rather than from five separate catch blocks.
  const { profile: shared, state, refreshing, refresh, invalidate } = useProfile();
  /** `races.history` is not in the contract yet — see Profile. */
  const profile: Profile | null = shared;
  const failed = state === "failed";

  /** Soonest first. YYYY-MM-DD sorts lexically. */
  const upcoming = useMemo(
    () =>
      [...(profile?.races?.upcoming ?? [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    [profile],
  );

  /** Most recent first. */
  const history = useMemo(
    () =>
      [...(profile?.races?.history ?? [])].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    [profile],
  );

  // Only with nothing on screen. A failed refetch over loaded races keeps them.
  if (failed && !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Header count={null} />
          <Card>
            <Text style={styles.failed}>Your races could not be loaded.</Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your races again"
              style={styles.retry}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Header count={null} />
          {/* Reserves height so the sections do not jump as data arrives. */}
          <View style={styles.sections}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Predictions come from `predictRaces`, which takes `fitness.score` — and
  // that is a fabricated 50 whenever the model had nothing. See fitnessKnown.
  const predictionKnown = fitnessKnown(profile);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        /* Pull to refetch. Nothing below dims while it runs — a predicted time
           that fades reads as a prediction losing confidence, which it is not. */
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        <Header count={upcoming.length + history.length} stale={failed} />

        <View style={styles.sections}>
          <View style={styles.section}>
            <SectionHeading
              title="Upcoming"
              note={
                predictionKnown
                  ? "Predicted times come from your recent training."
                  : "Predictions need synced runs."
              }
            />
            {upcoming.length === 0 ? (
              <Absent label="No races scheduled." />
            ) : (
              upcoming.map((race) => (
                <UpcomingCard
                  key={race.id}
                  race={race}
                  predictionKnown={predictionKnown}
                  onChanged={invalidate}
                />
              ))
            )}
            <AddRaceForm onChanged={invalidate} />
          </View>

          <View style={styles.section}>
            <SectionHeading title="History" note="Every step down is a PR." />
            {history.length === 0 ? (
              <Absent label="No races run yet." />
            ) : (
              <Card padded={false}>
                {history.map((result, i) => (
                  <View
                    key={result.id}
                    style={i > 0 ? styles.divided : undefined}
                  >
                    <ResultRow result={result} />
                  </View>
                ))}
              </Card>
            )}
            <LogResultForm onChanged={invalidate} />
          </View>

          {/* PR progression. Owns its own Card and head — do not wrap it.
              Below History on purpose: the times themselves come first, and
              this says how they moved. */}
          <View style={styles.section}>
            <PrChart progression={profile.races?.prProgression} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  sections: { gap: layout.section },
  section: { gap: space.md },
  splits: {
    ...text.meta,
    fontFamily: font.mono,
    // Mandatory on any mono numeral (theme/type.ts) — `text.meta` is a body
    // role and does not carry it, so overriding the family has to bring it
    // along. Without it a wrapped run of splits mis-aligns line to line.
    ...tabular,
    color: color.ink2,
    marginTop: space.xs,
  },
  raceNote: { ...text.meta, color: color.muted, marginTop: space.xs },
  /** Ember-coloured meta on the card ground — the pairing `countdown` uses.
      A word about the race, not a badge that rates it. */
  priority: { ...text.meta, color: color.brandText, marginTop: space.xs },
  checklist: { gap: space.xs, marginTop: space.md },
  checklistHead: { ...text.micro, color: color.muted },
  /** Prose, no marker, no glyph — see the block that renders this. */
  checklistLine: { ...text.meta, color: color.ink2 },
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.title, color: color.ink, flexShrink: 1 },
  failed: { ...text.base, color: color.ink2 },
  /** Ember fill, ink glyph — `brand` is a fill token, so no word sits on it. */
  retry: {
    marginTop: space.xl,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },

  header: { marginBottom: layout.section },
  /** The Panel row: title left, note right, baselines shared, wraps at 360px. */
  panelHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: space.xs,
  },
  heading: { ...text.title, color: color.ink },
  /**
   * Mono, with the noun welded on. Never a bare numeral. Ember on type, so it
   * takes `brandText` — 4.88:1 on `bg`, where `brand` itself is 2.01:1.
   */
  count: { ...text.stat, color: color.brandText },
  sectionTitle: { ...text.title, color: color.ink },
  sectionNote: { ...text.meta, color: color.muted, flexShrink: 1 },
  note: { ...text.meta, color: color.muted, marginTop: space.xs },

  /** The one loud thing on the screen, and only when the race is nearly here. */
  ember: {
    height: space.xs,
    borderTopLeftRadius: radius.card - ruleWidth,
    borderTopRightRadius: radius.card - ruleWidth,
  },
  upcomingBody: { padding: layout.cardPadding },
  countdown: { ...text.micro, color: color.muted },
  /** brandText, not brand: 5.21:1 on `card`, against 2.01:1 for the fill. */
  countdownSoon: { ...text.micro, color: color.brandText },
  upcomingStats: { flexDirection: "row", gap: space.xxl, marginTop: space.lg },
  predictedAbsent: { marginTop: space.lg },

  pacing: {
    marginTop: space.lg,
    paddingTop: space.xs,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  pacingTitle: { ...text.baseSemi, color: color.ink },
  pacingNote: { ...text.micro, color: color.muted, flexShrink: 1 },
  splitRow: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  /** Centres the marker on the first line without hardcoding an offset. */
  splitMarkCol: {
    height: text.meta.lineHeight,
    justifyContent: "center",
  },
  splitMark: {
    width: space.sm,
    height: space.sm,
    borderRadius: space.xs,
    backgroundColor: color.brand,
  },
  splitText: { ...text.meta, color: color.ink2, flexShrink: 1 },

  resultRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.lg,
    padding: layout.cardPadding,
  },
  resultLeft: { flexShrink: 1, gap: space.xs },
  resultRight: { alignItems: "flex-end", gap: space.xs },
  divided: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },

  time: { ...text.stat, color: color.ink },
  place: { ...text.stat, color: color.ink },
  placeAbsent: { ...text.meta, color: color.muted },
  /** A plain label. No fill, no shape, no colour — it is a fact, not a prize. */
  pr: { ...text.micro, color: color.ink2 },

  skeletonCard: {
    height: space.xxxl * 2,
    borderRadius: radius.card,
    backgroundColor: color.well,
  },
});
