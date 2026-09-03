/**
 * Today's session, and the next race — the two smallest blocks on the home
 * screen.
 *
 * Both mirror the web athlete portal's HomeTab
 * (`website/src/components/athlete/tabs.tsx`): the same title construction
 * ("Today · Rest day" / "Today · {type}", tabs.tsx:262) and the same countdown
 * (a large numeral of days with the race beneath it, tabs.tsx:194-199).
 *
 * Both take the website's `Panel` head (tabs.tsx:22) — title on the LEFT, the
 * muted note on the RIGHT, then the content. The note is the date, which is the
 * reading instruction for everything under it: "Today · Easy run" is only a fact
 * once you know which day today is, and non-negotiable #2 forbids a bare
 * relative label. Putting it opposite the title rather than above it is the only
 * change to what is said.
 *
 * The web countdown is a `text-shine` numeral in a `card-ember` panel with a
 * `glow-ember` shadow. The ember survives, on the numeral itself and as
 * `brandText` — glowing panels do not: elevation in this app is `shadow.card`
 * on a card, and never emphasis.
 *
 * Three distinctions this file exists to keep apart:
 *
 *  1. **No plan day at all is ABSENT; a Rest day is NO-RUN.** They are different
 *     facts — one is "we don't know what you're doing", the other is "you are
 *     deliberately not running" — so they render as two different objects from
 *     Nothing.tsx and never collapse into each other.
 *  2. **A missing distance is absent too**, never a bare blank next to the
 *     session type, where it could read as a short run.
 *  3. **No race renders nothing at all**, rather than an empty card that implies
 *     a race exists and could not be loaded.
 *
 * `distanceKm` is KILOMETRES, like everything the API ships; it goes through
 * lib/units with "mi" welded into the same text node. Dates arrive
 * pre-formatted from lib/dates — neither block derives one.
 */
import { StyleSheet, Text, View } from "react-native";

import { Card } from "./Card";
import { Absent, NoRun } from "./Nothing";
import { Stat } from "./Stat";
import { formatDistance } from "../lib/units";
import { workoutBlocks } from "../lib/workout";
import type { PlanDay } from "../lib/types";
import { space } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/**
 * The engine's word for a day with no run. Compared exactly, the way the web
 * portal compares it — a fuzzy match here would let "Rest" and "Recovery run"
 * pick the same branch.
 */
const REST = "Rest";

export type TodayBlockProps = {
  /**
   * `profile.plan.days.find((d) => d.isToday)`. `undefined` when the plan holds
   * no entry for today — which is absent, NOT rest.
   */
  day: PlanDay | undefined;
  /** Pre-formatted local date from ../lib/dates, e.g. "Tue 14 Oct". */
  dateLabel: string;
};

