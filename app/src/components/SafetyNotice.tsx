/**
 * A safety-intercepted reply. See ../../../docs/visual-spec.md
 * non-negotiable #1 and § "Components → Chat".
 *
 * This is the app speaking plainly, NOT a participant in a conversation, so it
 * shares nothing with `ChatBubble` — not a style, not a helper, not a file.
 * Deliberately absent, and each absence is load-bearing:
 *
 *   - no bubble geometry at all (no radius, no max width, no tail, no side)
 *   - no avatar, no role label, no timestamp
 *   - no reactions, no long-press menu, and `selectable={false}` so the text
 *     cannot be lifted out and quoted back into the thread
 *
 * It is also NOT an alert: no red, no warning triangle, no icon, no badge. The
 * only emphasis is the 3px left rule in `ink2` — a printed sidebar rule, which
 * is heavier than a card rule and carries no colour meaning.
 *
 * Full-bleed by construction: this renders edge to edge, so the chat list must
 * hold its horizontal inset on the bubble rows rather than on the list itself.
 */
import { View, Text, StyleSheet } from "react-native";

import { SafetyNoticeProps } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space, safetyRuleWidth } from "../theme/space";

export function SafetyNotice({ text: body }: SafetyNoticeProps) {
  return (
    <View style={styles.notice}>
      <Text style={styles.body} selectable={false}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    // Full width; no borderRadius anywhere, on purpose.
    backgroundColor: color.card,
    borderLeftWidth: safetyRuleWidth,
    borderLeftColor: color.ink2,
    padding: space.xl,
  },
  body: { ...text.base, color: color.ink },
});

export default SafetyNotice;
