/**
 * The advisory line. See ../../../docs/visual-spec.md § "Status and advisory".
 *
 * It DESCRIBES; it must not read as an instruction. So: body weight, lowercase
 * flag word, one past-tense reason line. No badge fill, no uppercase, no
 * warning iconography, no red panel, no border. The dot is the only colour, and
 * the shape — not the colour — is what carries the state.
 */
import { View, Text, StyleSheet } from "react-native";

import { AdvisoryProps } from "../lib/types";
import { StatusDot } from "./StatusDot";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space } from "../theme/space";

export function Advisory({ flag, reason }: AdvisoryProps) {
  return (
    <View>
      <View style={styles.row}>
        <StatusDot flag={flag} />
        {/* Already lowercase in the type; no textTransform is applied. */}
        <Text style={styles.flag}>{flag}</Text>
      </View>
      <Text style={styles.reason}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // Body weight and ink, never the status colour — colour stays on the dot.
  flag: { ...text.base, color: color.ink },
  reason: { ...text.meta, color: color.ink2, marginTop: space.xs },
});

export default Advisory;