export function TodayBlock({ day, dateLabel }: TodayBlockProps) {
  const isRest = day?.type === REST;
  const blocks = day ? workoutBlocks(day) : [];

  return (
    <Card>
      <View style={styles.head}>
        {/* The portal's own title. `type` is already the team's vocabulary
            ("Easy run", "Workout: 8×400m") and is printed verbatim. */}
        <Text style={styles.title}>
          {!day ? "Today" : isRest ? "Today · Rest day" : `Today · ${day.type}`}
        </Text>
        {/* Pre-formatted upstream — this block never derives a date. */}
        <Text style={styles.note}>{dateLabel}</Text>
      </View>

      {/*
        Who decided today.

        A line rather than a badge: the head is already title-left/date-right,
        and § "Roomy, not dense" governs this screen. But it has to be said
        somewhere — "your coach wrote this" and "a computer suggested this" are
        different instructions, and the athlete acts on them differently.

        `source` is optional on the wire (a phone on this build can talk to a
        server that predates the team calendar), so this matches "coach"
        explicitly and says nothing at all otherwise.
      */}
      {day?.source === "coach" ? (
        <Text style={styles.attribution}>From your coach</Text>
      ) : null}

      <View style={styles.body}>
        {!day ? (
          <Absent label="No plan recorded for today" />
        ) : isRest ? (
          <NoRun />
        ) : day.distanceKm === null ? (
          <Absent eyebrow="Distance" />
        ) : (
          <Stat label="Distance" value={formatDistance(day.distanceKm)} />
        )}
      </View>

      {/*
        When this athlete's readiness eased a distance their coach wrote, BOTH
        numbers appear. The Stat above shows the eased one because that is what
        the rest of the app computes against; this line restores the coach's.
        Showing only the eased number would have the home screen contradicting
        the board at practice, and the athlete will run the board.
      */}
      {day?.source === "coach" &&
      day.coachDistanceKm != null &&
      day.distanceKm !== null &&
      Math.abs(day.coachDistanceKm - day.distanceKm) > 0.15 ? (
        <Text style={styles.eased}>
          {`Your coach wrote ${formatDistance(day.coachDistanceKm)}. Run their number unless they say otherwise — show them this.`}
        </Text>
      ) : null}

      {/*
        The session broken down, and why it is in the plan — the website shows
        both on Home (tabs.tsx:259-273).

        Deliberately BELOW the distance and set in body prose rather than given
        its own card: § "Roomy, not dense" says the home screen is "essentially
        one question and three buttons with a lot of air around them", and that
        the emptiness is doing work by pointing at the check-in. Warm-up / main
        set / cool-down is four paragraphs; as a panel of its own it would
        out-weigh the question the screen exists to ask. As a tail on a block
        that was already here, it reads as detail about today rather than as a
        second subject.

        `workoutBlocks` is the shared derivation from lib/workout — the same one
        the week's plan uses, so the two screens cannot describe one run
        differently.
      */}
      {blocks.length > 0 ? (
        <View style={styles.blocks}>
          {blocks.map((b) => (
            <View key={b.label}>
              <Text style={[styles.blockLabel, b.accent && styles.blockLabelAccent]}>
                {b.label}
              </Text>
              <Text style={styles.blockBody}>{b.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* The plan's own sentence about why today looks like this. Descriptive,
          second person, written by the server for the athlete. */}
      {day?.why ? <Text style={styles.why}>{day.why}</Text> : null}

      {/* A plain lowercase word, exactly as the server sends it. No badge, no
          fill, no colour: this describes what happened, it does not rate it. */}
      {day?.status ? <Text style={styles.status}>{day.status}</Text> : null}
    </Card>
  );
}

/**
 * The one race `/api/mobile/home` sends — `races.upcoming[0]`, narrowed to what
 * this block prints.
 *
 * Local on purpose: `races` is not part of the `Profile` slice in lib/types
 * (the same reason the races screen narrows it locally), and types.ts stays
 * untouched.
 */
export type NextRace = {
  /** The meet's name, e.g. "Central League Championships". */
  name: string;
  /** Whole days from today. Zero or less means the race is today. */
  daysUntil: number;
  /** Pre-formatted local date from ../lib/dates, e.g. "Sat 25 Oct". */
  dateLabel: string;
};

export type NextRaceBlockProps = {
  /** Null or undefined when nothing is on the calendar. */
  race: NextRace | null | undefined;
};

/** "12 days", welded into one node. Never a numeral with "days" elsewhere. */
function countdownLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "Race day";
  return daysUntil === 1 ? "1 day" : `${daysUntil} days`;
}

export function NextRaceBlock({ race }: NextRaceBlockProps) {
  // Nothing upcoming is not a blank to fill in — it is simply not a thing on
  // this screen, so the block does not occupy any.
  if (!race) return null;

  const counting = race.daysUntil > 0;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title}>Next race</Text>
        <Text style={styles.note}>{race.dateLabel}</Text>
      </View>
      {/* Mono while it is a count; on the day itself there is no numeral, and a
          word does not belong in the figure voice. */}
      <Text style={counting ? styles.countdown : styles.raceDay}>
        {countdownLabel(race.daysUntil)}
      </Text>
      <Text style={styles.raceName}>{race.name}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  /** The Panel head: title left, note right, both on the same baseline. */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted },
  body: { marginTop: space.md },
  /** Ember-coloured meta, the same pairing `countdown` uses on this surface. */
  attribution: { ...text.meta, color: color.muted, marginTop: space.xs },
  /** A note, not a warning: it reports a disagreement, it does not resolve it. */
  eased: { ...text.meta, color: color.ink2, marginTop: space.sm },
  status: { ...text.meta, color: color.ink2, marginTop: space.md },

  /**
   * The one ember on this block, and the website's own choice for the
   * countdown. `brandText`, never `brand`: this is a glyph, and `brand` is
   * 2.15:1 on card against `brandText`'s 5.21:1.
   */
  countdown: { ...text.stat, color: color.brandText, marginTop: space.md },
  raceDay: { ...text.title, color: color.brandText, marginTop: space.md },
  raceName: { ...text.base, color: color.ink2, marginTop: space.xs },

  /** The session breakdown. Separated by air, not by a rule — a rule here would
      make it a second section of the card rather than a tail on the first. */
  blocks: { marginTop: space.lg, gap: space.md },
  blockLabel: { ...text.micro, color: color.muted },
  /**
   * The main set takes the ember, as it does on the website — but on the LABEL,
   * not as an 8% panel tint behind the text. A tinted block would be a second
   * surface inside a card, and elevation in this app is `shadow.card` on a card
   * and never emphasis.
   */
  blockLabelAccent: { color: color.brandText },
  blockBody: { ...text.meta, color: color.ink2, marginTop: space.xs },
  /** Why today looks like this. Prose, in the body voice, no marker. */
  why: { ...text.meta, color: color.muted, marginTop: space.lg },
});

export default TodayBlock;
