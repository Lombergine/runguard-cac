/**
 * The "Today" card: today's session, and the next race, as two rows.
 *
 * This is the design study's Home block — one card under a `TODAY` eyebrow,
 * radius `card`, clipped, with a hairline between the rows inset from the left
 * the way iOS insets a list separator. It replaces the two stacked `Panel`s
 * this file used to export (`TodayBlock` and `NextRaceBlock`), which put two
 * white surfaces and two titles where the design has one card and one label.
 *
 * The section eyebrow is NOT drawn here. It belongs to `Section`, which the
 * screen owns, for the same reason `Section`'s own note gives: the label names
 * a GROUP and sits outside the card. That also lets the screen swap this card
 * for an `Absent` under the same eyebrow without the label moving.
 *
 * ── WHAT MOVED BEHIND THE CHEVRON ───────────────────────────────────────────
 *
 * The session row used to be a whole panel: the warm-up / main-set / cool-down
 * breakdown, the plan's "why" sentence, the workout status, and the line that
 * restores a coach's distance when this athlete's readiness eased it. All four
 * still exist, one tap away, on `/plan/[date]` (`SessionDetail` in PlanWeek) —
 * which is what the chevron on this row is a promise of, and which renders
 * every one of them, including the coach's number.
 *
 * That is the design's structure and § "Roomy, not dense" agrees with it: the
 * breakdown is four paragraphs, and as a panel on Home it out-weighed the one
 * question the screen exists to ask. It is detail about today, and detail about
 * today is what a detail screen is.
 *
 * ── THE THREE DISTINCTIONS THIS FILE STILL KEEPS APART ──────────────────────
 *
 *  1. **No plan day at all is ABSENT; a Rest day is NO-RUN.** Different facts —
 *     "we don't know what you're doing" versus "you are deliberately not
 *     running" — so they render as two different objects from Nothing.tsx and
 *     never collapse. Neither is dressed as a row: a row with a chevron would
 *     promise a session underneath, and a dotted rest box inside a pressable
 *     would be a fourth thing again.
 *  2. **A missing distance is absent too**, never a bare session type where it
 *     could read as a short run. It keeps its dashed slot, under the row.
 *  3. **No race renders no row at all**, rather than an empty one that implies a
 *     race exists and could not be loaded. With no race the card is one row.
 *
 * `distanceKm` is KILOMETRES, like everything the API ships; it goes through
 * lib/units with "mi" welded into the same text node. `targetPace` arrives
 * already welded from the server and is printed verbatim. The race date arrives
 * pre-formatted from lib/dates — nothing here derives one.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Card } from "./Card";
import { Chevron } from "./List";
import { Absent, NoRun } from "./Nothing";
import { formatDistance } from "../lib/units";
import type { PlanDay } from "../lib/types";
import { rowPress } from "../theme/press";
import { layout, ruleWidth, space, target } from "../theme/space";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";

/**
 * The engine's word for a day with no run. Compared exactly, the way the web
 * portal compares it — a fuzzy match here would let "Rest" and "Recovery run"
 * pick the same branch.
 */
const REST = "Rest";

/**
 * The one race `/api/mobile/home` sends — `races.upcoming[0]`, narrowed to what
 * this card prints.
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
  /** Pre-formatted local date from ../lib/dates, e.g. "Sat 12 Sep". */
  dateLabel: string;
};

export type TodayBlockProps = {
  /**
   * `profile.plan.days.find((d) => d.isToday)`. `undefined` when the plan holds
   * no entry for today — which is absent, NOT rest.
   */
  day: PlanDay | undefined;
  /** Null or undefined when nothing is on the calendar. */
  race: NextRace | null | undefined;
};

/** "17 days", welded into one node. Never a numeral with "days" elsewhere. */
function countdownLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "Race day";
  return daysUntil === 1 ? "1 day" : `${daysUntil} days`;
}

/**
 * The hairline between two rows, inset from the left so it starts under the
 * titles — iOS's own separator, and the design's.
 *
 * BETWEEN rows only, never above the first or below the last. The design emits
 * one inside its loop, which leaves a rule sitting just above the card's bottom
 * edge; see docs/design-port.md #6 for why that is not taken literally.
 */
function RowRule() {
  return <View style={styles.rule} />;
}

