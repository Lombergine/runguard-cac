/**
 * The check-in prompt. See ../../../docs/visual-spec.md § "The signature", and
 * ../theme/tokens.ts for the sunrise palette that supersedes its colours.
 *
 * This is the hero of the home screen — the QUESTION, not readiness. Ten of
 * fourteen athletes are not reporting and readiness is mostly weighted to
 * self-report, so the screen's job is input, not display. The empty slot is not
 * a gap to apologise for; it is the product's main call to action, and so it is
 * the largest, highest-contrast, most thumb-reachable thing on the screen.
 *
 * SUNRISE. The card is a real Panel, in the website's sense
 * (`website/src/components/athlete/tabs.tsx:22`): a white ground on warm cream,
 * `shadow.card` for elevation, a hairline rule, and a head row of TITLE on the
 * left with a muted note on the right — "Before practice · Tue 14 Oct" split
 * across the two halves, which is where non-negotiable #2's explicit local day
 * lives.
 *
 * EMBER. Two appearances, both load-bearing: the gradient hairline across the
 * top of the panel (the port of the website's `.card-ember`, reserved there for
 * hero cards), and the fill on "Done", which is the one real system action on
 * this card. Its label stays `color.ink`, never white — the three ember stops
 * run 5.9:1 to 10.0:1 against ink, and only 1.7:1 to 2.8:1 against white.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO TAPS FOR THE MAJORITY STATE, AND A REAL NUMBER FOR THE REST
 *
 * The card asked "Anything sore?" as No / A bit / A lot and the SCREEN turned
 * those words into severity 4 and 7. That is a number the athlete never gave,
 * filed under a part with no side, and it is gone: the two invented levels are
 * deleted rather than kept as a shortcut, because a shortcut that fabricates a
 * figure is the failure this file exists to avoid.
 *
 * In their place is the website's own model (`widgets.tsx:118-307`):
 *
 *     part  →  side (lateral parts only)  →  severity 0–10
 *
 * The fast path is unchanged and still TWO TAPS — energy, then "No", which
 * submits on the second tap. Only an athlete who actually is sore pays for the
 * precision, and what they pay for is the difference between "a bit" and
 * "left knee, 6 out of 10". Nothing here reaches the server unasked: a
 * severity is written the moment it is tapped, so the figure and the map are a
 * picture of what is STORED, never of what was merely entered.
 *
 * WHY THE SCALE IS LAID OUT 1 + 5 + 5. Eleven targets is a lot, and at the
 * 360pt floor the card's content box is 285pt wide, so six 48pt targets in a
 * row (328pt with gaps) do not fit and five (272pt) do. The scale therefore
 * cannot be one or two rows whatever we would prefer — and given that, 0 takes
 * the full-width row of its own rather than heading a ragged one. That is the
 * layout doing what non-negotiable #4 asks: zero is not the low end of the
 * scale, it is a different KIND of answer — "I checked, and it doesn't hurt" —
 * so it is worded rather than left as a digit that could be read as "skip".
 *
 * NO ALARM RAMP ON THE SCALE. The website tints its severity buttons red as
 * they climb. This one does not: every value wears the same selected treatment,
 * because a control that turns red under the thumb is the app telling the
 * athlete their answer is bad news (non-negotiable #5). Intensity is carried
 * where the spec sanctions colour — the body map's own support-coloured fill,
 * which ramps 0.45 → 1.0 with severity.
 *
 * WHAT THE FIGURE CAN AND CANNOT SAY. `BodyMapProps`' picker member keys both
 * `selected` and `severity` by PART, so a part recorded on one side lights both
 * halves of the drawing. That is the same resolution the website's twelve chips
 * have, and it is why the side never lives on the figure: the readout under it
 * names "left knee 6/10" in full, and the side control names each side's own
 * score. The figure answers *where and roughly how much*; the text answers
 * *which side and exactly how much*.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BODY_PARTS, getBodyPart, sorenessLabel, type Side } from "../lib/bodyParts";
import { layout, radius, ruleWidth, space, target } from "../theme/space";
import { color, shadow } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { BodyMap } from "./BodyMap";


/**
 * The soreness question's two answers.
 *
 * Deliberately NOT stored anywhere. It is a disclosure gate: "no" submits, and
 * "yes" reveals the picker. The only soreness the server ever hears about is a
 * part with a side and a number attached — see `CheckinInput` in lib/api, whose
 * union makes a partless severity unsendable.
 */
