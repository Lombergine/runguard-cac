/**
 * This week's plan — seven rows, Monday through Sunday.
 *
 * Mirrors the web portal's Training tab
 * (`website/src/components/athlete/tabs.tsx:364-421`): the plan-adjustment
 * line, the taper banner and countdown, then one row per day carrying the
 * date, the session and the prescription.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ROW PUSHES; IT NO LONGER OPENS. ONE AFFORDANCE, NOT TWO.
 *
 * The breakdown — warm-up / main set / cool-down, the "why", and the Done /
 * Modified / Skipped controls — used to unfold inside the row, with today's
 * open on arrival (the website's `<details open={d.isToday}>`). It now lives
 * on its own screen, `src/app/plan/[date].tsx`, and the row is a link to it.
 *
 * The design draws a chevron on this row, and a chevron is a promise that
 * there is a screen underneath. A row that BOTH unfolded in place and pushed
 * would be two affordances competing for one tap: the athlete cannot tell from
 * looking which one they are about to get, and whichever they get is a
 * surprise half the time. So the disclosure went when the push arrived.
 *
 * `SessionDetail` below is that breakdown, exported rather than moved. The
 * derivation, the write, the failure line and the three controls stay in one
 * place next to the row that pushes to them, so the week and the day cannot
 * describe one session differently. PlanWeek itself no longer renders it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DELIBERATELY DOES NOT PORT
 *
 *  1. **The two banners' surfaces.** The website paints the adjustment line on
 *     a `--status-warning` tint with a warning border, and the taper banner on
 *     a brand tint. Non-negotiable #5 forbids both: an eased week is a
 *     description of what the plan did, not an alarm, and a tinted panel makes
 *     a sentence read as an instruction in a way the words cannot undo. Both
 *     render here as ordinary cards. Nothing else about them changes.
 *  2. **One imperative.** The website's adjustment line ends "…say so — your
 *     coach can override it." "say so" is a second-person imperative, which the
 *     same rule forbids. It reads here as "…your coach can override it." Same
 *     fact, no instruction.
 *  3. **The taper pill's fill.** The website draws an amber-filled chip. Filled
 *     badges are out (§ "Status and advisory"), so it is an outlined chip in
 *     the ember TEXT colour — a pill shape with no fill, 5.21:1 on card.
 *  4. **The accent block's tint.** The website tints the "Main set" block with
 *     8% brand. The accent survives on the block's LABEL instead; no panel in
 *     this app carries a colour wash.
 *  5. **`PlanStatusButtons`' colour coding.** The website paints the active
 *     control green for "done", amber for "modified" and grey for "skipped" —
 *     a three-step verdict scale with a skipped run at the bottom of it.
 *     Non-negotiable #5 and § "Nothing shouts" rule that out: a skipped run is
 *     information, not a failure, and green-to-grey rates the athlete's week
 *     rather than describing it. All three controls here wear the SAME neutral
 *     shape and the same ember-soft selected state — the state says "this is
 *     the one on record", and says nothing about whether it was a good day.
 *     An already-set `status` on a PLAN ROW is still the plain lowercase
 *     word `TodayBlock` uses, with no badge and no colour.
 *  6. **The blocks card's accent wash.** The design paints the main-set row on
 *     an accent wash. `accentSoft` is a STATIC string — there is no
 *     appearance-aware soft accent in `theme/tokens.ts` — and the block prose
 *     on it is `ink2`, which IS appearance-aware: in dark mode that is
 *     #CDC5B8 on #FDECC8, about 1.2:1. Measured contrast outranks the design
 *     (docs/design-port.md, rules 1–2), so the accent stays where item 4 above
 *     already put it: on the block's LABEL. Nothing washed, nothing unreadable.
 *  7. **The design's "Why:" sentences.** They are mock copy written for the
 *     study ("recovery from yesterday's long run"). The why-line renders
 *     `day.why` — the server's own athlete-facing sentence — and renders
 *     NOTHING when the day has none. Inventing a rationale for a training
 *     session is the one thing a plan screen must not do.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ON DATES. Non-negotiable #2 says a component displaying a date takes a
 * PRE-FORMATTED local string. The export contract fixes this component's input
 * as `PlanDay[]`, whose dates are raw `YYYY-MM-DD`, so the formatting happens
 * once here — through `lib/dates`, never through `toLocaleDateString`, and
 * never in the leaves `PlanRow` and `SessionDetail`, which take the finished
 * string as a prop. Those two are the components the rule is really about; this
 * is the section that feeds one of them, and the session screen feeds the
 * other from the same `dayLabel`. The rule's purpose (one formatter, no bare
 * relative labels) is kept: today reads "Today · Mon 10 Aug", never "Today"
 * alone, on the row and on the screen it pushes to.
 *
 * The weekday is derived from the ISO date locally rather than taken from the
 * server's `day` field, which was produced by `toLocaleDateString` in the
 * SERVER's timezone and can name a different day than the athlete's phone does.
 *
 * ON NUMBERS. `targetPace` arrives from the server with "/mi" already welded on
 * and is printed verbatim. Distance goes through `lib/units` and comes back as
 * "6.4 mi" in one node. There is no path here that produces a bare numeral.
 */
