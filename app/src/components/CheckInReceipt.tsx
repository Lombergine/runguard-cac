/**
 * What the check-in card collapses into. See ../../../docs/visual-spec.md
 * § "The signature", and ../theme/tokens.ts for the sunrise palette.
 *
 * ONE LINE. Never a full-screen success state, never a tick animation, never a
 * dialog to dismiss — it costs a tap the athlete does not have, because they
 * are walking to practice. The card shrinks in place and readiness appears
 * below it; that is the entire acknowledgement.
 *
 * SUNRISE. The line now sits in a soft ember pill rather than bare on the
 * ground: it is the only trace left of the day's action, and under this system
 * ember is what marks the thing the athlete did. It is deliberately a
 * `radius.control` pill and not a `radius.card` box, and it has no border at
 * all, so it cannot be mistaken at a glance for one of the three kinds of
 * nothing — none of which is ever a filled shape.
 *
 * `label` arrives pre-formatted (visual-spec non-negotiable #2) — this
 * component never sees a Date and never derives a day. It is set in mono
 * because it is mostly figures, and the time and the day stay welded together
 * in a single text node so they can never be split across the layout.
 */
import { StyleSheet, Text, View } from "react-native";

import { radius, space } from "../theme/space";
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
  receipt: {
    // Hugs its line rather than spanning the page: a full-width bar would read
    // as a banner, and nothing on this screen announces itself.
    alignSelf: "flex-start",
    backgroundColor: color.accentSoft,
    borderRadius: radius.control,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  label: {
    ...text.base,
    ...tabular,
    fontFamily: font.mono,
    // Ink, not `brandText`: the ember here is the ground, and ink on
    // `accentSoft` measures 15.5:1 against `brandText`'s 4.9:1.
    color: color.ink,
  },
});

export default CheckInReceipt;