type SoreGate = "no" | "yes";

/** The soreness rows the server holds for today, keyed "left knee" → 0–10. */
export type LoggedSoreness = Record<string, number>;

const SIDES = ["left", "right", "both"] as const satisfies readonly Side[];

/** The scale's top. Every reading is welded to it, e.g. "6/10". */
const SCALE_MAX = 10;

/** 1–10, five to a row. Zero is not here; it gets its own worded target. */
const SEVERITY_ROWS: readonly (readonly number[])[] = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, SCALE_MAX],
];

/**
 * The worst score recorded for each part, across every side it may be filed
 * under — the website's own chip logic (`widgets.tsx:206-209`). This is what
 * tints the figure, and it is also what decides whether a part is filled at
 * all: a part with a 0 IS in this map and IS filled, a part never answered for
 * is absent from it and draws as a bare outline.
 */
function worstByPart(logged: LoggedSoreness): Record<string, number> {
  const worst: Record<string, number> = {};
  for (const part of BODY_PARTS) {
    const scores = [part.key, ...SIDES.map((s) => sorenessLabel(part.key, s))]
      .map((key) => logged[key])
      .filter((v): v is number => v !== undefined);
    if (scores.length > 0) worst[part.key] = Math.max(...scores);
  }
  return worst;
}

/**
 * The stored soreness, read back as a sentence fragment.
 *
 * Exported because the receipt has to name exactly what this card showed, in
 * exactly the same words — the two drifting apart is how a receipt ends up
 * claiming more than was written. Every score keeps "/10" welded to it in a
 * single mono node; a bare numeral would leave the scale to be inferred.
 */
export function SorenessList({
  lead,
  entries,
}: {
  lead: string;
  entries: readonly (readonly [string, number])[];
}) {
  return (
    <Text style={styles.readout}>
      {lead}
      {entries.map(([key, severity], i) => (
        <Text key={key}>
          {i > 0 ? " · " : ""}
          {`${key} `}
          <Text style={styles.score}>{`${severity}/${SCALE_MAX}`}</Text>
        </Text>
      ))}
    </Text>
  );
}

type Option<T extends string> = { value: T; label: string };


const SORE_OPTIONS: readonly Option<SoreGate>[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

const PROMPT_LINE = text.prompt.lineHeight as number;

/**
 * Exact heights, so the skeleton below can reserve them. Not a guess and not
 * exported: the athlete may tap before the data settles and the layout is
 * forbidden from moving under their thumb, which is only guaranteed while the
 * skeleton and the card are built from the same numbers in the same file.
 */
const metrics = {
  /** One line of the panel title, taken from the scale rather than guessed at. */
  headLine: text.title.lineHeight as number,
  /** One line of the note that sits opposite it. */
  noteLine: text.meta.lineHeight as number,
  /** Two lines of text.prompt — the longer question wraps to two at 360px. */
  promptBlock: PROMPT_LINE * 2,
  /** Comfortably over the 48px floor, with room for a wrapped label. */
  answer: target.min + space.sm,
  /**
   * How tall the card is when it is only a question.
   *
   * Composed from the pieces rather than picked: the head, the two-line prompt,
   * the air the spec asks for, and the answer row. It is a FLOOR, not a height —
   * the panel grows past it once the body map is disclosed. Before that, on any
   * phone taller than this, the card still reads as the full-bleed hero it is
   * meant to be, because the spacer takes the slack.
   */
  panelMin:
    layout.cardPadding * 2 +
    (text.title.lineHeight as number) +
    PROMPT_LINE * 2 +
    space.xl * 2 +
    target.min +
    space.sm,
} as const;

/**
 * The website's `--ember`, which is `linear-gradient(135deg, …)` with a stop at
 * 45%. 135° in CSS runs top-left to bottom-right, which is what this start/end
 * pair describes.
 */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/**
 * The ember hairline along the top edge of the panel — the port of the
 * website's `.card-ember`, which it reserves for hero cards. It is decoration
 * with no state in it, so it is hidden from assistive tech.
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

type CheckInCardProps = {
  /**
   * Open on the soreness picker, skipping the energy question.
   *
   * For an athlete who already checked in today and came back to add a sore
   * spot. Without it, the only screen in the app that writes soreness is
   * replaced by a receipt for the rest of the day, and one accidental "No" tap
   * is enough to trigger that.
   */
  sorenessOnly?: boolean;
  /** Called by Done in `sorenessOnly` mode. Closes the card; posts nothing. */
  onDone?: () => void;
  /**
   * Pre-formatted local day, e.g. "Tue 14 Oct" — the panel's note. Never
   * derived here; see lib/dates. The card supplies the "before practice" half
   * of the header itself, because that is a fact about the card and not about
   * the calendar.
   */
  dateLabel: string;
  /**
   * What the server holds for today. The card renders this and never a local
   * draft of it, so the figure, the readout and the side chips can only ever
   * show soreness that has actually been written.
   */
  logged: LoggedSoreness;
  /**
   * Keys whose supersede clear did NOT land. They are still in `logged`,
   * because they are still on the server; this names them so the athlete can
   * see that a score they thought they replaced is still there.
   */
  uncleared: readonly string[];
  /**
   * Writes one soreness row. `severity: null` is the explicit CLEAR — see
   * `CheckinInput` in lib/api. The screen owns the request, the supersede
   * follow-ups, and the mirror in `logged`.
   */
  onLogSoreness: (part: string, side: Side | null, severity: number | null) => void;
  /**
   * Finishes the check-in and collapses the card.
   *
   * Takes NOTHING now. The card used to hand back an energy answer; the
   * question was removed, and soreness rows are already on the server by the
   * time this fires — each one is written the moment it is tapped. So this is
   * purely "the athlete is done", not a payload.
   */
  onComplete: () => void;
  /** True while any write is in flight. Targets stay put but go inert. */
  submitting: boolean;
  /** Why the last soreness write did not do what it said. Null when it did. */
  sorenessError: string | null;
  /** True when the finishing write did not reach the server. */
  failed: boolean;
};

