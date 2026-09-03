/**
 * The segmented control — what the web's window `<select>` becomes.
 *
 * The mock lists this as one of the six changes from the web, and the reason is
 * that a `<select>` hides its options behind a tap. The range control is not a
 * form field a reader fills in once; it is the axis of every chart on the
 * screen, and on a phone the reader flips it repeatedly to compare. A segmented
 * control shows the whole choice set and the current position at rest, so
 * "which window am I looking at" needs no interaction to answer.
 *
 * ── SIZED FOR A THUMB, NOT FOR THE TEXT ────────────────────────────────────
 * Every segment is at least `target.min` tall and the row stretches its
 * children equally, so a two-character option ("1d") is the same tap area as a
 * five-character one ("1 month"). Sizing to the label would make the shortest
 * window the hardest to hit, which is backwards — the short windows are the
 * ones a coach reaches for before practice.
 */
import { StyleSheet, Text, View, Pressable } from "react-native";

import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { radius, space, target } from "../theme/space";

export type SegmentedOption<T extends string> = {
  value: T;
  /** The visible text. Kept short — five segments share one row. */
  label: string;
  /**
   * What a screen reader announces, when the visible label is an abbreviation.
   * "24h" is a fine thing to read and a poor thing to hear.
   */
  accessibilityLabel?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            /*
              `selected`, not a colour, is what a screen reader announces. The
              filled segment is the visual half of the same fact and neither is
              allowed to be the only one.
            */
            accessibilityState={{ selected }}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: color.well,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: target.min - space.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    borderRadius: radius.control - 2,
  },
  /* The raised segment reads as raised: a surface, not a tint. */
  segmentSelected: { backgroundColor: color.card },
  segmentPressed: { backgroundColor: color.fillStrong },
  label: { ...text.meta, color: color.ink2 },
  labelSelected: { ...text.baseSemi, color: color.ink },
});

export default Segmented;
