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
 * SUNRISE. The card is now a real Panel, in the website's sense
 * (`website/src/components/athlete/tabs.tsx:22`): a white ground on warm cream,
 * `shadow.card` for elevation, a hairline rule, and a head row of TITLE on the
 * left with a muted note on the right. The eyebrow the old layout stacked above
 * the prompt has become that head — "Before practice · Tue 14 Oct" split across
 * the two halves of the row — so the prompt is the first thing under it and the
 * signature stays as focused as it was.
 *
 * EMBER. Two appearances, both load-bearing: the gradient hairline across the
 * top of the panel (the port of the website's `.card-ember`, reserved there for
 * hero cards), and the fill on "Done", which is the one real system action on
 * this card. Its label stays `color.ink`, never white — the three ember stops
 * run 5.9:1 to 10.0:1 against ink, and only 1.7:1 to 2.8:1 against white.
 *
 * Two taps for the common case — sleep, then soreness. The card holds which of
 * the two questions is showing; the SCREEN owns the network call and decides
 * when to swap this for CheckInReceipt. No step counter, no "next", no
 * confirmation: on "No" the second tap is the submit.
 *
 * WHERE, NOT JUST HOW MUCH. "A bit" or "A lot" reveals the BodyMap inline,
 * because POST /api/checkin stores soreness per part (`sorenessPart` +
 * `sorenessSeverity`) and there is nowhere for a partless answer to go — an
 * abstract severity with no region is data the server cannot keep. The level
 * row is the quick triage; the map is the specced soreness picker that makes
 * the answer storable at all.
 *
 * The answer row is anchored to the bottom of the card by a flexible spacer, so
 * it sits in the bottom third within one-handed reach and does not move when
 * the question above it wraps to a different number of lines. The spacer
 * collapses to its minimum once the map is showing and the card overflows.
 */
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { layout, radius, ruleWidth, space, target } from "../theme/space";
import { color, shadow } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { BodyMap } from "./BodyMap";

/** The sleep question's three answers. */
export type SleepAnswer = "bad" | "ok" | "good";

/** The soreness question's three answers. */
export type SorenessAnswer = "none" | "some" | "lot";

export type CheckInAnswers = {
  sleep: SleepAnswer;
  soreness: SorenessAnswer;
  /**
   * Body-part keys from lib/bodyParts, one per region the athlete marked.
   * Always empty when `soreness` is "none". The screen stores one per request.
   */
  parts: string[];
};

/**
 * A count of marked regions with its noun welded on, e.g. "1 area", "3 areas".
 * Exported because the receipt has to name the same number this card showed,
 * and the two must not word it differently.
 */
export function areaLabel(n: number): string {
  return `${n} ${n === 1 ? "area" : "areas"}`;
}

type Option<T extends string> = { value: T; label: string };

const SLEEP_OPTIONS: readonly Option<SleepAnswer>[] = [
  { value: "bad", label: "Bad" },
  { value: "ok", label: "OK" },
  { value: "good", label: "Good" },
];

const SORENESS_OPTIONS: readonly Option<SorenessAnswer>[] = [
  { value: "none", label: "No" },
  { value: "some", label: "A bit" },
  { value: "lot", label: "A lot" },
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
   * Pre-formatted local day, e.g. "Tue 14 Oct" — the panel's note. Never
   * derived here; see lib/dates. The card supplies the "before practice" half
   * of the header itself, because that is a fact about the card and not about
   * the calendar.
   */
  dateLabel: string;
  /**
   * Fired with every answer at once: on the second tap when soreness is "No",
   * otherwise once the athlete has marked where and confirmed.
   */
  onComplete: (answers: CheckInAnswers) => void;
  /** True while the answers are in flight. Targets stay put but go inert. */
  submitting: boolean;
  /** True when the last attempt did not reach the server. */
  failed: boolean;
};

