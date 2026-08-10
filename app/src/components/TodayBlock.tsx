/**
 * Today's session, and the next race — the two smallest blocks on the home
 * screen.
 *
 * Both mirror the web athlete portal's HomeTab
 * (`website/src/components/athlete/tabs.tsx`): the same title construction
 * ("Today · Rest day" / "Today · {type}", tabs.tsx:262) and the same countdown
 * (a large numeral of days with the race beneath it, tabs.tsx:194-199). What
 * does NOT come across is the decoration — the web countdown is a `text-shine`
 * numeral inside a `card-ember` panel with a `glow-ember` shadow and an entrance
 * animation. Here: a flat card, one 1.5px rule, no shadow, no gradient.
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

  return (
    <Card>
      {/* text.micro uppercases, so the literal stays sentence case. */}
      <Text style={styles.eyebrow}>{dateLabel}</Text>

      {/* The portal's own title. `type` is already the team's vocabulary
          ("Easy run", "Workout: 8×400m") and is printed verbatim. */}
      <Text style={styles.title}>
        {!day ? "Today" : isRest ? "Today · Rest day" : `Today · ${day.type}`}
      </Text>

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
      <Text style={styles.eyebrow}>{`Next race · ${race.dateLabel}`}</Text>
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
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.title, color: color.ink, marginTop: space.md },
  body: { marginTop: space.md },
  status: { ...text.meta, color: color.ink2, marginTop: space.md },

  countdown: { ...text.stat, color: color.ink, marginTop: space.md },
  raceDay: { ...text.title, color: color.ink, marginTop: space.md },
  raceName: { ...text.base, color: color.ink2, marginTop: space.xs },
});

export default TodayBlock;
