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
 * The bubble geometry — radius, 82% max width, a side — is also what makes
 * `SafetyNotice` legible as NOT a message. Do not lend any of it to that
 * component, and do not take its full-bleed flatness for this one.
 *
 * A safety-intercepted message must never reach this component (visual-spec
 * non-negotiable #1). That is enforced by the TYPE OF THE TEXT and, because a
 * type is erased before anything runs, by a runtime check as well — not by a
 * convention and not by an excess-property check.
 *
 * `text` is a `BubbleText`: not a string at all, but an object carrying the text
 * behind a key nothing else can name. TypeScript will not accept a plain
 * `string` — including `message.text` — where a `BubbleText` is required, so
 * there is no assignment, destructure or spread that produces a valid argument
 * from a `ChatMessage`. (An excess-property check would not do this: `const p:
 * ChatBubbleProps = message` is legal, because a supertype assignment simply
 * ignores the extra `safety` field — but passing that `p` is still rejected.)
 *
 * The only way to mint a `BubbleText` is `bubbleText(message)` below, which
 * returns `null` for a flagged message.
 *
 * ── WHY THE TEXT IS CARRIED IN AN OBJECT, AND WHY THE GUARD IS AN IDENTITY ──
 * It used to be `string & { [brand]: true }`, and that had a hole. The brand
 * type is not exported, but it is still REACHABLE through the mint's signature:
 * `ReturnType` can name a type that was never exported, so "do not export the
 * brand" is not a fence — and a fence made only of types is defeated by any
 * cast, because casts are erased before anything runs. (With the object type
 * that one-step cast no longer even compiles: `string` to `BubbleText` is
 * TS2352. Only `as unknown as` gets through, and it lands on the runtime guard.)
 *
 * So the guarantee is not only a compile-time one. But a runtime guard that asks
 * about the SHAPE of the value — "does it have `carried` on it?" — is still
 * forgeable, and an adversarial review found two ways in that needed no cast at
 * all and so would have type-checked in review:
 *
 *   1. `carried` is an enumerable own symbol of every minted value, so
 *      `Object.getOwnPropertySymbols(bubbleText(anythingClean)!)[0]` hands it
 *      straight over, and `Object.assign({}, minted, { [stolen]: flagged.text })`
 *      is then a perfectly typed `BubbleText` carrying a crisis reply.
 *   2. `new Proxy(minted, { get: () => flagged.text })` keeps the branded type
 *      exactly (`Proxy<T>(...): T`) and intercepts the very property read the
 *      guard performs. ANY fence built on reading a property off the value dies
 *      to this.
 *
 * The guard therefore asks about IDENTITY instead: `bubbleText` records each
 * value it returns in `minted`, a module-private WeakSet, and `ChatBubble`
 * renders only values that are in it. A forged object, a clone, a spread, an
 * `Object.assign` and a Proxy are all distinct object identities, and none of
 * them was ever registered — so all of them render NOTHING. The symbol stays as
 * the carrier and as the compile-time shape; the WeakSet is what cannot be
 * forged, because there is no operation that puts a value into it except calling
 * the mint, and the mint refuses a flagged message.
 *
 * Three fences, deliberately: the type stops the accident at the keyboard, the
 * symbol stops the shape being reconstructed by hand, and the WeakSet stops
 * everything else. A safety reply cannot be bubbled by any incantation, only by
 * editing this file.
 *
 * DO NOT "simplify" this back to `text: string`, and do not replace the
 * `minted.has()` check with a property read. Without them the safety branch is
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
 * Every value the mint has ever returned, held by IDENTITY. Weak so a message
 * scrolled out of the list is still collectable. This is the half nothing
 * outside this module can add to: the symbol can be stolen off a minted value
 * and a Proxy can fake any property read, but neither produces an object that
 * is in here.
 */
const minted = new WeakSet<object>();

/**
 * The single mint. Returns `null` for a safety-tagged message, which is the
 * caller's cue to render `SafetyNotice` instead — there is no second way to
 * obtain the argument `ChatBubble` needs.
 */
export function bubbleText(message: ChatMessage): BubbleText | null {
  if (message.safety) return null;
  // Frozen, because identity alone leaves one hole: a value that IS registered
  // can have its symbol overwritten in place (`(aMintedValue as
  // Record<symbol,string>)[stolen] = flagged.text`), and the guard would then
  // vouch for it honestly, because the identity it checks is genuine.
  // Freezing also makes the Proxy attack throw at the attacker rather than
  // merely fail here, since a get trap may not contradict a non-configurable,
  // non-writable target property.
  const body: BubbleText = Object.freeze({ [carried]: message.text });
  minted.add(body);
  return body;
}

export function ChatBubble({
  role,
  text: body,
}: Omit<ChatBubbleProps, "text"> & { text: BubbleText }) {
  const mine = role === "user";
  // The runtime half of the fence, and it asks about identity rather than
  // shape: only the exact objects `bubbleText` handed out are in `minted`. A
  // cast, a forged object, a clone, a spread and a Proxy wrapping a real one
  // are all different identities, and a message we cannot vouch for is not
  // rendered at all. `has` returns false for a non-object rather than throwing,
  // so a cast string is caught here too. Failing closed is the whole point: the
  // alternative is a safety reply wearing bubble geometry.
  if (!minted.has(body)) return null;
  const body_ = body[carried];
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
    /** The design's measure. It was 84 — set before there was one to match. */
    maxWidth: "82%",
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
