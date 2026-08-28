/**
 * What a control does while your thumb is on it. One answer, everywhere.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * An audit found 29 tappables in this app with NO pressed state at all —
 * including `chat.tsx`'s Send button, the app's other primary submit, and all
 * five "Try again" retries. Meanwhile `duration.state` (140ms) had sat in the
 * token file since the beginning with no call site.
 *
 * A control that does not acknowledge a tap is the single cheapest way for an
 * app to feel broken: the user cannot tell whether the tap registered, so they
 * tap again. On the retries that means two requests.
 *
 * ── WHY THESE PARTICULAR VALUES ─────────────────────────────────────────────
 *
 * From the Claude Design "Mobile app discrepancy" study, which restated the web
 * app as a native one. It draws a distinction worth keeping:
 *
 *   .row:active      { background: var(--press) }   120ms linear
 *   .pressable:active{ opacity: .55 }               120ms
 *
 * A ROW flashes a fill across its whole width, because a list row is a surface
 * and dimming it would dim its content. A BUTTON dims, because it is an object
 * and its fill is its identity. Using one for the other is most of what makes a
 * hand-rolled list feel unlike a native one.
 *
 * `duration.state` (140) is the app's own token and is close enough to the
 * design's 120 that inventing a second constant would be worse than the 20ms —
 * `app/CLAUDE.md` is explicit that the theme is the single source.
 *
 * ── HOW TO USE ──────────────────────────────────────────────────────────────
 *
 *     <Pressable style={rowPress}>…</Pressable>
 *     <Pressable style={({ pressed }) => [styles.button, dim(pressed)]}>…</Pressable>
 *
 * Both are style FUNCTIONS or plain objects, so they compose with a caller's own
 * styles and never fight them.
 *
 * NOT for: the ember primary buttons, which drop their gradient to reveal the
 * flat `brandStrong` ground beneath (see `login.tsx`, `welcome.tsx`) — that is a
 * richer signal and already consistent across the four screens that use it.
 * And not for the InfoDot dismiss scrim or the chart scrub overlay, which are
 * invisible by design and correctly have no feedback.
 */
import type { StyleProp, ViewStyle } from "react-native";

import { color } from "./tokens";

/**
 * A list row: flashes the system fill across the full width.
 *
 * Pass directly as `style` — `Pressable` calls it with the pressed state.
 */
export function rowPress({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> {
  return pressed ? { backgroundColor: color.press } : null;
}

/**
 * A button or a link: dims.
 *
 * `0.55` is the design's value, and it is deliberately deep — an iOS control
 * dims hard and briefly rather than fading politely, which is what makes the
 * feedback readable at arm's length in daylight.
 */
export const PRESSED_OPACITY = 0.55;

export function dim(pressed: boolean): StyleProp<ViewStyle> {
  return pressed ? { opacity: PRESSED_OPACITY } : null;
}
