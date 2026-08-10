/**
 * The three kinds of nothing. See ../../../docs/visual-spec.md § "Three kinds
 * of nothing".
 *
 * THREE separate components with three separate stylesheets. There is
 * deliberately no shared base and no `kind` prop: a variant flag is exactly how
 * these drift into each other, and the whole product rests on them staying
 * distinguishable at arm's length in glare.
 *
 * The repetition below is the point. Do not factor it out.
 *
 *   Absent  1.5 dashed rule   · well fill        · "—" + "Not recorded"
 *   Zero    1.5 solid  rule   · card fill        · "0 mi"
 *   NoRun   1.5 dotted ruleSoft · no fill        · "No run. Rest day."
 *
 * Dashed means "we don't know", everywhere in this app, with no exceptions.
 *
 * `borderStyle: 'dashed' | 'dotted'` needs a non-zero borderRadius to render on
 * iOS, hence radius.card on all three.
 */
import { View, Text, StyleSheet } from "react-native";

import { AbsentProps, ZeroProps, NoRunProps } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

/* ------------------------------------------------------------------ *
 * Absent — not recorded. The only dashed object in the app.
 * ------------------------------------------------------------------ */

export function Absent({ label = "Not recorded", eyebrow }: AbsentProps) {
  return (
    <View>
      {eyebrow ? <Text style={absent.eyebrow}>{eyebrow}</Text> : null}
      <View style={absent.slot}>
        <Text style={absent.value}>—</Text>
        <Text style={absent.label}>{label}</Text>
      </View>
    </View>
  );
}

const absent = StyleSheet.create({
  eyebrow: { ...text.micro, color: color.muted, marginBottom: space.sm },
  slot: {
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  // 22px is under the 24px large-text threshold, so this needs the full 4.5:1
  // against the `well` fill above, not the 3:1 large-text allowance.
  // `unknown` on `well` measures 4.82:1 — see the token for the full working.
  value: { ...text.stat, color: color.unknown },
  // ink2, not muted: muted clears 4.5:1 on `bg` (4.50) but not on the sunken
  // `well` (4.17). ink2 on `well` is 8.38:1.
  label: { ...text.meta, color: color.ink2, marginTop: space.xs },
});

/* ------------------------------------------------------------------ *
 * Zero — a genuine measured zero. A fact, styled like every other fact.
 * ------------------------------------------------------------------ */

export function Zero({ unit, eyebrow }: ZeroProps) {
  return (
    <View>
      {eyebrow ? <Text style={zero.eyebrow}>{eyebrow}</Text> : null}
      <View style={zero.slot}>
        {/* One text node. The unit is welded to the numeral, never adjacent. */}
        <Text style={zero.value}>{`0 ${unit}`}</Text>
      </View>
    </View>
  );
}

const zero = StyleSheet.create({
  eyebrow: { ...text.micro, color: color.muted, marginBottom: space.sm },
  slot: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderStyle: "solid",
    borderColor: color.rule,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  value: { ...text.stat, color: color.ink },
});

/* ------------------------------------------------------------------ *
 * NoRun — rest, or nothing scheduled. Recedes. Not a failure.
 * ------------------------------------------------------------------ */

export function NoRun({ label = "No run. Rest day.", eyebrow }: NoRunProps) {
  return (
    <View>
      {eyebrow ? <Text style={noRun.eyebrow}>{eyebrow}</Text> : null}
      <View style={noRun.slot}>
        <Text style={noRun.label}>{label}</Text>
      </View>
    </View>
  );
}

const noRun = StyleSheet.create({
  eyebrow: { ...text.micro, color: color.muted, marginBottom: space.sm },
  slot: {
    // No backgroundColor at all — the fill is whatever surface sits behind it.
    borderWidth: ruleWidth,
    borderStyle: "dotted",
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  label: { ...text.meta, color: color.muted },
});
