/**
 * An ORDINARY chat message. See ../../../docs/visual-spec.md § "Components →
 * Chat".
 *
 * Athlete right, coach left, 12px radius, no shadow — nothing in this app
 * floats.
 *
 * A safety-intercepted message must never reach this component (visual-spec
 * non-negotiable #1). Two things enforce that rather than a convention:
 *
 *   1. `ChatBubbleProps` carries `role` and `text` and nothing else, so there
 *      is no "safety mode" prop to set and no message object to inspect.
 *   2. The `safety?: never` intersection below makes `<ChatBubble {...msg} />`
 *      a compile error for any `ChatMessage`, since its `safety: boolean` is
 *      not assignable to `undefined`. Callers must destructure the two fields
 *      by hand, which is exactly the moment they have to decide what the flag
 *      means.
 *
 * The branch to `SafetyNotice` happens in the list renderer, before this
 * function is ever called.
 */
import { View, Text, StyleSheet } from "react-native";

import { ChatBubbleProps } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space, radius, ruleWidth } from "../theme/space";

export function ChatBubble({ role, text: body }: ChatBubbleProps & { safety?: never }) {
  const mine = role === "user";
  return (
    <View style={mine ? styles.rowMine : styles.rowTheirs}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowMine: { alignItems: "flex-end" },
  rowTheirs: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "84%",
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  /** Athlete. The one accent appearance in the thread. */
  mine: { backgroundColor: color.accentSoft },
  /** Coach. A sunken well held by a rule, matching every other surface. */
  theirs: {
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
  },
  body: { ...text.base, color: color.ink },
});

export default ChatBubble;
