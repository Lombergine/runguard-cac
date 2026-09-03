/**
 * The notification list — the website's Home tab, `tabs.tsx:286-302`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THIS IS THE COMPONENT MOST LIKELY TO BREAK NON-NEGOTIABLE #5, SO READ FIRST.
 *
 * The server's severities are literally named `info`, `warning` and `critical`
 * (website/src/lib/engine.ts:586), and the website paints a coloured dot per
 * level. Ported on sight, that is an alert feed — and ../../../docs/visual-spec.md
 * is explicit that this app does not have one:
 *
 *   #5  "Advisory language stays advisory. `clear`/`watch`/`unusual` render in
 *        body weight, lowercase, as description. No alert banners, no warning
 *        triangles, no imperative verbs, no red fill."
 *
 *   § Nothing shouts  "No alert banners, no warning triangles, no red fills, no
 *        badges... The absence of urgency styling is a deliberate position."
 *
 * So the severity is carried by `StatusDot`, whose four marks differ by SHAPE —
 * a filled disc, a half-filled ring, two opposing quadrants, a dashed ring — and
 * survive greyscale with no colour doing the work. The text is body weight on a
 * plain card. There is no fill, no border, no icon, and no red.
 *
 * WHAT THIS COMPONENT CANNOT FIX. The notification strings are written on the
 * server and several of them are imperative — "check your recovery today",
 * "Hydrate, sleep, skip intensity", "rebuild gently to hold fitness"
 * (engine.ts:602-615). The app cannot rewrite them without forking the copy of a
 * surface the athlete may also be reading in a browser. What it CAN do is refuse
 * to amplify them: an imperative in body weight on a white card is a sentence,
 * and the same imperative in a red banner is an order. This file is the
 * difference. See the stage report for the two strings that should be reworded
 * at the source.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * AN EMPTY LIST RENDERS NOTHING — not "All good", not "No alerts", not a tick.
 * Zero notifications means nothing tripped a threshold; it is not a statement
 * that the athlete is fine, and non-negotiable #4 is exactly the rule against
 * letting a blank read as a healthy value. `NextRaceBlock` already sets this
 * precedent: no race renders no block, rather than an empty card.
 */
import { StyleSheet, Text, View } from "react-native";

import { Card } from "./Card";
import { StatusDot } from "./StatusDot";
import type { Flag, Notification } from "../lib/types";
import { ruleWidth, space } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/**
 * Severity → the app's own advisory vocabulary.
 *
 * Not a colour ramp: these are the four `Flag` values the whole app already
 * speaks, and `StatusDot` draws each as a different SHAPE. `critical` maps to
 * `unusual` rather than to anything louder because `unusual` is the loudest
 * thing this app says — the vocabulary tops out deliberately.
 */
const DOT: Record<Notification["severity"], Flag> = {
  info: "clear",
  warning: "watch",
  critical: "unusual",
};

/** What a screen reader hears in place of the shape. */
const SPOKEN: Record<Notification["severity"], string> = {
  info: "Note",
  warning: "Worth watching",
  critical: "Unusual",
};

export function Notifications({ items }: { items: Notification[] | undefined }) {
  // See the header: nothing to say is not a thing to say.
  if (!items || items.length === 0) return null;

  return (
    <Card padded={false}>
      {items.map((n, i) => (
        <View key={`${n.type}-${i}`} style={[styles.row, i > 0 && styles.divided]}>
          <View
            style={styles.dot}
            accessible
            accessibilityRole="image"
            accessibilityLabel={SPOKEN[n.severity]}
          >
            <StatusDot flag={DOT[n.severity]} />
          </View>
          <Text style={styles.body}>{n.text}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.lg,
  },
  /** A hairline between entries, the same rule the race log divides rows with. */
  divided: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  /** Nudged onto the first line's optical centre rather than its box top. */
  dot: { marginTop: space.xs },
  /**
   * `ink2`, not `ink`: these sit under the check-in and today's session, and a
   * notification is context rather than the thing the screen is asking for.
   * Body weight, sentence case, no colour on the type at all — the shape beside
   * it already carries the state, and colouring the sentence too would be the
   * emphasis the spec rules out.
   */
  body: { ...text.meta, color: color.ink2, flex: 1 },
});

export default Notifications;