export function CheckInCard({
  dateLabel,
  logged,
  uncleared,
  onLogSoreness,
  onComplete,
  submitting,
  sorenessError,
  failed,
  sorenessOnly = false,
  onDone,
}: CheckInCardProps) {
  /*
   * `sorenessOnly` opens straight on the picker, for an athlete who already
   * checked in today and came back to add a sore spot. Energy is not re-asked —
   * it was answered this morning, and asking again would either overwrite that
   * answer or discard the new one. `onComplete` is not reachable in this mode
   * (see the footer), so nothing re-posts `energy`.
   */
  const [gate, setGate] = useState<SoreGate | null>(sorenessOnly ? "yes" : null);
  const [part, setPart] = useState<string | null>(null);
  const [side, setSide] = useState<Side | null>(null);

  const region = part === null ? null : getBodyPart(part) ?? null;
  const needsSide = region?.lateral === true;
  /**
   * The row this tap would write, or null when there is not enough to write
   * one. A lateral part with no side chosen has no key — the website refuses
   * bare "shin" entries the same way (`widgets.tsx:133`), and the union in
   * lib/api refuses a severity with no part at all.
   */
  const sorenessKey =
    part === null ? null : needsSide && side === null ? null : sorenessLabel(part, side);
  const currentSeverity = sorenessKey === null ? null : logged[sorenessKey] ?? null;

  const entries = Object.entries(logged);
  const severityByPart = worstByPart(logged);
  const selectedParts = Object.keys(severityByPart);

  /**
   * "No" submits on the second tap — nothing to locate, so the fast path stays
   * two taps. "Yes" opens the picker instead, because a severity with no part
   * cannot be stored and a part with no severity is not an answer.
   */
  function pickGate(value: SoreGate) {
    setGate(value);
    // "No" is a complete answer on its own: nothing to locate, nothing to
    // score. Still two taps for the majority state.
    if (value === "no") onComplete();
  }

  /** Tapping a part selects it for scoring; tapping it again puts it down. */
  function pickPart(partKey: string) {
    setSide(null);
    setPart((prev) => (prev === partKey ? null : partKey));
  }

  /**
   * Tapping the already-selected side clears THAT side's score, which is the
   * website's own gesture (`widgets.tsx:244-252`) and the only way to take an
   * answer back. Tapping a side that holds nothing just selects or deselects it.
   */
  function pickSide(value: Side) {
    if (part === null) return;
    const scored = logged[sorenessLabel(part, value)] !== undefined;
    if (side === value && scored) {
      onLogSoreness(part, value, null);
      setSide(null);
      return;
    }
    setSide(side === value ? null : value);
  }

  /** Tapping the active value again clears it, exactly as on the website. */
  function pickSeverity(value: number) {
    if (part === null || sorenessKey === null) return;
    onLogSoreness(part, side, currentSeverity === value ? null : value);
  }

  const askingWhere = gate === "yes";  // `sorenessOnly` seeds the gate above.
  const ready = entries.length > 0;

  return (
    <View style={[styles.panel, !askingWhere && styles.panelHero]}>
      <EmberEdge />
      <View style={styles.body}>
        {/* The Panel head: title left, muted note right. The note carries the
            explicit local day, so the header still reads as a date and never
            as a bare relative label (visual-spec non-negotiable #2). */}
        <View style={styles.head}>
          <Text style={styles.title}>Before practice</Text>
          <Text style={styles.note}>{dateLabel}</Text>
        </View>

        <Text style={styles.prompt}>Anything sore?</Text>

        {/* Pushes the targets into the bottom third, one-handed reach. */}
        <View style={styles.spacer} />

        {sorenessOnly ? null : (
          // Hidden when the card was reopened to edit: tapping "Add or change
          // soreness" WAS the yes, so a "No" here would be a dead control that
          // looks live.
          <AnswerRow
            options={SORE_OPTIONS}
            selected={gate}
            disabled={submitting}
            expanded={askingWhere}
            onPick={pickGate}
          />
        )}

        {askingWhere ? (
          // One gap container, so every block below spaces itself the same way
          // and nothing carries a margin that doubles up inside a nested one.
          <View style={styles.disclosed}>
            <Text style={styles.micro}>Where</Text>

            {/*
              THE EDITOR SITS ABOVE THE MAP, not below it.

              It used to follow the figure, which put the side picker and the
              0-10 scale ~540pt down the card — off-screen on every phone, and
              unreachable at all while the panel could not scroll. Even with the
              card scrolling, tapping a knee and having the control appear half a
              screen away is a poor answer: the athlete loses the figure they
              just touched.

              Above it, one tap reveals the scale within a thumb's reach of the
              region, and the map stays visible underneath as the thing being
              annotated. Before a part is chosen this is one line of hint text,
              so the figure is still the first thing on the card.
            */}
            {part === null ? (
              <Text style={styles.hint}>Tap where it hurts to score it.</Text>
            ) : (
              <View style={styles.editor}>
                <Text style={styles.editorTitle}>{region?.label ?? part}</Text>

                {needsSide ? (
                  <SideRow
                    part={part}
                    side={side}
                    logged={logged}
                    disabled={submitting}
                    onPick={pickSide}
                  />
                ) : null}

                {sorenessKey === null ? (
                  <Text style={styles.hint}>Choose a side to score it.</Text>
                ) : (
                  <SeverityScale
                    label={sorenessKey}
                    severity={currentSeverity}
                    disabled={submitting}
                    onPick={pickSeverity}
                  />
                )}

                {sorenessError ? (
                  <Text style={styles.writeError}>{sorenessError}</Text>
                ) : null}
              </View>
            )}

            <BodyMap
              selected={selectedParts}
              onToggle={pickPart}
              severity={severityByPart}
            />

            {/*
              `selected` and `severity` are both the RECORDED state and nothing
              else: a lit region means a score exists for that part, and its
              fill ramps with that score. A part being scored right now but not
              yet answered is deliberately NOT passed as selected — with no
              severity to go with it the figure would fill it at full intensity,
              which is a blank drawn as the worst possible reading.
            */}
            {ready ? (
              <SorenessList lead="Logged: " entries={entries} />
            ) : (
              <Text style={styles.hint}>Nothing logged yet.</Text>
            )}

            {uncleared.length > 0 ? (
              <Text style={styles.writeError}>
                {`An earlier score for ${uncleared.join(" and ")} could not be removed, and is still recorded above.`}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || submitting }}
              disabled={!ready || submitting}
              onPress={() => {
                // In `sorenessOnly` there is no energy answer to submit and the
                // check-in already happened — Done just closes. Every severity
                // was written the moment it was tapped, so nothing is pending.
                if (sorenessOnly) onDone?.();
                else onComplete();
              }}
              style={[styles.done, ready && styles.doneReady]}
            >
              {({ pressed }) => (
                <>
                  {/* Ember, because this is the card's one system action. The
                      label above it stays ink: white on these stops bottoms out
                      at 1.7:1, ink never drops below 5.9:1.

                      Pressing DROPS the gradient to the flat `brandStrong`
                      ground beneath — the idiom `login.tsx` and `profile.tsx`
                      already use, and the same ground that shows if the
                      gradient never draws. This button had no pressed state at
                      all: it is the card's primary action, sitting among four
                      radio groups that every one of them animate, so it was the
                      least responsive control on the most important screen. */}
                  {ready && !pressed ? (
                    <LinearGradient
                      colors={color.ember}
                      locations={EMBER_STOPS}
                      start={EMBER_START}
                      end={EMBER_END}
                      style={styles.doneFill}
                    />
                  ) : null}
                  <Text style={[styles.doneLabel, !ready && styles.doneLabelIdle]}>
                    Done
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}

        {failed ? (
          <Text style={styles.failed}>That didn&apos;t send. Tap again.</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The same panel, with its content reserved rather than rendered.
 *
 * It lives here, next to the card, because the two have to agree to the pixel:
 * this is the state that usually lands first and the one whose targets a thumb
 * is already reaching for. Sharing the stylesheet is what makes them agree.
 */
export function CheckInCardSkeleton() {
  return (
    <View style={[styles.panel, styles.panelHero]}>
      <EmberEdge />
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonNote} />
        </View>
        <View style={styles.skeletonPrompt} />
        <View style={styles.spacer} />
        <View style={styles.row}>
          <View style={styles.skeletonAnswer} />
          <View style={styles.skeletonAnswer} />
          <View style={styles.skeletonAnswer} />
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Side
 * ------------------------------------------------------------------ */

/**
 * Left / right / both, for lateral parts only.
 *
 * Each side carries its OWN score, shown welded to it, because the three are
 * three separate rows on the server and an athlete with a sore left calf and a
 * fine right one has to be able to see that. A side with no score shows no
 * number at all rather than a zero — those are the two states non-negotiable #4
 * forbids collapsing.
 */
function SideRow({
  part,
  side,
  logged,
  disabled,
  onPick,
}: {
  part: string;
  side: Side | null;
  logged: LoggedSoreness;
  disabled: boolean;
  onPick: (value: Side) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {SIDES.map((value) => {
        const score = logged[sorenessLabel(part, value)];
        const isSelected = side === value;
        const word = value[0].toUpperCase() + value.slice(1);
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={
              score === undefined ? word : `${word}, ${score} out of ${SCALE_MAX}`
            }
            accessibilityState={{ checked: isSelected, selected: isSelected, disabled }}
            disabled={disabled}
            onPress={() => onPick(value)}
            style={({ pressed }) => [
              styles.sideChip,
              score !== undefined && styles.sideChipScored,
              (pressed || isSelected) && styles.answerActive,
            ]}
          >
            <Text style={styles.sideLabel}>{word}</Text>
            {score === undefined ? null : (
              <Text style={styles.score}>{`${score}/${SCALE_MAX}`}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Severity 0–10
 * ------------------------------------------------------------------ */

/**
 * Eleven values, as 1 + 5 + 5. See the file header for why the rows are five
 * wide and why 0 stands apart.
 *
 * No value is styled more urgently than any other: the selected treatment is
 * the one the answer row uses, whatever the number. Alarm belongs to nothing on
 * this screen (non-negotiable #5).
 */
function SeverityScale({
  label,
  severity,
  disabled,
  onPick,
}: {
  /** The row being scored, e.g. "left knee" — named so the reading is unambiguous. */
  label: string;
  severity: number | null;
  disabled: boolean;
  onPick: (value: number) => void;
}) {
  return (
    <View style={styles.scaleBlock}>
      <Text style={styles.micro}>{`How sore · 0–${SCALE_MAX}`}</Text>

      {severity === null ? (
        // NOT "0". Nothing has been answered for this row, and the one thing
        // this card may never do is let that read as a measured zero.
        <Text style={styles.hint}>Not scored yet.</Text>
      ) : (
        <Text style={styles.readout}>
          {`${label} `}
          <Text style={styles.score}>{`${severity}/${SCALE_MAX}`}</Text>
          {" — tap it again to clear."}
        </Text>
      )}

      <View style={styles.scale} accessibilityRole="radiogroup">
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={`0 out of ${SCALE_MAX}, nothing sore there`}
          accessibilityState={{
            checked: severity === 0,
            selected: severity === 0,
            disabled,
          }}
          disabled={disabled}
          onPress={() => onPick(0)}
          style={({ pressed }) => [
            styles.zeroTarget,
            (pressed || severity === 0) && styles.answerActive,
          ]}
        >
          <Text style={styles.digit}>0</Text>
          <Text style={styles.zeroNote}>nothing sore there</Text>
        </Pressable>

        {SEVERITY_ROWS.map((values) => (
          <View key={values[0]} style={styles.row}>
            {values.map((value) => {
              const isSelected = severity === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${value} out of ${SCALE_MAX}`}
                  accessibilityState={{
                    checked: isSelected,
                    selected: isSelected,
                    disabled,
                  }}
                  disabled={disabled}
                  onPress={() => onPick(value)}
                  style={({ pressed }) => [
                    styles.severity,
                    (pressed || isSelected) && styles.answerActive,
                  ]}
                >
                  <Text style={styles.digit}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

type AnswerRowProps<T extends string> = {
  options: readonly Option<T>[];
  selected: T | null;
  disabled: boolean;
  /** True when the selected option has disclosed something below the row. */
  expanded?: boolean;
  onPick: (value: T) => void;
};

function AnswerRow<T extends string>({
  options,
  selected,
  disabled,
  expanded,
  onPick,
}: AnswerRowProps<T>) {
  return (
    /**
     * A radiogroup, not a row of buttons: these are the answers to ONE
     * question, exactly one of which holds. A screen reader should say "1 of 3"
     * and announce the swap when the athlete changes their mind — a button
     * announces neither.
     */
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{
              // `checked` is the state a radio carries; `selected` is what
              // VoiceOver reads off the trait. Both, so neither platform
              // announces an answered question as unanswered.
              checked: isSelected,
              selected: isSelected,
              disabled,
              ...(expanded === undefined ? {} : { expanded: isSelected && expanded }),
            }}
            disabled={disabled}
            onPress={() => onPick(option.value)}
            style={({ pressed }) => [
              styles.answer,
              (pressed || isSelected) && styles.answerActive,
            ]}
          >
            <Text style={styles.answerLabel}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The Panel. Elevation comes from `shadow.card` and nothing else — it is not
   * turned up to make this card louder than the ones below it, it is the same
   * two-layer shadow every surface in the system gets.
   */
  panel: {
    /*
     * `minHeight`, NOT `flex: 1`.
     *
     * `flex: 1` is `flexBasis: 0`, so this panel's height was distributed space
     * rather than content — it resolved to exactly the viewport, which made the
     * parent ScrollView's contentSize equal its frame, which meant THE SCREEN
     * COULD NOT SCROLL. The body map is a fixed 320 x 540 and the editor below
     * it another ~300, so once "Yes" was tapped the card needed ~1090pt and had
     * ~514: the lower half of the figure — knee, shin, calf, achilles, heel,
     * foot, i.e. everything a runner actually reports — was drawn outside the
     * panel, invisible and on iOS not hit-testable, and the severity scale and
     * Done sat past a fold with nothing to scroll to. Tapping a body part
     * appeared to do nothing.
     *
     * With `minHeight` the card still FILLS the viewport while it is only a
     * question (the hero proportions § "The signature" asks for), and GROWS past
     * it once the map appears, at which point the ScrollView has real overflow
     * and scrolls. The spec sanctions this directly — § Accessibility: "it may
     * scroll, but the three answer targets stay reachable."
     *
     * The map is deliberately NOT scaled down to fit: one SVG unit is one point
     * there, and that is the only thing making a 48-unit hit box a real 48pt
     * target.
     */
    minHeight: metrics.panelMin,
    // NOTE: `panelHero` below adds `flex: 1` back while the card is only a
    // question. See its comment — the two together are the whole fix.
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
  /**
   * `flex: 1`, but ONLY while the body map is not disclosed.
   *
   * That is the distinction the old code missed by applying it always. As a
   * question the card SHOULD fill the viewport — § "The signature" wants the
   * empty slot to be the loudest thing on the screen, and with short content
   * `flex: 1` gives exactly that. The moment the 540pt map appears it becomes
   * a cage: `flex: 1` is `flexBasis: 0`, so the panel is pinned to the viewport,
   * the ScrollView's contentSize equals its frame, the screen cannot scroll, and
   * everything past ~514pt — the lower half of the figure and the entire
   * severity scale — is unreachable.
   *
   * So: hero while it asks, content-sized once it listens.
   */
  panelHero: { flex: 1 },

  // Grows with its content; `panelHero` is what fills the screen before
  // disclosure.
  body: { flexGrow: 1, padding: layout.cardPadding },

  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted },

  prompt: { ...text.prompt, color: color.ink, marginTop: space.lg },
  /*
   * Pushes the three answers into the bottom third while the card is only a
   * question. `flexGrow` rather than `flex` so it takes leftover space when
   * there is some and collapses to its minimum when the disclosed content has
   * used it all — otherwise it would fight the map for room.
   */
  spacer: { flexGrow: 1, flexShrink: 1, minHeight: space.xl },
  row: { flexDirection: "row", gap: target.gap },
  answer: {
    flex: 1,
    minHeight: metrics.answer,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /**
   * The chosen answer, and the chosen severity, and the chosen side. One
   * treatment for all three: `accentSoft` and `well` are all but identical in
   * greyscale — 1.08:1 between the two fills — so the state is carried by the
   * border stepping from the translucent rule to `brandStrong`, which is 1.7:1
   * against it. That survives glare and colour-blindness; a warmer fill alone
   * would not.
   */
  answerActive: { backgroundColor: color.accentSoft, borderColor: color.brandStrong },
  answerLabel: { ...text.baseSemi, color: color.ink, textAlign: "center" },

  /** Everything "Yes" discloses. One rhythm, set once. */
  disclosed: { marginTop: space.xl, gap: space.md },
  micro: { ...text.micro, color: color.muted },

  /** The part being scored, named in full above its controls. */
  editor: { gap: space.md },
  editorTitle: { ...text.title, color: color.ink },

  sideChip: {
    flex: 1,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /** A side that holds a score wears the body map's support colour, not the
   *  brand: this is the athlete's body being described, not a control firing. */
  sideChipScored: { backgroundColor: color.trackSoft, borderColor: color.track },
  sideLabel: { ...text.baseSemi, color: color.ink, textAlign: "center" },

  scaleBlock: { gap: space.sm },
  scale: { gap: target.gap },
  /**
   * Zero takes a full-width target with words on it. At 360pt the five-wide
   * rows below leave it no other home, and the words are what stop a measured
   * zero being tapped as a way of skipping the question.
   */
  zeroTarget: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  zeroNote: { ...text.meta, color: color.ink2, flexShrink: 1 },
  severity: {
    flex: 1,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /** Every numeral is mono, and columns of them line up. */
  digit: { ...text.stat, color: color.ink },

  readout: { ...text.meta, color: color.muted },
  /** A score never appears without its scale welded on, in one node. */
  score: { ...tabular, fontFamily: font.mono, color: color.ink2 },
  hint: { ...text.meta, color: color.muted },

  /**
   * A write that did not do what it said. Body weight and `ink2`, with no
   * banner, no icon and no red fill — it is a plain sentence about the network,
   * and nothing on this screen shouts.
   */
  writeError: { ...text.meta, color: color.ink2 },

  done: {
    minHeight: metrics.answer,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /**
   * `brandStrong` as the GROUND, not just the border: it is what the press
   * reveals when the gradient lifts, and the fallback if the gradient never
   * draws. Without it a press would expose the sunken `well` underneath and the
   * button would flash as though it had gone inert.
   */
  doneReady: { borderColor: color.brandStrong, backgroundColor: color.brandStrong },
  /** Rounded on the fill itself, so the panel needs no clipping layer. */
  doneFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.control,
  },
  doneLabel: { ...text.baseSemi, color: color.ink },
  doneLabelIdle: { color: color.muted },

  failed: { ...text.meta, color: color.ink2, marginTop: space.md },

  skeletonTitle: {
    height: metrics.headLine,
    width: "45%",
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  skeletonNote: {
    height: metrics.noteLine,
    width: "28%",
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  skeletonPrompt: {
    height: metrics.promptBlock,
    marginTop: space.lg,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  skeletonAnswer: {
    flex: 1,
    height: metrics.answer,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
});

export default CheckInCard;