export function TodayBlock({ day, race }: TodayBlockProps) {
  const router = useRouter();
  const isRest = day?.type === REST;
  /* A session row is only a row when there is a session to press. Rest and "no
     plan at all" render as their own objects instead — see distinction 1. */
  const hasSession = day !== undefined && !isRest;

  return (
    <Card padded={false} style={styles.card}>
      {!day ? (
        <View style={styles.block}>
          <Absent label="No plan recorded for today" />
        </View>
      ) : isRest ? (
        <View style={styles.block}>
          <NoRun />
        </View>
      ) : (
        <SessionRow
          day={day}
          onPress={() =>
            router.push({ pathname: "/plan/[date]", params: { date: day.date } })
          }
        />
      )}

      {/* Distinction 2: the session exists but prescribes no distance. Its own
          dashed slot, below the row, rather than a session type left to read as
          a short run. */}
      {hasSession && day.distanceKm === null ? (
        <View style={styles.block}>
          <Absent eyebrow="Distance" />
        </View>
      ) : null}

      {race ? (
        <>
          <RowRule />
          <RaceRow race={race} />
        </>
      ) : null}
    </Card>
  );
}

/**
 * Today's session. "Easy run · 4.0 mi" over "From your coach · 8:40/mi".
 *
 * Both figures are nested mono spans inside a body line, which is the idiom
 * `WeekProgress`'s note already uses: prose stays prose, numerals stay mono and
 * tabular, and the unit never leaves the numeral's own text node.
 *
 * The attribution is `muted`, not the ember it wore as a standalone line. The
 * spec rations colour to about three appearances per screen and Home already
 * spends them on the check-in card, this card's countdown and the recovery
 * link; a fourth would make none of them mean anything. It still has to be
 * SAID — "your coach wrote this" and "a computer suggested this" are different
 * instructions — and `source` is optional on the wire, so this matches "coach"
 * explicitly and says nothing at all otherwise.
 */
function SessionRow({ day, onPress }: { day: PlanDay; onPress: () => void }) {
  const fromCoach = day.source === "coach";
  const sub = fromCoach || day.targetPace !== null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`Today's session: ${day.type}`}
      style={({ pressed }) => [styles.row, rowPress({ pressed })]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {day.type}
          {day.distanceKm !== null ? (
            <>
              {" · "}
              <Text style={styles.figure}>{formatDistance(day.distanceKm)}</Text>
            </>
          ) : null}
        </Text>
        {sub ? (
          <Text style={styles.rowSub}>
            {fromCoach ? "From your coach" : null}
            {fromCoach && day.targetPace !== null ? " · " : null}
            {day.targetPace !== null ? (
              <Text style={styles.figure}>{day.targetPace}</Text>
            ) : null}
          </Text>
        ) : null}
      </View>
      <Chevron />
    </Pressable>
  );
}

/**
 * The next race, and how long there is. Inert: the design draws no chevron on
 * it, and a chevron is a promise that a screen is underneath.
 *
 * The countdown is the card's one ember. `brandText`, never `brand`: this is a
 * glyph, and the fill measures 2.15:1 on card against `brandText`'s 5.21:1. It
 * is mono and tabular while it is a count; on the day itself there is no
 * numeral, and a word does not belong in the figure voice.
 */
function RaceRow({ race }: { race: NextRace }) {
  const counting = race.daysUntil > 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{race.name}</Text>
        <Text style={styles.rowSub}>{race.dateLabel}</Text>
      </View>
      <Text style={counting ? styles.countdown : styles.raceDay}>
        {countdownLabel(race.daysUntil)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * `overflow: "hidden"` so the first row's press flash is clipped to the
   * card's curve rather than painting square corners over it — the design's own
   * note on this card, and the same reason `List`'s slab and `PlanWeek`'s
   * blocks card clip.
   *
   * It does not cost the card its shadow: `Card` draws elevation through
   * `boxShadow`, which RN hangs off the outer view while moving the clip to an
   * inner container. `PlanWeek` records the same finding at its `blocksCard`.
   */
  card: { overflow: "hidden" },
  /**
   * The design's row: 16 in from each side, and tall enough to be a real
   * target. `target.row` is the floor rather than the height, so a wrapped race
   * name grows the row instead of clipping.
   */
  row: {
    minHeight: target.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  /** Takes the slack, so the countdown and the chevron stay pinned right. */
  rowBody: { flex: 1 },
  rowTitle: { ...text.base, color: color.ink },
  rowSub: { ...text.meta, color: color.muted },
  /**
   * Nested in prose: inherits the surrounding size and colour, contributes the
   * mono face and tabular figures every numeral in this app is required to
   * have. The same span `WeekProgress`'s note uses.
   */
  figure: { fontFamily: font.mono, ...tabular },
  countdown: { ...text.statBase, color: color.brandText },
  raceDay: { ...text.baseSemi, color: color.brandText },
  rule: {
    marginLeft: layout.cardPadding,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },
  /**
   * A `Nothing` object standing where a row would. It keeps the row's own
   * horizontal inset so the dashed slot lines up with the titles above and
   * below it, and takes the vertical padding a box needs rather than a row's.
   */
  block: { padding: layout.cardPadding },
});

export default TodayBlock;
