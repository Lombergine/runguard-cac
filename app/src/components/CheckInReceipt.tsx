/**
 * What the check-in card collapses into. See ../../../docs/visual-spec.md
 * § "The signature".
 *
 * ONE LINE. Never a full-screen success state, never a tick animation, never a
 * dialog to dismiss — it costs a tap the athlete does not have, because they
 * are walking to practice. The card shrinks in place and readiness appears
 * below it; that is the entire acknowledgement.
 *
 * `label` arrives pre-formatted (visual-spec non-negotiable #2) — this
 * component never sees a Date and never derives a day. It is set in mono
 * because it is mostly figures, and the time and the day stay welded together
 * in a single text node so they can never be split across the layout.
 */
import { StyleSheet, Text, View } from "react-native";

import { space } from "../theme/space";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";

type CheckInReceiptProps = {
  /** e.g. "Checked in 6:12am · Tue 14 Oct", from lib/dates. */
  label: string;
};

export function CheckInReceipt({ label }: CheckInReceiptProps) {
  return (
    <View style={styles.receipt}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: { paddingVertical: space.xs },
  label: {
    ...text.base,
    ...tabular,
    fontFamily: font.mono,
    color: color.ink,
  },
});

export default CheckInReceipt;