export function CheckInCard({
  dateLabel,
  onComplete,
  submitting,
  failed,
}: CheckInCardProps) {
  const [sleep, setSleep] = useState<SleepAnswer | null>(null);
  const [soreness, setSoreness] = useState<SorenessAnswer | null>(null);
  const [parts, setParts] = useState<string[]>([]);

  /**
   * "No" submits on the second tap — nothing to locate, so the fast path stays
   * two taps. "A bit" and "A lot" open the map instead, because a severity with
   * no region cannot be stored. On a failure everything stays on screen with
   * the answers still selected, so tapping again is a retry, not a restart.
   */
  function pickSoreness(value: SorenessAnswer) {
    if (sleep === null) return;
    setSoreness(value);
    if (value === "none") {
      setParts([]);
      onComplete({ sleep, soreness: value, parts: [] });
    }
  }

  function togglePart(partKey: string) {
    setParts((prev) =>
      prev.includes(partKey) ? prev.filter((k) => k !== partKey) : [...prev, partKey]
    );
  }

  function submitSore() {
    if (sleep === null || soreness === null || parts.length === 0) return;
    onComplete({ sleep, soreness, parts });
  }

  const askingSoreness = sleep !== null;
  const askingWhere = soreness === "some" || soreness === "lot";
  const ready = parts.length > 0;

  return (
    <View style={styles.panel}>
      <EmberEdge />
      <View style={styles.body}>
        {/* The Panel head: title left, muted note right. The note carries the
            explicit local day, so the header still reads as a date and never
            as a bare relative label (visual-spec non-negotiable #2). */}
        <View style={styles.head}>
          <Text style={styles.title}>Before practice</Text>
          <Text style={styles.note}>{dateLabel}</Text>
        </View>

        <Text style={styles.prompt}>
          {askingSoreness ? "Anything sore?" : "How did you sleep?"}
        </Text>

        {/* Pushes the targets into the bottom third, one-handed reach. */}
        <View style={styles.spacer} />

        {askingSoreness ? (
          <AnswerRow
            options={SORENESS_OPTIONS}
            selected={soreness}
            disabled={submitting}
            expanded={askingWhere}
            onPick={pickSoreness}
          />
        ) : (
          <AnswerRow
            options={SLEEP_OPTIONS}
            selected={sleep}
            disabled={false}
            onPick={setSleep}
          />
        )}

        {askingWhere ? (
          <View>
            <Text style={styles.whereLabel}>Where</Text>
            <View style={styles.map}>
              <BodyMap selected={parts} onToggle={togglePart} />
            </View>

            {/* One line either way, so confirming a region moves nothing. */}
            <Text style={styles.chosen}>
              {ready ? (
                <>
                  <Text style={styles.chosenCount}>{areaLabel(parts.length)}</Text> chosen.
                </>
              ) : (
                "No areas chosen yet."
              )}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || submitting }}
              disabled={!ready || submitting}
              onPress={submitSore}
              style={[styles.done, ready && styles.doneReady]}
            >
              {/* Ember, because this is the card's one system action. The label
                  above it stays ink: white on these stops bottoms out at
                  1.7:1, ink never drops below 5.9:1. */}
              {ready ? (
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
            </Pressable>
          </View>
        ) : null}

        {failed ? (
          <Text style={styles.failed}>That didn't send. Tap again.</Text>
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
    <View style={styles.panel}>
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
     * A radiogroup, not a row of buttons: these are three answers to ONE
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
    flex: 1,
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
  body: { flex: 1, padding: layout.cardPadding },

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
  spacer: { flex: 1, minHeight: space.xl },
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
   * The chosen answer. `accentSoft` and `well` are all but identical in
   * greyscale — 1.08:1 between the two fills — so the state is carried by the
   * border stepping from the translucent rule to `brandStrong`, which is 1.7:1
   * against it. That survives glare and colour-blindness; a warmer fill alone
   * would not.
   */
  answerActive: { backgroundColor: color.accentSoft, borderColor: color.brandStrong },
  answerLabel: { ...text.baseSemi, color: color.ink, textAlign: "center" },

  whereLabel: { ...text.micro, color: color.muted, marginTop: space.xl },
  map: { marginTop: space.md },
  chosen: { ...text.meta, color: color.muted, marginTop: space.md },
  /** Numerals are mono everywhere, and the count keeps its noun welded on. */
  chosenCount: { ...tabular, fontFamily: font.mono, color: color.ink2 },
  done: {
    minHeight: metrics.answer,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginTop: space.md,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  doneReady: { borderColor: color.brandStrong },
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
