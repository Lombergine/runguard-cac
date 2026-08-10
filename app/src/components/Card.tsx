/**
 * A card. See ../../../docs/visual-spec.md § "Lines instead of shadows".
 *
 * Defined by one crisp 1.5px rule — heavier than the fashionable hairline,
 * because hairlines vanish in sunlight. NO shadow, NO elevation, no tint, no
 * gradient. Nothing in this app floats; the result should read as printed
 * rather than as glass.
 */
import { View, StyleSheet } from "react-native";

import { CardProps } from "../lib/types";
import { color } from "../theme/tokens";
import { layout, radius, ruleWidth } from "../theme/space";

export function Card({ children, padded = true }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.card,
  },
  padded: { padding: layout.cardPadding },
});

export default Card;
