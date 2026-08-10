/**
 * The check-in prompt. See ../../../docs/visual-spec.md § "The signature".
 *
 * This is the hero of the home screen — the QUESTION, not readiness. Ten of
 * fourteen athletes are not reporting and readiness is mostly weighted to
 * self-report, so the screen's job is input, not display. The empty slot is not
 * a gap to apologise for; it is the product's main call to action, and so it is
 * the largest, highest-contrast, most thumb-reachable thing on the screen.
 *
 * Two taps total — sleep, then soreness. The card holds which of the two
 * questions is showing; the SCREEN owns the network call and decides when to
 * swap this for CheckInReceipt. No step counter, no "next", no confirmation:
 * the second tap is the submit.
 *
 * The answer row is anchored to the bottom of the card by a flexible spacer, so
 * it sits in the bottom third within one-handed reach and does not move when
 * the question above it wraps to a different number of lines.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, ruleWidth, space, target } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/** The sleep question's three answers. */
export type SleepAnswer = "bad" | "ok" | "good";

/** The soreness question's three answers. */
export type SorenessAnswer = "none" | "some" | "lot";

export type CheckInAnswers = { sleep: SleepAnswer; soreness: SorenessAnswer };

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
 * Exact heights, exported so the screen's skeleton can reserve them. The
 * skeleton must not be a guess: the athlete may tap before the data settles and
 * the layout is forbidden from moving under their thumb.
 */
export const checkInMetrics = {
  /** One line of text.micro, which sets no explicit lineHeight. */
  eyebrowLine: (text.micro.fontSize as number) + space.xs,
  /** Two lines of text.prompt — the longer question wraps to two at 360px. */
  promptBlock: PROMPT_LINE * 2,
  /** Comfortably over the 48px floor, with room for a wrapped label. */
  answer: target.min + space.sm,
} as const;

type CheckInCardProps = {
  /**
   * Pre-formatted local string, e.g. "TUE 14 OCT · BEFORE PRACTICE". Never
   * derived here — see lib/dates.
   */
  header: string;
  /** Fired on the second tap, with both answers. */
  onComplete: (answers: CheckInAnswers) => void;
  /** True while the answers are in flight. Targets stay put but go inert. */
  submitting: boolean;
  /** True when the last attempt did not reach the server. */
  failed: boolean;
};

export function CheckInCard({ header, onComplete, submitting, failed }: CheckInCardProps) {
  const [sleep, setSleep] = useState<SleepAnswer | null>(null);
  const [soreness, setSoreness] = useState<SorenessAnswer | null>(null);

  /**
   * Second tap submits. On a failure the soreness row stays on screen with the
   * answer still selected, so tapping again is a retry rather than a restart.
   */
  function pickSoreness(value: SorenessAnswer) {
    if (sleep === null) return;
    setSoreness(value);
    onComplete({ sleep, soreness: value });
  }

  const askingSoreness = sleep !== null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{header}</Text>
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

      {failed ? <Text style={styles.failed}>That didn't send. Tap again.</Text> : null}
    </View>
  );
}

type AnswerRowProps<T extends string> = {
  options: readonly Option<T>[];
  selected: T | null;
  disabled: boolean;
  onPick: (value: T) => void;
};

function AnswerRow<T extends string>({
  options,
  selected,
  disabled,
  onPick,
}: AnswerRowProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled }}
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
  card: { flex: 1 },
  eyebrow: { ...text.micro, color: color.muted },
  prompt: { ...text.prompt, color: color.ink, marginTop: space.lg },
  spacer: { flex: 1, minHeight: space.xl },
  row: { flexDirection: "row", gap: target.gap },
  answer: {
    flex: 1,
    minHeight: checkInMetrics.answer,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /** The one place accent is spent on this screen: the thing you tap. */
  answerActive: { backgroundColor: color.accentSoft, borderColor: color.accent },
  answerLabel: { ...text.baseSemi, color: color.ink, textAlign: "center" },
  failed: { ...text.meta, color: color.ink2, marginTop: space.md },
});

export default CheckInCard;
