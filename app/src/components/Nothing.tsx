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
 *            border            fill    elevation      content
 *   Absent   1.5 dashed rule   well    sunken (none)  "—" + "Not recorded"
 *   Zero     1.5 solid  rule   card    shadow.card    "0 mi"
 *   NoRun    1.5 dotted soft   none    flat (none)    "No run. Rest day."
 *
 * Dashed means "we don't know", everywhere in this app, with no exceptions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RE-VERIFIED ON THE CREAM GROUND, AND WHY ZERO NOW HAS A SHADOW
 *
 * These three were tuned against the old pale-cool palette (bg #F3F5F4, well
 * #E9EDEB). Sunrise moved the page to a much lighter cream, which squeezed the
 * fill axis. Relative luminance (WCAG), fills only:
 *
 *   card #FFFFFF  L 1.0000
 *   bg   #FAF7F2  L 0.9326      (was #F3F5F4, L 0.9089)
 *   well #F4EFE6  L 0.8668      (was #E9EDEB, L 0.8389)
 *
 *   on the page ground        ΔL vs bg      then        now
 *     Absent  well            sunken        −0.0700    −0.0658   (held)
 *     Zero    card            raised        +0.0911    +0.0674   (−26%)
 *     NoRun   none                           0          0
 *
 *   inside a white Card       ΔL vs card
 *     Absent  well            −0.1611 then, −0.1332 now (−17%)
 *     Zero    card             0.0000  ← identical to NoRun
 *     NoRun   none             0.0000  ← identical to Zero
 *
 * Absent survived: it is still the only one of the three whose fill is visibly
 * darker than whatever it sits on, and it is still the only dashed object.
 *
 * Zero did not. Its whole distinguishing move was "white, like every other
 * fact", and a cream page is now nearly white, so on the page ground the slot
 * lost a quarter of its separation — and inside a Card, Zero and NoRun became
 * the same colour with only a 1.33:1 solid rule against a 1.19:1 dotted one to
 * tell them apart. That is not a difference that survives 6am glare.
 *
 * So elevation becomes the third axis, and it is a GREYSCALE axis: `shadow.card`
 * lays a diffuse rgba(34,29,21,0.10) halo under Zero, which composites to about
 * L 0.77 at its darkest against the cream page — a ΔL of roughly 0.16, larger
 * than any of the fill deltas above and independent of them.
 *
 * This is not a shadow used to make one card louder (tokens.ts forbids that).
 * It is the same `shadow.card` every real surface gets, and the three states
 * now differ on three axes at once — border style, fill, and elevation:
 *
 *   Absent  dashed  · darker fill  · sunken, no shadow
 *   Zero    solid   · white fill   · raised, shadow.card
 *   NoRun   dotted  · no fill      · flat, no shadow
 *
 * Print any pair in greyscale and they are still two different objects.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `borderStyle: 'dashed' | 'dotted'` needs a non-zero borderRadius to render on
 * iOS, hence radius.card on all three.
 */
import { View, Text, StyleSheet } from "react-native";

import { AbsentProps, ZeroProps, NoRunProps } from "../lib/types";
import { color, shadow } from "../theme/tokens";
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
    // No shadow. An unknown is a hole in the page, not a surface on top of it.
  },
  // 22px is under the 24px large-text threshold, so this needs the full 4.5:1
  // against the `well` fill above, not the 3:1 large-text allowance.
  // `unknown` #6F675C on the cream `well` measures 4.86:1.
  value: { ...text.stat, color: color.unknown },
  // ink2 (7.04:1 on `well`), not muted. Sunrise's muted now technically clears
  // on `well` at 4.51:1, but that is a margin of 0.01 against a spec whose own
  // quality floor calls 4.5 "the floor rather than the goal", and this label is
  // the only thing naming what the dash means.
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
    // The full `rule`, not Card's `ruleSoft`: this is a data slot, and its
    // solid edge has to stay legibly heavier than NoRun's dotted `ruleSoft`
    // (1.33:1 vs 1.19:1 against the page).
    borderColor: color.rule,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    // Raised, exactly like Card and Tile. See the header: on cream this is what
    // keeps a measured zero from flattening into NoRun.
    ...shadow.card,
  },
  // ink on card: 16.74:1.
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
    // Stays the faint `ruleSoft`. Rest is meant to recede; it is the one of the
    // three that should look like almost nothing, and it is now the only one of
    // the three that is neither filled nor raised.
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  // muted: 5.16:1 on card, 4.83:1 on the page.
  label: { ...text.meta, color: color.muted },
});
