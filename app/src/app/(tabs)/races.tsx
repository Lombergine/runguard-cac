/**
 * Races — what is coming, and what has already been run.
 *
 * Sunrise skin: cream ground, white cards, and the ember reserved for three
 * jobs — the gradient strip on a race that is nearly here, the countdown tile
 * on that same race, and the split markers in the pacing plan. All three are
 * gated on the SAME seven-day window, so a season's worth of scheduled races
 * still spends the accent exactly once. A PR is still a plain two-letter label,
 * not a badge, a medal or a fill: the screen is a printed results sheet, not a
 * trophy cabinet, and that call survives the re-skin.
 *
 * Groups are labelled with `Section` — the label above the card, at
 * `text.micro`. `Panel`'s in-card title rank (`website/src/components/athlete/
 * tabs.tsx:22`) is not used here any more; the last of it was the pacing
 * block's own heading.
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
import { Section } from "../../components/Section";
import { ScreenHeader, useTabHeaderActions } from "../../components/ScreenHeader";
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
import { dim } from "../../theme/press";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/**
 * Inside this many days the card wears the ember strip. Ported from the
 * website, which switches the race card's border to `--brand` at the same
 * threshold (tabs.tsx:668).
 */
const IMMINENT_DAYS = 7;

/**
 * "12 days", welded, in ONE node. Today and tomorrow read as words.
 *
 * The design's countdown block stacks a bare `700 24px` numeral over a
 * `600 10px` uppercase "days". That is exactly the shape non-negotiable #3
 * forbids — "never a bare numeral next to a unit elsewhere in the layout" — so
 * the two halves stay welded and the tile holds one node. Its hierarchy
 * survives: the figure is still the largest thing in the block, in the ember,
 * on the ember wash.
 *
 * "in " is dropped, because in the tile the preposition is what a caption would
 * carry, not the figure.
 */
function countdownLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  return `${daysUntil} days`;
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
/**
 * The screen header. `count` is null until the payload lands, and is withheld
 * at zero: an empty card is Absent, and "0 races" would state a measured fact
 * we do not have. The figure sits beside the heading, so nothing shifts
 * vertically when it appears.
 *
 * `stale` adds ONE quiet line when a refetch failed over races already on
 * screen. The whole-page failure below stays reserved for having nothing.
 */
/**
 * The title, subtitle and race count moved to `ScreenHeader` above the
 * scroller — the design's pinned header. The eyebrow ("Race log") went with
 * them: the design puts none above a screen title, and it named the same thing
 * the title does.
 *
 * What stays is the stale-data notice, which belongs beside the races it is
 * qualifying rather than in chrome that is always on screen.
 */
