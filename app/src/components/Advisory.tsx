/**
 * The advisory line. See ../../../docs/visual-spec.md § "Status and advisory".
 *
 * It DESCRIBES; it must not read as an instruction. So: body weight, lowercase
 * flag word, one past-tense reason line. No badge fill, no tinted panel, no
 * border, no uppercase, no warning iconography. The shape of the dot — not its
 * colour — is what carries the state.
 *
 * Under sunrise colour is no longer rationed, so the flag word takes its state
 * colour too. Every one of them comes from the `…Text` set, never the fills:
 * the fills are the website's raw hexes and are unreadable as type
 * (`ok` 3.30:1 and `watch` 3.19:1 on `card`, against a 4.5:1 floor). Measured
 * on `card` / on the cream page:
 *
 *   clear    okText      #117E39   5.16 / 4.83
 *   watch    watchText   #A55A05   5.17 / 4.83
 *   unusual  unusualText #D42222   5.18 / 4.85
 *   unknown  unknown     #6F675C   5.57 / 5.21
 *
 * Colour is the ONLY thing that varies between the four — same family, same
 * size, same lowercase, same weight, no fill behind any of them. A red word is
 * not a red banner, and swapping the word's colour cannot turn a description
 * into an instruction the way a badge or an alert weight would.
 */
import { View, Text, StyleSheet } from "react-native";
import type { ColorValue } from "react-native";

import { AdvisoryProps, Flag } from "../lib/types";
import { StatusDot } from "./StatusDot";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space } from "../theme/space";

/** Text-safe twin of each state fill. Never the fill itself — see the header. */
const flagText: Record<Flag, ColorValue> = {
  clear: color.okText,
  watch: color.watchText,
  unusual: color.unusualText,
  unknown: color.unknown,
};

export function Advisory({ flag, reason }: AdvisoryProps) {
  return (
    <View>
      <View style={styles.row}>
        <StatusDot flag={flag} />
        {/* Already lowercase in the type; no textTransform is applied. */}
        <Text style={[styles.flag, { color: flagText[flag] }]}>{flag}</Text>
      </View>
      <Text style={styles.reason}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // Body weight and lowercase in every state. Only the colour changes.
  flag: { ...text.base },
  reason: { ...text.meta, color: color.ink2, marginTop: space.xs },
});

export default Advisory;
