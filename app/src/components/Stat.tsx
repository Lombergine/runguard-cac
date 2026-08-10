/**
 * One figure with its micro-label. See ../../../docs/visual-spec.md § Type.
 *
 * The value arrives PRE-FORMATTED with its unit already welded on ("4.2 mi",
 * "8:51 /mi"). This component never concatenates a unit and never formats a
 * number — a bare numeral with the unit rendered elsewhere in the layout is
 * exactly what the spec forbids.
 */
import { View, Text, StyleSheet } from "react-native";

import { StatProps } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space } from "../theme/space";

export function Stat({ label, value }: StatProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...text.micro, color: color.muted },
  value: { ...text.stat, color: color.ink, marginTop: space.xs },
});

export default Stat;