import { useMemo, useState, type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { Card } from "./Card";
import { Absent, NoRun } from "./Nothing";
import { setWorkoutStatus } from "../lib/api";
import { dayLabel } from "../lib/dates";
import { useInvalidateProfile } from "../lib/profileStore";
import type { PlanAdjustment, PlanDay, WorkoutStatus } from "../lib/types";
import { formatDistance } from "../lib/units";
// One derivation, shared with TodayBlock — see lib/workout.ts for why.
import { workoutBlocks, type WorkoutBlock } from "../lib/workout";
import { layout, radius, ruleWidth, space, target } from "../theme/space";
import { chevronStroke, color } from "../theme/tokens";
import { text } from "../theme/type";

/**
 * The engine's word for a day with no run, compared EXACTLY — the same test
 * `TodayBlock` makes, for the same reason: a fuzzy match would let "Rest" and
 * "Recovery run" pick the same branch.
 */
const REST = "Rest";

export type PlanWeekProps = {
  /** `profile.plan.days` — always Monday–Sunday of the current week. */
  days: PlanDay[];
  /** `/api/mobile/home` does not send this; the screen passes false there. */
  taperMode: boolean;
  /** Whole days to the race, 0–6. Null when there is no count to show. */
  taperCountdown: number | null;
  /** `{ scale, reason }`. A null `reason` means nothing was eased. */
  adjustment: PlanAdjustment;
};

/**
 * Height reserved for the plan while the payload is in flight, for the run
 * log's skeleton. Same idea as `runCardMetrics` in RunCard.
 *
 * APPROXIMATE, and knowingly so. The head's note wraps to two or three lines
 * depending on width, which is not knowable before the data lands. It is LESS
 * approximate than it was: every row is now the same shape, because none of
 * them opens in place any more, so the only rows that exceed the estimate are
 * the ones carrying a rest day's dotted slot or a status word. What this buys
 * is that the seven rows below the fold do not shove the run cards down a
 * screenful when the plan appears, which is the shift that would let a tap land
 * on the wrong run.
 */
export const planWeekMetrics = {
  /** Title line, gap, two lines of note, plus the head's own padding. */
  head:
    (text.title.lineHeight ?? 0) +
    space.xs +
    2 * (text.meta.lineHeight ?? 0) +
    2 * layout.cardPadding,
  /** One row: date line, session line, figure line, plus padding. */
  row:
    (text.micro.lineHeight ?? 0) +
    space.xs +
    (text.base.lineHeight ?? 0) +
    space.xs +
    (text.stat.lineHeight ?? 0) +
    2 * space.md,
  rows: 7,
} as const;

/* ------------------------------------------------------------------ *
 * The disclosure chevron
 * ------------------------------------------------------------------ */

/**
 * The same glyph `components/List.tsx` draws, on the same 24-unit grid, at the
 * same 18pt, with the same path and the same `chevronStroke`.
 *
 * IT IS A SECOND COPY, and that is worth naming rather than hiding: `List`'s
 * `Chevron` is a module-private function, and this row is not a `ListRow` —
 * it is three stacked lines with pills, not a title/detail pair — so it cannot
 * adopt the component that owns the glyph. Exporting `Chevron` from `List` and
 * importing it here is the right fix and is a one-word change to a file this
 * work does not own.
 */
const GRID = 24;
const CHEVRON_SIZE = 18;
const CHEVRON = "M9.5 5.5 L16 12 L9.5 18.5";

function Chevron() {
  return (
    <Svg width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={CHEVRON}
        fill="none"
        // Chrome pointing at a row, not information about it — one neutral grey
        // in both appearances. The width divides by the render size so the line
        // lands at exactly `ruleWidth` device pixels.
        stroke={chevronStroke}
        strokeWidth={(ruleWidth * GRID) / CHEVRON_SIZE}
      />
    </Svg>
  );
}

/* ------------------------------------------------------------------ *
 * One block of the session
 * ------------------------------------------------------------------ */

/**
 * One row of the blocks card: a label gutter, then the prose.
 *
 * A COLUMN here, where the old in-row disclosure stacked the label above its
 * sentence. That stacking was the right answer for a list row at 360dp — an
 * 84pt column inside a card inside a list left the sentence nowhere to go —
 * and it stops being the right answer on a full page, which has the card's
 * whole width to spend and three labels that should line up down it.
 *
 * The gutter is a MINIMUM of 80, not the design's fixed 74. The design sets
 * this label in 10.5px sans at +0.05em; the app's micro role is 11.5 mono at
 * +0.12em (docs/design-port.md #1 — one eyebrow voice), which runs about a
 * third wider, so "COOL-DOWN" is 74.5pt of glyphs and a hard 74 would wrap it.
 * 80 is `space.xxxl + space.xxl` — the 4px scale has no 74 or 80 of its own and
 * a component may not type one (app/CLAUDE.md) — and it holds the column for
 * every label `workoutBlocks` produces. The two annotation rows below,
 * "Coach wrote" and "Supplemental", are longer than any gutter this side of
 * illegible and simply push past it.
 *
 * The optical nudge is DERIVED, not typed: the label's line box is 4pt shorter
 * than the prose's, so half that difference sets the two first lines on one
 * optical line whatever either role's leading later becomes.
 */
function BlockRow({
  label,
  body,
  accent,
  first,
}: {
  label: string;
  body: string;
  accent?: boolean;
  /** Separators BETWEEN rows only — never one above the card's own top edge. */
  first: boolean;
}) {
  return (
    <View style={[styles.block, !first && styles.blockRule]}>
      <Text style={[styles.blockLabel, accent && styles.blockLabelAccent]}>{label}</Text>
      <Text style={styles.blockBody}>{body}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Done / Modified / Skipped
 * ------------------------------------------------------------------ */

/**
 * The three controls, in the website's order and with its labels.
 *
 * The VALUE is also the word a screen reader hears ("marked skipped"), which is
 * why the option carries both: the label is Title Case because it is a control,
 * the recorded status is lowercase everywhere it is described.
 */
const STATUS_OPTIONS: readonly { value: WorkoutStatus; label: string }[] = [
  { value: "done", label: "Done" },
  { value: "modified", label: "Modified" },
  { value: "skipped", label: "Skipped" },
];

type StatusButtonsProps = {
  /** What the SERVER has confirmed. Never a value that has only been asked for. */
  current: WorkoutStatus | null;
  /** The value asked for and not yet answered. `next: null` is a clear in flight. */
  pending: { next: WorkoutStatus | null } | null;
  /** Pre-formatted local date, so each button says which day it belongs to. */
  dateLabel: string;
  onChoose: (value: WorkoutStatus) => void;
};

/**
 * Three 48px targets, wrapping rather than shrinking.
 *
 * `flexBasis: "auto"` sizes each button to its own label and `flexGrow` then
 * spreads them across the line, so the wrap point is driven by the text as
 * MEASURED — at the default size all three sit on one line at 360dp, and under
 * Dynamic Type they drop onto a second line instead of squeezing "Modified"
 * into a box narrower than the word. `flexShrink: 0` is what forbids the
 * squeeze. Nothing here is allowed below `target.min` on either axis.
 *
 * The pressed state is opacity, deliberately NOT the selected fill: on this
 * control the fill means "the server has this on record", and a press that
 * borrowed it would report success at the moment of the tap.
 */
function StatusButtons({ current, pending, dateLabel, onChoose }: StatusButtonsProps) {
  const busy = pending !== null;
  return (
    <View style={styles.actions}>
      {STATUS_OPTIONS.map((option) => {
        const isCurrent = current === option.value;
        const isPending = pending?.next === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent, busy, disabled: busy }}
            accessibilityLabel={
              isCurrent
                ? `${dateLabel}: marked ${option.value}`
                : `Mark ${dateLabel} ${option.value}`
            }
            /* Tapping the one already on record clears it, which is not
               discoverable from the label alone. */
            accessibilityHint={isCurrent ? "Clears this status." : undefined}
            disabled={busy}
            onPress={() => onChoose(option.value)}
            style={({ pressed }) => [
              styles.choice,
              isPending && styles.choicePending,
              isCurrent && styles.choiceCurrent,
              pressed && styles.choicePressed,
            ]}
          >
            <Text style={styles.choiceLabel}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The session, in full — the body of src/app/plan/[date].tsx
 * ------------------------------------------------------------------ */

export type SessionDetailProps = {
  day: PlanDay;
  /**
   * Pre-formatted local date from ../lib/dates. Never derived in here —
   * non-negotiable #2. The route param is a raw `YYYY-MM-DD` key and the
   * screen formats it through the same `dayLabel` the week's rows use, so a
   * day reads identically in the list and on its own page.
   */
  dateLabel: string;
};

/**
 * One planned day, opened on its own.
 *
 * Two cards and the three controls. The HERO states what the day is — the
 * date, who wrote it, the session's own name, and the prescription with its
 * units already welded on. The BLOCKS card breaks that session down, one
 * labelled row per block, and closes with the plan's own sentence about why
 * the day is there.
 *
 * NO TINT ON THE HERO. The design has a today-wash on its plan LIST rows and
 * deliberately does not repeat it here, and this app marks today in the row's
 * date colour rather than with a wash at all. A hero that tinted itself would
 * be claiming something the row it was pushed from never said.
 *
 * REST IS NO-RUN, in the hero, where the figure would otherwise be: the
 * dotted, unfilled object from components/Nothing. It is never prose and never
 * a zero. The day's own words about the rest still appear, in the block below
 * it — they are what the plan says about the day, not a substitute for the
 * object that says there is no run.
 *
 * RACE DAY reaches `Absent`: the plan records no distance for it, and a dashed
 * blank waiting to be filled is the only honest drawing of that. An empty
 * space would read as a short run.
 */
export function SessionDetail({ day, dateLabel }: SessionDetailProps) {
  const isRest = day.type === REST;
  const blocks = useMemo(() => workoutBlocks(day), [day]);

  /*
   * `useInvalidateProfile`, not `useProfile`. This screen CHANGES what `/me`
   * returns; it does not read it. The screen above does the reading. See the
   * note at the bottom of profileStore.
   */
  const invalidate = useInvalidateProfile();

  /*
   * The last write the SERVER confirmed.
   *
   * It exists because `invalidate()` refetches 57 KB: without it a button would
   * sit unmoved for as long as that took after a write that had already
   * succeeded. It expires the moment `day.status` CHANGES AT ALL — at that
   * point the payload has said something new about this day and the prop is
   * the truth, whatever it says. That covers the refetch landing and a coach
   * editing the same day, with no second copy of the truth to keep in step.
   *
   * The expiry is a comparison against the prop as last SEEN, not against the
   * value we wrote over. Holding `from` and testing `written.from ===
   * day.status` looked equivalent and was not: it re-matched whenever the
   * server returned to the value the write replaced, so marking a day done
   * here and then clearing it on the web portal left this screen showing "done"
   * with the selected fill — and that fill means "the server has this on
   * record". It also read `day.status` from the press-time closure, so a
   * refetch landing mid-write recorded a `from` the prop no longer had and
   * threw the fresh write away. Neither is expressible now.
   */
  const [written, setWritten] = useState<{ to: WorkoutStatus | null } | null>(null);
  const [seenStatus, setSeenStatus] = useState(day.status);
  /** A write in flight. `next: null` is a clear — see `choose`. */
  const [pending, setPending] = useState<{ next: WorkoutStatus | null } | null>(null);
  const [failed, setFailed] = useState(false);

  /*
   * React's documented "adjust state when a prop changes", done in render so
   * the stale value is never committed and nothing flashes. It sits below all
   * four `useState` calls only because it needs their setters; it declares no
   * hook itself, so the hook order is unaffected.
   *
   * `failed` IS CLEARED HERE TOO, and that is not tidiness. A write can commit
   * on the server and still reach the `catch` — a lost response, a timeout, the
   * app backgrounded mid-request — which leaves `failed` true over a status the
   * server does hold. The next payload then lights the selected fill, and the
   * screen rendered "That didn't save. Tap again." directly beneath a filled
   * button. The sentence is an instruction, and obeying it DELETES the status:
   * `choose` reads `current === value` and sends the clear. So the one line
   * that reports a failed write has to expire on exactly the same event as the
   * memo of a successful one — the moment the payload says something new about
   * this day, this screen's memory of what happened to it is out of date,
   * whether that memory is a success or a failure.
   *
   * A write that failed and left `day.status` UNCHANGED still reports itself:
   * the prop did not move, so this block does not run.
   */
  if (seenStatus !== day.status) {
    setSeenStatus(day.status);
    setWritten(null);
    setFailed(false);
  }

  /* Tests the WRAPPER, never `written?.to ?? day.status` — a confirmed clear
     is `to: null`, and `??` would fall through it back to the prop. */
  const current = written ? written.to : day.status;

  async function choose(value: WorkoutStatus) {
    if (pending) return;
    /*
     * Tapping the control already on record CLEARS it, as the website does.
     * `null` is deliberately not a member of `WorkoutStatus` and does not
     * become one here: it is the ABSENCE of a status, and on the wire it is the
     * signal to delete the row. This line is the only place it is produced.
     */
    const next: WorkoutStatus | null = current === value ? null : value;
    setPending({ next });
    setFailed(false);
    try {
      await setWorkoutStatus(day.date, next);
      // Only now, and not one line earlier: until this point nothing on screen
      // has claimed the change landed.
      setWritten({ to: next });
      invalidate();
    } catch {
      /*
       * Nothing to revert — the buttons never left what the server confirmed —
       * so the failure is stated in words instead. A control that quietly
       * snapped back would leave the athlete believing a run was logged.
       */
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  /*
   * When this athlete's readiness eased a distance their coach wrote, BOTH
   * numbers appear. Showing only the eased one tells the athlete something
   * different from what is on the board at practice — and they will run the
   * board, which buys nothing but distrust of the app.
   */
  const coachWrote =
    day.source === "coach" &&
    day.coachDistanceKm != null &&
    day.distanceKm !== null &&
    Math.abs(day.coachDistanceKm - day.distanceKm) > 0.15
      ? `${formatDistance(day.coachDistanceKm)}. RunGuard suggests ${formatDistance(
          day.distanceKm
        )} for you today. Run your coach's number unless they say otherwise — this is something to show them, not an instruction.`
      : null;

  /*
   * The rows of the blocks card.
   *
   * `workoutBlocks` splits a workout into Warm-up / Main set / Cool-down and
   * gives everything else a single block; it returns NOTHING for a day that
   * prescribes no session, which is Rest. That day still gets one row, so the
   * plan's own words about it are on the page — labelled "Rest", because that
   * is what the block is, and never "Main set" over a day with no set.
   */
  const rows: WorkoutBlock[] = blocks.length
    ? [...blocks]
    : [{ label: isRest ? "Rest" : "Main set", text: day.details }];
  if (coachWrote) rows.push({ label: "Coach wrote", text: coachWrote, accent: true });
  if (day.supplemental) rows.push({ label: "Supplemental", text: day.supplemental });

  return (
    <View style={styles.session}>
      <Card style={styles.hero}>
        <View style={styles.heroMeta}>
          {/* Non-negotiable #2: the day is always spelled out. Today reads
              "Today · Mon 10 Aug", never "Today" on its own. */}
          <Text style={styles.heroDate}>{dateLabel}</Text>
          {/* `source` is optional on the wire — a phone on this build can talk
              to a server that predates the team calendar. Match "coach"
              explicitly rather than testing for absence, so a missing field
              renders no badge instead of the wrong one. */}
          {day.source === "coach" ? (
            <View style={styles.coachPill}>
              <Text style={styles.coachPillLabel}>coach</Text>
            </View>
          ) : null}
          {/* Not in the design's hero, and kept anyway: the row this screen was
              pushed from carries it, and a fact that disappears when you open
              the thing it was attached to reads as a fact that stopped being
              true. */}
          {day.isTaper ? (
            <View style={styles.pill}>
              <Text style={styles.pillLabel}>taper</Text>
            </View>
          ) : null}
        </View>

        {/* The team's own word for the day, printed verbatim. */}
        <Text style={styles.heroType}>{day.type}</Text>

        {/* The design puts this 3px under the title; `hero`'s gap is the
            4px scale's own first step. */}
        {isRest ? (
          <NoRun />
        ) : day.distanceKm === null ? (
          day.targetPace ? (
            <Text style={styles.heroLine}>{day.targetPace}</Text>
          ) : (
            <Absent eyebrow="Distance" />
          )
        ) : (
          // ONE string: "6.4 mi @ 8:51/mi". The distance carries its unit and
          // the pace carries its own, and neither can be split off by a
          // reflow into a numeral standing alone.
          <Text style={styles.heroLine}>
            {`${formatDistance(day.distanceKm)}${
              day.targetPace ? ` @ ${day.targetPace}` : ""
            }`}
          </Text>
        )}
      </Card>

      {/* `overflow: "hidden"` so the first and last rows' rules stay inside the
          card's curve. Separators BETWEEN rows only — see docs/design-port.md
          #6, and `BlockRow`'s `first`. */}
      <Card padded={false} style={styles.blocksCard}>
        {rows.map((b, i) => (
          <BlockRow key={b.label} label={b.label} body={b.text} accent={b.accent} first={i === 0} />
        ))}
        {/*
          The plan's own sentence about why the day is in the week, and the ONLY
          source for this line. The design's studies carry written-for-the-mock
          rationales; a day whose payload has no `why` gets no why-row here
          rather than a sentence this app made up about someone's training.
        */}
        {day.why ? (
          <View style={[styles.block, styles.blockRule]}>
            <Text style={styles.why}>{`Why: ${day.why}`}</Text>
          </View>
        ) : null}
      </Card>

      {/*
        The Done / Modified / Skipped controls, and the one line that reports on
        a write.

        They followed the disclosure when the row could open; they follow the
        push now. On the page they sit BELOW both cards rather than inside
        either: they are the one thing here the athlete does, and a set of 48pt
        targets buried in a card of prose reads as part of the prose.
      */}
      <View style={styles.action}>
        <StatusButtons
          current={current}
          pending={pending}
          dateLabel={dateLabel}
          onChoose={(value) => void choose(value)}
        />
        {pending ? (
          <Text style={styles.writeNote}>
            {pending.next === null ? "Clearing…" : "Saving…"}
          </Text>
        ) : failed ? (
          <Text style={styles.writeNote} accessibilityLiveRegion="polite">
            That didn&apos;t save. Tap again.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * One day, in the week's list
 * ------------------------------------------------------------------ */

/**
 * What the row says out loud about its prescription — the same facts the row
 * shows, in the same words. `Absent` renders "—" over "Not recorded"; this says
 * "Distance not recorded", never a bare figure and never silence.
 */
function prescriptionSpeech(day: PlanDay): string {
  if (day.type === REST) return "No run. Rest day";
  if (day.distanceKm === null) {
    return day.targetPace ? `Target pace ${day.targetPace}` : "Distance not recorded";
  }
  return `${formatDistance(day.distanceKm)}${day.targetPace ? ` at ${day.targetPace}` : ""}`;
}

type PlanRowProps = {
  day: PlanDay;
  /** Pre-formatted local date from ../lib/dates. Never derived in here. */
  dateLabel: string;
};

/**
 * One day of the week, as a link to that day's session.
 *
 * `accessibilityRole="link"` rather than "button", the rule `components/List`
 * states: VoiceOver announces the two differently, and that announcement is
 * the only chevron a screen-reader user gets.
 */
function PlanRow({ day, dateLabel }: PlanRowProps) {
  const isRest = day.type === REST;

  const spoken = [
    dateLabel,
    day.type,
    prescriptionSpeech(day),
    day.isTaper ? "Taper day" : null,
    day.status,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push({ pathname: "/plan/[date]", params: { date: day.date } })}
        accessibilityRole="link"
        accessibilityLabel={spoken}
        accessibilityHint="Opens this session."
        style={({ pressed }) => [styles.summary, pressed && styles.summaryPressed]}
      >
        <View style={styles.summaryBody}>
          <View style={styles.summaryTop}>
            {/* Non-negotiable #2: the day is always spelled out. Today reads
                "Today · Mon 10 Aug", never "Today" on its own. */}
            <Text style={[styles.date, day.isToday && styles.dateToday]}>{dateLabel}</Text>
            {/* `source` is optional on the wire — a phone on this build can talk
                to a server that predates the team calendar. Match "coach"
                explicitly rather than testing for absence, so a missing field
                renders no badge instead of the wrong one. */}
            {day.source === "coach" ? (
              <View style={styles.coachPill}>
                <Text style={styles.coachPillLabel}>coach</Text>
              </View>
            ) : null}
            {day.isTaper ? (
              <View style={styles.pill}>
                <Text style={styles.pillLabel}>taper</Text>
              </View>
            ) : null}
          </View>

          {/* The team's own word for the day, printed verbatim. */}
          <Text style={styles.type}>{day.type}</Text>

          <View style={styles.prescription}>
            {isRest ? (
              // Rest is NO-RUN: dotted, unfilled, receding. It is not a failure
              // and it is not a missing measurement.
              <NoRun />
            ) : day.distanceKm === null ? (
              day.targetPace ? (
                <Text style={styles.figure}>{day.targetPace}</Text>
              ) : (
                // RACE DAY is the only day that reaches this: the plan records no
                // distance for it. ABSENT — a dashed blank waiting to be filled,
                // never an empty space that could read as a short run.
                <Absent eyebrow="Distance" />
              )
            ) : (
              // ONE string: "6.4 mi @ 8:51/mi". The distance carries its unit and
              // the pace carries its own, and neither can be split off by a
              // reflow into a numeral standing alone.
              <Text style={styles.figure}>
                {`${formatDistance(day.distanceKm)}${
                  day.targetPace ? ` @ ${day.targetPace}` : ""
                }`}
              </Text>
            )}
          </View>

          {/*
            A plain lowercase word, exactly as the server sends it — the same
            treatment TodayBlock gives it. No badge, no fill, no colour: it
            describes what happened, it does not rate it. The controls that set
            it are one tap away, on the screen this row opens.
          */}
          {day.status ? <Text style={styles.status}>{day.status}</Text> : null}
        </View>

        <Chevron />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The banners
 * ------------------------------------------------------------------ */

/** "3 days", welded into one node. Never a numeral with "days" beside it. */
function countdownLabel(days: number): string {
  if (days <= 0) return "Race day";
  return days === 1 ? "1 day" : `${days} days`;
}

/* ------------------------------------------------------------------ *
 * The section
 * ------------------------------------------------------------------ */

export function PlanWeek({
  days,
  taperMode,
  taperCountdown,
  adjustment,
}: PlanWeekProps): JSX.Element {
  /*
   * NO OPEN STATE. Today used to arrive expanded, matching
   * `<details open={d.isToday}>` on the web; the row is a link now and there
   * is nothing left to expand. Today is still marked — in the date's colour,
   * where it always was.
   */

  /** Formatted ONCE, here, so no row derives a date. See the header. */
  const rows = useMemo(
    () =>
      days.map((day) => ({
        day,
        dateLabel: day.isToday ? `Today · ${dayLabel(day.date)}` : dayLabel(day.date),
      })),
    [days],
  );

  return (
    <View style={styles.section}>
      {/*
       * The plan-adjustment line. One paragraph, body weight, on an ordinary
       * card — no tint, no border colour, no warning mark. It states what the
       * plan did and why; it does not tell the athlete to do anything.
       */}
      {adjustment.reason ? (
        <Card>
          <Text style={styles.bannerBody}>
            <Text style={styles.bannerLead}>
              This week&apos;s plan is a little lighter than usual.{" "}
            </Text>
            {adjustment.reason} If that doesn&apos;t match how you actually feel, your
            coach can override it.
          </Text>
        </Card>
      ) : null}

      {taperMode ? (
        <Card>
          <View style={styles.taperRow}>
            {/* Only when there is a count. A taper with no countdown says so by
                saying nothing — never a dash that could read as a figure. */}
            {taperCountdown !== null ? (
              <Text style={styles.countdown}>{countdownLabel(taperCountdown)}</Text>
            ) : null}
            <View style={styles.taperCopy}>
              <Text style={styles.taperTitle}>Taper mode is active</Text>
              <Text style={styles.taperNote}>
                Race week — the plan below is eased day by day until race day.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/*
       * No head inside the card. The design labels this group with an eyebrow
       * ABOVE the surface, which is `Section`'s rank, not `Panel`'s — a Panel
       * title belongs to one card, a Section label names a group. The caller
       * owns the label; see `(tabs)/runs.tsx`.
       */}
      <Card padded={false}>
        {rows.map(({ day, dateLabel }) => (
          <PlanRow key={day.date} day={day} dateLabel={dateLabel} />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Matches the run list's rhythm, so the whole tab scrolls on one beat. */
  section: { gap: space.md },

  /* ---- banners ---- */
  bannerBody: { ...text.base, color: color.ink2 },
  /** Semibold ink, inline. The website's `font-semibold` lead clause. */
  bannerLead: { ...text.baseSemi, color: color.ink },
  taperRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  /**
   * The one ember on this banner, and the website's own choice for it.
   * `brandText`, never `brand`: this is a glyph, and `brand` is 2.15:1 on card.
   */
  countdown: { ...text.stat, color: color.brandText },
  taperCopy: { flex: 1 },
  taperTitle: { ...text.baseSemi, color: color.ink },
  taperNote: { ...text.meta, color: color.ink2, marginTop: space.xs },

  /* ---- the plan card ---- */

  /**
   * The website's `border-t` on every day, including the first — which is what
   * separates the head from the week.
   */
  row: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingTop: space.md,
    paddingBottom: space.sm,
    /** The 48px tap floor, even on the shortest row. */
    minHeight: target.min,
    justifyContent: "center",
  },
  /** Takes the slack, so the chevron stays pinned to the right edge. */
  summaryBody: { flex: 1 },
  /**
   * State, not motion, and the same feedback the run cards give. Opacity rather
   * than a fill: a fill on the last row would square off the card's rounded
   * bottom corners, since `Card` does not clip its children.
   */
  summaryPressed: { opacity: 0.72 },

  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  date: { ...text.micro, color: color.muted },
  /** Today, in the ember text colour — 5.21:1 on card. */
  dateToday: { color: color.brandText },

  /**
   * A pill SHAPE with no fill. Badges are filled; this is not a status and must
   * not look like one. `brandText` on card measures 5.21:1.
   */
  pill: {
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  pillLabel: { ...text.meta, color: color.brandText },

  /*
   * Outlined like the taper pill, but in ember rather than the neutral rule, so
   * "a person decided this" reads louder than a computed property of the week
   * without inventing a filled variant.
   *
   * Deliberately NOT a brand-filled chip: `color.brand` is 2.01:1 and the
   * palette says in as many words never to put a glyph on it. brandText on the
   * card is the pairing `dateToday` and `countdown` already ship.
   */
  coachPill: {
    borderWidth: ruleWidth,
    borderColor: color.brandStrong,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  /**
   * One word, lowercase — the same register as the `taper` pill beside it.
   *
   * It read "from your coach" before. Four words made the quietest thing in
   * the row its widest object: on a week the coach wrote, seven of them
   * stacked down the card and outweighed the sessions they were annotating.
   * The design marks this with a single word for that reason, and in a plan
   * row next to a date "coach" can only mean one thing.
   */
  coachPillLabel: { ...text.meta, color: color.brandText },

  type: { ...text.base, color: color.ink, marginTop: space.xs },
  prescription: { marginTop: space.xs },
  /**
   * Mono, with the unit already inside the string. Never a bare numeral.
   *
   * `statInline`, not `stat`: this figure sits UNDER the session type and
   * describes it. At 22 it read louder than "Easy run" above it, inverting the
   * row — the design has the type lead at 17 and the figure follow at 13.5.
   */
  figure: { ...text.statInline, color: color.ink2 },

  /**
   * A plain lowercase word, exactly as the server sends it — the same treatment
   * TodayBlock gives it. No badge, no fill, no colour: it describes what
   * happened, it does not rate it.
   */
  status: { ...text.meta, color: color.ink2, marginTop: space.xs },

  /** The controls and the write note, under both cards. */
  action: { gap: space.sm },
  /** Wraps rather than shrinks. See StatusButtons for why. */
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: target.gap,
  },
  choice: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "auto",
    /** The floor on BOTH axes, at every text size. */
    minHeight: target.min,
    minWidth: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /**
   * The one on record — and the SAME treatment for all three, "skipped"
   * included. `accentSoft` is this app's selected wash (the check-in answers
   * wear it too), not a verdict colour, and the border carries the state in
   * greyscale and in glare: `accentSoft` and `well` differ by 1.08:1, while
   * `brandStrong` against the translucent rule is 1.7:1.
   */
  choiceCurrent: { backgroundColor: color.accentSoft, borderColor: color.brandStrong },
  /**
   * Asked for, not yet answered: the border moves, the FILL does not. The fill
   * is the claim that the server has it, and only a confirmation may set it.
   */
  choicePending: { borderColor: color.brandStrong },
  /** Opacity, never the selected fill — see StatusButtons. */
  choicePressed: { opacity: 0.72 },
  choiceLabel: { ...text.baseSemi, color: color.ink, textAlign: "center" },
  /** "Saving…", "Clearing…", or the sentence that says the tap did not take. */
  writeNote: { ...text.meta, color: color.ink2 },

  /* ---- the session screen ---- */

  /**
   * The two cards, and the controls under them.
   *
   * The design sets 20 between the cards. The 4px scale has no 20 and a
   * component may not type one (app/CLAUDE.md), so this is `space.xl` — the
   * larger of the two neighbours, because the gap's job is to say the hero and
   * the breakdown are two objects rather than one card with a rule through it.
   */
  session: { gap: space.xl },

  /**
   * The hero. `Card` supplies the surface: `radius.card`, the soft rule,
   * `layout.cardPadding`, and `shadow.card`.
   *
   * The design draws this at radius 16 on padding 18 under a HEAVIER shadow
   * than the card below it — a deliberate one-step lift. It ships flat with its
   * neighbour, and all three values are the reason:
   *
   *   · 16 → `radius.card` (14). No 16 token exists and a component may not
   *     write one.
   *   · 18 → `layout.cardPadding` (16), for the same reason.
   *   · the heavier shadow → `shadow.card`, the only elevation this app has,
   *     and theme/tokens.ts says in as many words that a shadow "is elevation,
   *     never emphasis: it must not be used to make one card louder than
   *     another." The hero leads on type instead — 28 display against 14 body
   *     is a much larger step than two shadows ever were.
   */
  hero: { gap: space.xs },

  heroMeta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  /**
   * The design sets this date in 13.5 sans. `text.micro` — 11.5 mono,
   * uppercase, tracked — is the eyebrow role every other screen in this app
   * already uses (docs/design-port.md #1), and this line is an eyebrow above a
   * title. Mono also keeps the rule that every numeral in the app is mono and
   * tabular, which a date is.
   */
  heroDate: { ...text.micro, color: color.muted },
  /**
   * The session's name. The design sets 700 at 27 with -0.5 tracking;
   * `text.display` is 28 display-800 at -0.56 — the nearest role, and the one
   * its own docblock reserves for "a screen whose whole job is one sentence",
   * which this screen is.
   */
  heroType: { ...text.display, color: color.ink },
  /**
   * "6.4 mi @ 8:51/mi", one node, units already welded on. `statBase` is 16.5
   * mono tabular — the design's 16 in the app's figure face.
   *
   * The design separates the two figures with "·" and this keeps the " @ " the
   * plan row and `workoutBlocks` both already print, so the same session reads
   * the same way in the week, on this screen, and in its own main-set line.
   */
  heroLine: { ...text.statBase, color: color.ink2 },

  /**
   * `overflow: "hidden"` so a row's top rule cannot escape the card's curve —
   * the design's own note on this card, and the same reason `List`'s slab
   * clips.
   *
   * It does NOT cost the card its shadow, which is the iOS reflex to check:
   * `clipsToBounds` on a layer normally suppresses that layer's own shadow, but
   * `Card` draws elevation through `boxShadow`, and RN hangs those shadow
   * layers off the OUTER view while moving the clip to an inner container
   * (RCTViewComponentView.mm, the `!boxShadow.empty()` container branch). The
   * two compose.
   */
  blocksCard: { overflow: "hidden" },
  block: {
    flexDirection: "row",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPadding,
  },
  /** BETWEEN rows only. Never above the first — see docs/design-port.md #6. */
  blockRule: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  /**
   * The label gutter. `minWidth`, not a fixed width, and 80 rather than the
   * design's 74 — see `BlockRow` for the measurement.
   *
   * The optical nudge is the half-difference between the two line boxes, so it
   * follows the type scale instead of being a number someone typed.
   */
  blockLabel: {
    ...text.micro,
    color: color.muted,
    minWidth: space.xxxl + space.xxl,
    flexShrink: 0,
    paddingTop: ((text.meta.lineHeight ?? 0) - (text.micro.lineHeight ?? 0)) / 2,
  },
  /**
   * The main set, in ember. The design washes the whole ROW in accent-soft;
   * `accentSoft` is a static string with no dark-mode twin, and `ink2` prose on
   * it is about 1.2:1 in dark mode, so the accent stays on the label — which is
   * where this file's header note 4 already put the website's version of the
   * same tint.
   */
  blockLabelAccent: { color: color.brandText },
  blockBody: { ...text.meta, color: color.ink2, flex: 1 },
  /**
   * The last row of the blocks card. No gutter: it is a sentence about the
   * whole day rather than one more block, and "Why: " leads it inside the same
   * node so the label cannot reflow away from what it labels.
   */
  why: { ...text.meta, color: color.muted },
});

export default PlanWeek;
