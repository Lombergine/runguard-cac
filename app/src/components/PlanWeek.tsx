/**
 * This week's plan — seven rows, Monday through Sunday.
 *
 * Mirrors the web portal's Training tab
 * (`website/src/components/athlete/tabs.tsx:364-421`): the plan-adjustment
 * line, the taper banner and countdown, then one disclosure per day carrying
 * the date, the session, the prescription, and — once opened — the warm-up /
 * main set / cool-down breakdown and the "why". Today's row is open on arrival,
 * exactly as the website's `<details open={d.isToday}>` is.
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
 *     An already-set `status` on a CLOSED row is still the plain lowercase
 *     word `TodayBlock` uses, with no badge and no colour.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ON DATES. Non-negotiable #2 says a component displaying a date takes a
 * PRE-FORMATTED local string. The export contract fixes this component's input
 * as `PlanDay[]`, whose dates are raw `YYYY-MM-DD`, so the formatting happens
 * once here — through `lib/dates`, never through `toLocaleDateString`, and
 * never in the leaf `PlanRow`, which takes the finished string as a prop.
 * `PlanRow` is the component the rule is really about; this is the section that
 * feeds it, and the rule's purpose (one formatter, no bare relative labels) is
 * kept: today's row reads "Today · Mon 10 Aug", never "Today" alone.
 *
 * The weekday is derived from the ISO date locally rather than taken from the
 * server's `day` field, which was produced by `toLocaleDateString` in the
 * SERVER's timezone and can name a different day than the athlete's phone does.
 *
 * ON NUMBERS. `targetPace` arrives from the server with "/mi" already welded on
 * and is printed verbatim. Distance goes through `lib/units` and comes back as
 * "6.4 mi" in one node. There is no path here that produces a bare numeral.
 */
