/**
 * A tappable row that explains itself — what a hover tooltip becomes.
 *
 * The mock's sixth change: "Hover tooltips → tappable disclosure rows". A
 * tooltip assumes a pointer that can rest on something without committing to
 * it. A phone has no such gesture, so `InfoDot` had to simulate one — a 16px
 * circled "i", a measured anchor, a floating panel positioned against the
 * screen edges. It works, and it is a web idiom wearing a native costume.
 *
 * The native form is that the row IS the control: the whole thing takes the
 * tap and answers in a sheet. That gives a target the size of the row instead
 * of a dot, which matters because these explanations exist for the reader who
 * does not already know what HRV is — the same reader least likely to spot a
 * 16px affordance.
 *
 * ── THE COPY IS THE SAME COPY ──────────────────────────────────────────────
 * Every explanation already written for `InfoDot` moves across verbatim.
 * These sentences are the product's own account of what it measures and how
 * confident it is ("It is not a fitness score — you can be very fit and very
 * flat"), and rewriting them for a new container is how a product starts
 * describing itself two different ways.
 *
 * `InfoDot` is NOT deleted: it is still right beside a stat inside a dense
 * card where there is no row to tap. This is the form for anything that sits
 * in a list.
 */
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ListRow } from "./List";
import { Sheet } from "./Sheet";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space } from "../theme/space";

export function DisclosureRow({
  label,
  value,
  detail,
  /** The explanation. Same sentences the web tooltip carries. */
  explainer,
  /** Where the number came from — "Apple Health", "you reported this". */
  source,
  children,
}: {
  label: string;
  value?: ReactNode;
  detail?: string;
  explainer: string;
  source?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        label={label}
        value={value}
        detail={detail}
        onPress={() => setOpen(true)}
        /* The tap opens an explanation, so the label a screen reader hears
           says that — "Sleep" alone would not tell anyone the row does
           anything at all. */
        accessibilityLabel={`${label}. What is this?`}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        subtitle={source}
      >
        <Text style={styles.explainer}>{explainer}</Text>
        {children}
        {/*
          Kept at the bottom of every explanation. RunGuard is a monitoring
          signal, not medical advice, and the place a reader is most likely to
          mistake it for one is the screen where it has just explained a
          physiological measurement to them.
        */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            RunGuard describes what it observed. It does not diagnose anything,
            and it never tells you to stop, rest or see anyone — that is your
            coach&apos;s call, and a doctor&apos;s.
          </Text>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  explainer: { ...text.base, color: color.ink2, lineHeight: 24 },
  disclaimer: {
    borderTopWidth: 1,
    borderTopColor: color.sep,
    paddingTop: space.md,
  },
  disclaimerText: { ...text.meta, color: color.muted, lineHeight: 20 },
});

export default DisclosureRow;
