/**
 * An ORDINARY chat message. See ../../../docs/visual-spec.md § "Components →
 * Chat".
 *
 * Athlete right, coach left, 12px radius. Under the sunrise re-skin a bubble
 * DOES float: both sides carry the same `shadow.card`, because equal elevation
 * is what keeps the pair reading as two turns of one conversation rather than
 * one of them being emphasised. The athlete's turn takes the soft ember wash
 * (`accentSoft`, ink on it 14.4:1), the coach's a plain white card held off the
 * cream ground by a soft rule.
 *
 * The bubble geometry — radius, 84% max width, a side — is also what makes
 * `SafetyNotice` legible as NOT a message. Do not lend any of it to that
 * component, and do not take its full-bleed flatness for this one.
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
 * returns `null` for a flagged message.
 *
 * ── WHY THE TEXT IS CARRIED IN AN OBJECT, NOT A BRANDED STRING ──────────────
 * It used to be `string & { [brand]: true }`, and that had a hole. The brand
 * type is not exported, but it is still REACHABLE through the mint's signature:
 *
 *     <ChatBubble text={flagged.text as NonNullable<ReturnType<typeof bubbleText>>} />
 *
 * compiles. `ReturnType` can name a type that was never exported, so "do not
 * export the brand" is not a fence — and a fence made only of types is defeated
 * by any cast, because casts are erased before anything runs.
 *
 * So the guarantee is no longer only a compile-time one. `bubbleText` returns an
 * OBJECT whose text sits behind `carried`, a module-private runtime symbol that
 * no other module can obtain. A caller who casts their way past the type still
 * hands over a plain string, `body[carried]` is `undefined`, and the component
 * renders NOTHING rather than a crisis reply in a chat bubble.
 *
 * Both fences are kept deliberately: the type stops the accident at the keyboard,
 * and the symbol stops the cast at runtime. A safety reply cannot be bubbled by
 * any incantation, only by editing this file.
 *
 * DO NOT "simplify" this back to `text: string`. Without it the safety branch is
 * a comment.
 */
import { View, Text, StyleSheet } from "react-native";

import type { ChatBubbleProps, ChatMessage } from "../lib/types";
import { color, shadow } from "../theme/tokens";
import { text } from "../theme/type";
import { space, radius, ruleWidth } from "../theme/space";

/**
 * Module-private, and private at RUNTIME as well as in the type system — this is
 * the half a cast cannot forge. `const x = Symbol()` infers `unique symbol`, so
 * it works as a key in the type below.
 */
const carried = Symbol("bubbleText");

/** Module-private on purpose — see the header. */
type BubbleText = { readonly [carried]: string };

/**
 * The single mint. Returns `null` for a safety-tagged message, which is the
 * caller's cue to render `SafetyNotice` instead — there is no second way to
 * obtain the argument `ChatBubble` needs.
 */
export function bubbleText(message: ChatMessage): BubbleText | null {
  if (message.safety) return null;
  return { [carried]: message.text };
}

export function ChatBubble({
  role,
  text: body,
}: Omit<ChatBubbleProps, "text"> & { text: BubbleText }) {
  const mine = role === "user";
  // The runtime half of the fence. Anything that reached here without going
  // through `bubbleText` — i.e. via a cast — has no `carried` property, and a
  // message we cannot vouch for is not rendered at all. Failing closed is the
  // whole point: the alternative is a safety reply wearing bubble geometry.
  const body_ = body?.[carried];
  if (typeof body_ !== "string") return null;

  return (
    <View style={mine ? styles.rowMine : styles.rowTheirs}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text style={styles.body}>{body_}</Text>
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
    // Elevation, not emphasis: identical on both sides.
    ...shadow.card,
  },
  /** Athlete. A soft ember wash — the brand, not a status. */
  mine: { backgroundColor: color.accentSoft },
  /** Coach. Neutral white card; the soft rule keeps its edge on cream. */
  theirs: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
  },
  body: { ...text.base, color: color.ink },
});

export default ChatBubble;