function Header({ stale }: { stale?: boolean }) {
  if (!stale) return null;
  return (
    <View style={styles.header}>
      {stale ? (
        <Text style={styles.note}>
          Could not reach your server just now. These are the races last loaded.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The split-by-split plan. Server-composed sentences, rendered as description —
 * markers are shapes, so the block never reads as a set of orders.
 *
 * Only ever mounted when the prediction is trustworthy; see `UpcomingCard`.
 * `race.pacing` is the server's; nothing here composes a line, and an empty
 * array renders nothing at all rather than an invented plan.
 *
 * A LABELLED GROUP, on the shared `Section`, where it used to carry a local
 * `text.baseSemi` title of its own. That rank is a panel title — it names the
 * one surface it is drawn on — and this names a group of rows, which is
 * `Section`'s job and the rank the design draws here.
 *
 * IT STAYS INSIDE ITS RACE'S CARD. The design's screen has exactly one upcoming
 * race, so it can put the pacing group between the hero and the PRs; this
 * screen renders a card per upcoming race, and a screen-level group could only
 * serve one of them. Lifting it out would silently drop the plan for every race
 * but the next. So the design's rank is adopted and its position is not.
 */
function Pacing({ lines, predicted }: { lines: string[]; predicted: string }) {
  return (
    <Section
      label="Pacing strategy"
      /* A NODE, because the caveat is a figure: the predicted time is mono and
         tabular like every other numeral in the app. */
      note={
        <>
          {"from your predicted "}
          <Text style={styles.figure}>{predicted}</Text>
        </>
      }
      style={styles.pacing}
    >
      {lines.map((line, i) => (
        <View key={i}>
          {/* BETWEEN rows only — a rule above the first or below the last reads
              as a clipped row. See docs/design-port.md, structure 6. */}
          {i > 0 ? <View style={styles.splitRule} pointerEvents="none" /> : null}
          <View style={styles.splitRow}>
            {/* A shape, not a glyph: `brand` is a fill token and unreadable as type. */}
            <View style={styles.splitMarkCol}>
              <View style={styles.splitMark} />
            </View>
            <Text style={styles.splitText}>{line}</Text>
          </View>
        </View>
      ))}
    </Section>
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
        {/*
          The design's countdown block: a rounded tile holding the figure.

          Its wash and its figure are gated on `soon`, the same window the ember
          strip above uses. The design paints every countdown in the accent;
          this screen's own rule is that the ember has two jobs here — the strip
          on a race that is nearly here, and the split markers — and a third
          ember on every card in a season's worth of races is exactly the
          rationing § "Colour is rationed" rules out. A race months away gets
          the neutral system fill instead, so the tile is still a tile and the
          colour still means "this one is close".

          `brandText`, never `brand`: the fill is 2.01:1 and this is a word.
          #976106 on `accentSoft` measures 4.51:1, and on `fill` over `card`
          `ink2` is far clear of the floor.
        */}
        <View style={styles.heroHead}>
          <Text style={styles.title}>{race.name}</Text>
          <View style={soon ? styles.countdownTileSoon : styles.countdownTile}>
            <Text style={soon ? styles.countdownSoon : styles.countdown}>
              {countdownLabel(race.daysUntil)}
            </Text>
          </View>
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
            {PRE_RACE.map((line, i) => (
              <Text key={i} style={styles.checklistLine}>
                {line.map((part, j) =>
                  typeof part === "string" ? (
                    part
                  ) : (
                    <Text key={j} style={styles.figure}>
                      {part.fig}
                    </Text>
                  ),
                )}
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
 * A line of prose that has figures in it. Strings render in the body face; a
 * `{ fig }` part becomes a mono, tabular span inside the same text flow, so the
 * sentence still wraps as one paragraph.
 */
type ProseLine = readonly (string | { fig: string })[];

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
 *
 * Each sentence is a SEQUENCE OF PARTS rather than one string, because every
 * numeral in this app is mono and tabular (non-negotiable #3) and these are the
 * only figures on the screen that sit inside body prose. A `{ fig }` part is one
 * welded node carrying the numeral AND its unit — "8+ hours", "20 minutes" —
 * never a bare numeral with the word rendered beside it.
 */
const PRE_RACE: readonly ProseLine[] = [
  ["Most people sleep ", { fig: "8+ hours" }, " on each of the two nights before."],
  ["The day before usually means carbohydrate and water with every meal."],
  ["Kit is usually laid out the night before."],
  [
    "A warm-up is usually ",
    { fig: "20 minutes" },
    " plus four strides, finishing about ",
    { fig: "15 minutes" },
    " before the gun.",
  ],
];

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
  const actions = useTabHeaderActions();
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
        <ScreenHeader
          title="Races"
          subtitle="Next up, pacing and your PRs"
          actions={actions}
        />
        <View style={styles.page}>
          <Header />
          <Card>
            <Text style={styles.failed}>Your races could not be loaded.</Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your races again"
              style={({ pressed }) => [styles.retry, dim(pressed)]}
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
        <ScreenHeader
          title="Races"
          subtitle="Next up, pacing and your PRs"
          actions={actions}
        />
        <View style={styles.page}>
          <Header />
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
        <Header stale={failed} />

        <View style={styles.sections}>
          <Section
            label="Upcoming"
            note={
              predictionKnown
                ? "Predicted times come from your recent training."
                : "Predictions need synced runs."
            }
            style={styles.section}
          >
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
          </Section>

          <Section label="History" note="Every step down is a PR." style={styles.section}>
            {history.length === 0 ? (
              <Absent label="No races run yet." />
            ) : (
              <Card padded={false}>
                {history.map((result, i) => (
                  <View key={result.id}>
                    {/* BETWEEN rows only, and inset from the left so it starts
                        under the row's own text — the way iOS draws a list and
                        the way `components/List` already does it. It ran corner
                        to corner here, which reads as a table rule rather than
                        as one list. */}
                    {i > 0 ? (
                      <View style={styles.separator} pointerEvents="none" />
                    ) : null}
                    <ResultRow result={result} />
                  </View>
                ))}
              </Card>
            )}
            <LogResultForm onChanged={invalidate} />
          </Section>

          {/*
            The third group, and the only one that was still unlabelled — its
            card simply began. `PrChart` owns its own Card and its own per-event
            heads, which its styles call "one step down from the screen's
            section heading"; this is that heading.

            Below History on purpose: the times themselves come first, and this
            says how they moved.
          */}
          <Section label="PR progression" style={styles.section}>
            <PrChart progression={profile.races?.prProgression} />
          </Section>
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
  /**
   * `text.statInline` — the 14 mono tabular rank, which is exactly what this
   * was building by hand out of `text.meta` plus the mono family plus
   * `tabular`. A figure sitting under the thing it describes now has a named
   * role, so this stops being a fourth place the app spells one out.
   */
  splits: { ...text.statInline, color: color.ink2, marginTop: space.xs },
  raceNote: { ...text.meta, color: color.muted, marginTop: space.xs },
  /** Ember-coloured meta on the card ground — the pairing `countdown` uses.
      A word about the race, not a badge that rates it. */
  priority: { ...text.meta, color: color.brandText, marginTop: space.xs },
  checklist: { gap: space.xs, marginTop: space.md },
  checklistHead: { ...text.micro, color: color.muted },
  /** Prose, no marker, no glyph — see the block that renders this. */
  checklistLine: { ...text.meta, color: color.ink2 },
  /**
   * A figure inside a body sentence. Family and tabular figures ONLY — size,
   * leading and colour inherit from the enclosing `Text`, so the numeral changes
   * face without breaking the paragraph it sits in.
   */
  figure: { fontFamily: font.mono, ...tabular },
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
    borderCurve: "continuous",
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },

  header: { marginBottom: layout.section },
  note: { ...text.meta, color: color.muted, marginTop: space.xs },

  /** The one loud thing on the screen, and only when the race is nearly here. */
  ember: {
    height: space.xs,
    borderTopLeftRadius: radius.card - ruleWidth,
    borderTopRightRadius: radius.card - ruleWidth,
    // The squircle iOS draws, matching the Card corner this strip caps.
    borderCurve: "continuous",
  },
  /**
   * The hero row: the race's name left, the countdown tile right.
   *
   * `flex-start`, not the baseline the panel head shared: the right-hand child
   * is now a tile rather than a line of type, and a baseline-aligned box hangs
   * its bottom edge off the title's baseline. Still wrapping, so a long name
   * drops the tile to its own line at 360pt rather than squeezing it.
   */
  heroHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: space.xs,
  },
  upcomingBody: { padding: layout.cardPadding },
  /**
   * The countdown tile. `radius.card` and the 4px scale, not the design's
   * literal 18 and 18 — the theme is the single source (app/CLAUDE.md), and a
   * one-off 18 welds this corner to nothing else on the screen.
   */
  countdownTile: {
    backgroundColor: color.fill,
    borderRadius: radius.card,
    borderCurve: "continuous",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  countdownTileSoon: {
    backgroundColor: color.accentSoft,
    borderRadius: radius.card,
    borderCurve: "continuous",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  /**
   * `text.stat` — 22 mono, tabular. The design sets this figure at `700 24px`
   * sans; every numeral in this app is mono and tabular, and `stat` is the rank
   * the port maps that role onto (docs/design-port.md, type 3).
   */
  countdown: { ...text.stat, color: color.ink2 },
  /** brandText, not brand: 4.51:1 on `accentSoft`, against 2.01:1 for the fill. */
  countdownSoon: { ...text.stat, color: color.brandText },
  upcomingStats: { flexDirection: "row", gap: space.xxl, marginTop: space.lg },
  predictedAbsent: { marginTop: space.lg },

  pacing: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
  },
  splitRow: {
    flexDirection: "row",
    gap: space.sm,
    paddingVertical: space.md,
  },
  /** BETWEEN split rows only. Full width of the block, which is already inset
      by the card's own padding. */
  splitRule: { height: ruleWidth, backgroundColor: color.ruleSoft },
  /** Centres the marker on the first line without hardcoding an offset. */
  splitMarkCol: {
    height: text.meta.lineHeight,
    justifyContent: "center",
  },
  splitMark: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
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
  /** Inset left, full-bleed right — `List.separator`'s geometry, as a bar. */
  separator: {
    height: ruleWidth,
    marginLeft: layout.cardPadding,
    backgroundColor: color.ruleSoft,
  },

  time: { ...text.stat, color: color.ink },
  place: { ...text.stat, color: color.ink },
  placeAbsent: { ...text.meta, color: color.muted },
  /** A plain label. No fill, no shape, no colour — it is a fact, not a prize. */
  pr: { ...text.micro, color: color.ink2 },

  skeletonCard: {
    height: space.xxxl * 2,
    borderRadius: radius.card,
    borderCurve: "continuous",
    backgroundColor: color.well,
  },
});
