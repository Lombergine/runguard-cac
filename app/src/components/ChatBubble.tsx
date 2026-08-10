/**
 * An ORDINARY chat message. See ../../../docs/visual-spec.md § "Components →
 * Chat".
 *
 * Athlete right, coach left, 12px radius, no shadow — nothing in this app
 * floats.
 *
 * A safety-intercepted message must never reach this component (visual-spec
 * non-negotiable #1). That is enforced by the TYPE OF THE TEXT, not by a
 * convention and not by an excess-property check.
 *
 * `text` is a `BubbleText`: a string carrying a brand that no ordinary string
 * has. TypeScript will not accept a plain `string` — including
 * `message.text` — where a `BubbleText` is required, so there is no
 * assignment, destructure or spread that produces a valid argument from a
 * `ChatMessage`. (An excess-property check would not do this: `const p:
 * ChatBubbleProps = message` is legal, because a supertype assignment simply
 * ignores the extra `safety` field.)
 *
 * The only way to mint a `BubbleText` is `bubbleText(message)` below, which
 * returns `null` for a flagged message. The brand type itself is deliberately
 * NOT exported, so a caller cannot even write `x as BubbleText`.
 *
 * DO NOT "simplify" this back to `text: string`. The brand is the whole
 * mechanism; without it the safety branch is a comment.
 */
import { View, Text, StyleSheet } from "react-native";

import type { ChatBubbleProps, ChatMessage } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { space, radius, ruleWidth } from "../theme/space";

declare const bubbleTextBrand: unique symbol;

/** Module-private on purpose — see the header. */
type BubbleText = string & { readonly [bubbleTextBrand]: true };

/**
 * The single mint. Returns `null` for a safety-tagged message, which is the
 * caller's cue to render `SafetyNotice` instead — there is no second way to
 * obtain the argument `ChatBubble` needs.
 */
export function bubbleText(message: ChatMessage): BubbleText | null {
  if (message.safety) return null;
  return message.text as BubbleText;
}

export function ChatBubble({
  role,
  text: body,
}: Omit<ChatBubbleProps, "text"> & { text: BubbleText }) {
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