import { useCallback, useMemo, useState, type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "./Card";
import { Absent, NoRun } from "./Nothing";
import { setWorkoutStatus } from "../lib/api";
import { dayLabel } from "../lib/dates";
import { useInvalidateProfile } from "../lib/profileStore";
import type { PlanAdjustment, PlanDay, WorkoutStatus } from "../lib/types";
import { formatDistance } from "../lib/units";
// One derivation, shared with TodayBlock — see lib/workout.ts for why.
import { workoutBlocks } from "../lib/workout";
import { layout, radius, ruleWidth, space, target } from "../theme/space";
import { color } from "../theme/tokens";
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
 * depending on width, and today's row arrives already open at a height that
 * depends on where its prose wraps — neither is knowable before the data
 * lands. What this does buy is that the seven rows below the fold do not shove
 * the run cards down a screenful when the plan appears, which is the shift that
 * would let a tap land on the wrong run.
 */
export const planWeekMetrics = {
  /** Title line, gap, two lines of note, plus the head's own padding. */
  head:
    (text.title.lineHeight ?? 0) +
    space.xs +
    2 * (text.meta.lineHeight ?? 0) +
    2 * layout.cardPadding,
  /** One COLLAPSED row: date line, session line, figure line, plus padding. */
  row:
    (text.micro.lineHeight ?? 0) +
    space.xs +
    (text.base.lineHeight ?? 0) +
    space.xs +
    (text.stat.lineHeight ?? 0) +
    2 * space.md,
  rows: 7,
} as const;

/**
 * One labelled paragraph of the opened row. The micro-label sits ABOVE its
 * prose rather than in a fixed left column: at 360dp a 84px label column leaves
 * the sentence nowhere to go, and stacking matches how every other label/value
 * pair in this app is set.
 */
function DetailRow({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <View>
      <Text style={[styles.detailLabel, accent && styles.detailLabelAccent]}>{label}</Text>
      <Text style={styles.detailBody}>{body}</Text>
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
 * One day
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
  expanded: boolean;
  onToggle: () => void;
};

function PlanRow({ day, dateLabel, expanded, onToggle }: PlanRowProps) {
  const isRest = day.type === REST;
  const blocks = useMemo(() => workoutBlocks(day), [day]);

  /*
   * `useInvalidateProfile`, not `useProfile`. This row CHANGES what `/me`
   * returns without reading it, and `useProfile()` would subscribe seven rows
   * to the profile and trip the store's lazy first fetch — the 57 KB payload
   * that lazy load exists to avoid. See the note at the bottom of profileStore.
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
   * here and then clearing it on the web portal left this row showing "done"
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
   * row rendered "That didn't save. Tap again." directly beneath a filled
   * button. The sentence is an instruction, and obeying it DELETES the status:
   * `choose` reads `current === value` and sends the clear. So the one line
   * that reports a failed write has to expire on exactly the same event as the
   * memo of a successful one — the moment the payload says something new about
   * this day, this row's memory of what happened to it is out of date, whether
   * that memory is a success or a failure.
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

  const spoken = [
    dateLabel,
    day.type,
    prescriptionSpeech(day),
    day.isTaper ? "Taper day" : null,
    current,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={spoken}
        accessibilityHint={
          expanded ? "Hides this session's detail." : "Shows this session's detail."
        }
        style={({ pressed }) => [styles.summary, pressed && styles.summaryPressed]}
      >
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
              <Text style={styles.coachPillLabel}>from your coach</Text>
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
      </Pressable>

      {/*
       * The Done / Modified / Skipped controls, and the one line that reports
       * on a write.
       *
       * This View sits OUTSIDE the disclosure Pressable on purpose, and must
       * stay there. React Native's Pressable sets `accessible` on itself, so
       * three buttons nested inside it would be swallowed into the row's single
       * accessibility element and lose their own roles and 48px targets. As a
       * sibling they keep both, and a tap on a button can never be read as a
       * tap on the disclosure.
       *
       * THE CONTROLS FOLLOW THE DISCLOSURE, and the closed row shows the plain
       * word instead. Twenty-one always-on targets would add some 340dp of
       * controls — more than a phone's viewport — to a card whose job is to
       * describe the week, and a grid of buttons would become its dominant
       * texture. One open row means one set of controls, the athlete never
       * hunts for which day a button belongs to, and today's row is already
       * open on arrival, so the day most likely to be marked costs no extra
       * tap. It also settles the duplication: the selected control already
       * reads "Skipped", so the lowercase word beside it would say the same
       * thing twice. The word IS the closed state of this control, not a second
       * display of it.
       */}
      <View style={styles.action}>
        {expanded ? (
          <StatusButtons
            current={current}
            pending={pending}
            dateLabel={dateLabel}
            onChoose={(value) => void choose(value)}
          />
        ) : current ? (
          <Text style={styles.status}>{current}</Text>
        ) : null}

        {/* Deliberately outside the `expanded` branch: a write started on an
            open row must still be able to report itself if the athlete closes
            the row while it is in flight. */}
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

      {expanded ? (
        <View style={styles.detail}>
          {blocks.length ? (
            blocks.map((b) => (
              <DetailRow key={b.label} label={b.label} body={b.text} accent={b.accent} />
            ))
          ) : (
            <Text style={styles.detailBody}>{day.details}</Text>
          )}
          {/*
            When this athlete's readiness eased a distance their coach wrote,
            BOTH numbers appear. Showing only the eased one tells the athlete
            something different from what is on the board at practice — and they
            will run the board, which buys nothing but distrust of the app.
          */}
          {day.source === "coach" &&
          day.coachDistanceKm != null &&
          day.distanceKm !== null &&
          Math.abs(day.coachDistanceKm - day.distanceKm) > 0.15 ? (
            <DetailRow
              label="Coach wrote"
              body={`${formatDistance(day.coachDistanceKm)}. RunGuard suggests ${formatDistance(
                day.distanceKm
              )} for you today. Run your coach's number unless they say otherwise — this is something to show them, not an instruction.`}
              accent
            />
          ) : null}
          <DetailRow label="Why" body={day.why} />
          {day.supplemental ? <DetailRow label="Supplemental" body={day.supplemental} /> : null}
        </View>
      ) : null}
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
   * Today opens on arrival, matching `<details open={d.isToday}>` on the web.
   * Seeded once: a refresh must not slam shut a row the athlete opened, and
   * `days` is never empty at mount — the screen renders this only once the
   * profile has landed.
   */
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const d of days) if (d.isToday) seed[d.date] = true;
    return seed;
  });

  const toggle = useCallback((date: string) => {
    setOpen((prev) => ({ ...prev, [date]: !prev[date] }));
  }, []);

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
          <PlanRow
            key={day.date}
            day={day}
            dateLabel={dateLabel}
            expanded={Boolean(open[day.date])}
            onToggle={() => toggle(day.date)}
          />
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
    paddingHorizontal: layout.cardPadding,
    paddingTop: space.md,
    paddingBottom: space.sm,
    /** The 48px tap floor, even on the shortest row. */
    minHeight: target.min,
    justifyContent: "center",
  },
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

  /** The status slot. No margin of its own, so an empty one costs nothing. */
  action: { paddingHorizontal: layout.cardPadding },
  /**
   * A plain lowercase word, exactly as the server sends it — the same treatment
   * TodayBlock gives it. No badge, no fill, no colour: it describes what
   * happened, it does not rate it.
   */
  status: { ...text.meta, color: color.ink2, paddingBottom: space.sm },

  /** Wraps rather than shrinks. See StatusButtons for why. */
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: target.gap,
    paddingBottom: space.sm,
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
  writeNote: { ...text.meta, color: color.ink2, paddingBottom: space.sm },

  /* ---- the opened row ---- */
  detail: {
    paddingHorizontal: layout.cardPadding,
    paddingBottom: space.lg,
    gap: space.md,
  },
  detailLabel: { ...text.micro, color: color.muted },
  /** The website tints the accent BLOCK; here the accent lives on its label. */
  detailLabelAccent: { color: color.brandText },
  detailBody: { ...text.meta, color: color.ink2, marginTop: space.xs },
});

export default PlanWeek;
