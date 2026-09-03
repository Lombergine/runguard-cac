/**
 * The time window every figure and every chart on a coach screen is drawn over.
 *
 * ONE control per screen, not one per chart. A picker above each graph would
 * let a coach leave the workload ratio on 7 days and the training load on 6
 * months and then compare the two — which is a mistake the interface should
 * make impossible rather than merely discourage. Everything below it moves
 * together or nothing does.
 *
 * ── NOW A SEGMENTED CONTROL ────────────────────────────────────────────────
 * The iOS mock lists "the window <select> → a segmented control" as one of the
 * six changes from the web, and this was the app's own version of that select:
 * a scrolling row of chips, where the options past the fourth sat off-screen
 * and the control had no single resting shape.
 *
 * A segmented control shows the whole choice set and the current position at
 * rest, which matters because this is not a form field filled in once — it is
 * the axis of every figure below it, and a coach flips it repeatedly to
 * compare. `Segmented` also gives every option the same tap area, so the short
 * windows (the ones reached for before practice) stop being the hardest to hit.
 *
 * The labels shorten here rather than in `lib/range.ts`: five segments share
 * one row, so "24 hours" becomes "24h". The long forms stay on the wire and in
 * the accessibility label, where there is room for them.
 */
import { View, StyleSheet, Text } from "react-native";

import { Segmented } from "./Segmented";
import { RANGES, type RangeKey } from "../lib/range";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space } from "../theme/space";

export function RangePicker({
  value,
  onChange,
  /** Shown above the row. Omitted on screens whose header already says it. */
  label,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
  label?: string;
}) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Segmented
        value={value}
        onChange={onChange}
        accessibilityLabel={label ?? "Time window"}
        // `short` is the compact form ("24h", "6mo"); the full label is what a
        // screen reader announces, via Segmented's own accessibilityLabel.
        options={RANGES.map((r) => ({
          value: r.key,
          label: r.short,
          accessibilityLabel: r.label,
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: { ...text.micro, color: color.muted },
});

export default RangePicker;
