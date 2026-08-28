/**
 * A card. The sunrise ground everything else sits on.
 *
 * Ported from the website's `Panel`
 * (website/src/components/athlete/tabs.tsx:22): a white surface, a rounded
 * corner, one translucent-ink hairline, and the two-layer soft shadow from
 * globals.css:77-82. The hairline is `ruleSoft` — the website's `--hairline`
 * at rgba(34,29,21,0.09) — because the shadow, not the border, is now what
 * separates the card from the cream page; a 0.14 rule on top of a real shadow
 * reads as a drawn outline rather than a lifted surface.
 *
 * This supersedes the old "lines instead of shadows, nothing floats" rule in
 * ../../../docs/visual-spec.md. Its safety and honesty rules are untouched.
 *
 * `shadow.card` is elevation and only elevation. Every card gets the same one.
 * It must never be dialled up to make one card louder than its neighbours —
 * that is what type and position are for.
 */
import { View, StyleSheet } from "react-native";

import { CardProps } from "../lib/types";
import { color, shadow } from "../theme/tokens";
import { layout, radius, ruleWidth } from "../theme/space";

export function Card({ children, padded = true, style }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    // The squircle iOS draws itself, rather than a circular arc. Free here, and
    // most of what separates a native surface from a web page in a wrapper.
    borderCurve: "continuous",
    // One `boxShadow` string, both of the website's layers. See theme/tokens.ts.
    ...shadow.card,
  },
  padded: { padding: layout.cardPadding },
});

export default Card;
