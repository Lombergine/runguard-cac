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
 * `UpcomingRace` comes from lib/types. `races.history` does not exist in that
 * contract yet, so `RaceResult` below narrows the real payload
 * (`CoreProfile.races.history` in website/src/lib/profile.ts) to the fields this
 * screen reads — local on purpose; types.ts stays untouched.
 */
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { Absent } from "../../components/Nothing";
import { Card } from "../../components/Card";
import { Stat } from "../../components/Stat";
import { getProfile } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import type { Profile, UpcomingRace } from "../../lib/types";
import { layout, radius, ruleWidth, space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

type RaceResult = {
  id: number;
  event: string;
  date: string;
  /** Pre-formatted finishing time, e.g. "18:42". */
  time: string;
  place: number | null;
  isPr: boolean;
};

/** `Profile["races"]` plus the history leg, which the contract does not carry. */
type WithRaces = Omit<Profile, "races"> & {
  races?: { upcoming: UpcomingRace[]; history?: RaceResult[] };
};

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
 */
function Header({ count }: { count: number | null }) {
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
}: {
  race: UpcomingRace;
  /** `risk.hasActivityHistory`. False = the model has nothing to stand on. */
  predictionKnown: boolean;
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
        <Text style={styles.eyebrow}>
          {race.location
            ? `${dayLabel(race.date)} · ${race.location}`
            : dayLabel(race.date)}
        </Text>

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
      </View>
    </Card>
  );
}

function ResultRow({ result }: { result: RaceResult }) {
  return (
    <View style={styles.resultRow}>
      <View style={styles.resultLeft}>
        <Text style={styles.eyebrow}>
          {`${dayLabel(result.date)} · ${result.event}`}
        </Text>
        <Text style={styles.time}>{result.time}</Text>
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
  const [profile, setProfile] = useState<WithRaces | null>(null);
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

  if (failed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Header count={null} />
          <Card>
            <Text style={styles.failed}>Your races could not be loaded.</Text>
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

  const predictionKnown = profile.risk.hasActivityHistory;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <Header count={upcoming.length + history.length} />

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
                />
              ))
            )}
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
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.title, color: color.ink, flexShrink: 1 },
  failed: { ...text.base, color: color.ink2 },

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
