/**
 * Alerts — the design study's Alerts screen, ported.
 *
 * Everything the athlete's server has flagged, on one pushed screen instead of
 * folded into the bottom of Home. The rows themselves are `Notifications`, the
 * component Home already uses, so the two surfaces cannot say the same thing in
 * two different voices.
 *
 * ── WHAT THE DESIGN ASKED FOR AND DID NOT GET ──────────────────────────────
 *
 * 1. A 9px CIRCLE WHOSE ONLY VARIABLE IS COLOUR — red / amber / grey. That is
 *    the one thing § Status and advisory rules out by name: "Shape carries the
 *    meaning so the states survive colour-blindness, glare, and greyscale",
 *    colour last. In greyscale the design's three severities are one dot.
 *    `StatusDot` draws four marks that differ by FILL TOPOLOGY, and
 *    `Notifications` already owns the severity → shape mapping (`info` →
 *    `clear`, `warning` → `watch`, `critical` → `unusual`). Reusing that
 *    component is how this screen inherits the mapping rather than re-deciding
 *    it a second time, three files away, where the two could drift.
 *
 * 2. THE DESIGN'S `ALERTS` ARRAY IS MOCK DATA — six invented sentences about an
 *    invented athlete. Ported literally they would be fabricated health
 *    observations shown to a real one. The rows here come from
 *    `profile.notifications`, written by the engine
 *    (website/src/lib/engine.ts:586), and nothing on this screen composes a
 *    sentence about the athlete's body.
 *
 * 3. A TIMESTAMP BESIDE EVERY TITLE, and a title above every body. The server's
 *    `Notification` is `{ type, text, severity }` — there is no time on it and
 *    no title. Deriving either would be inventing data, and non-negotiable #2
 *    forbids a component deriving a date at all: dates arrive pre-formatted or
 *    they do not arrive. So each alert is the one sentence the server actually
 *    sent.
 *
 * 4. CARDS THAT LOOK TAPPABLE AND DO NOTHING. The design gives each alert card
 *    a press style with no handler. There is nowhere for an alert to lead — a
 *    notification has no id and no detail record — so the rows here are inert
 *    and carry no press affordance at all, which is the same rule
 *    `components/List.tsx` states for a row with no `onPress`.
 *
 * 5. ONE CARD PER ALERT, stacked 10 apart with no separators. `Notifications`
 *    draws one card with hairline-divided rows instead, and it ships as it is.
 *    Rebuilding the row here to get the stacked form would mean a second
 *    component rendering the server's severities, and the mapping it carries —
 *    severity → shape, `critical` topping out at `unusual`, body weight, no
 *    red — is the most load-bearing thing on this screen. Two copies of it is
 *    how one of them ends up with a red dot. If the stacked form is wanted it
 *    belongs inside `Notifications`, where Home gets it too.
 *
 * ── AN EMPTY LIST RENDERS NOTHING ──────────────────────────────────────────
 *
 * Not "All clear", not "No alerts", not a tick. `Notifications` returns null and
 * this screen adds nothing in its place: zero notifications means nothing
 * tripped a threshold, which is not a statement that the athlete is fine, and
 * non-negotiable #4 is exactly the rule against letting a blank read as a
 * healthy value.
 *
 * That is also why the LOADING and FAILED states say so out loud. A blank
 * cannot be allowed to stand in for "we have not asked yet" or "we asked and
 * the request failed" when the same blank is what "nothing tripped" looks like.
 * The footnote below is the only thing that renders in every state.
 */
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import { Card } from "../components/Card";
import { Notifications } from "../components/Notifications";
import { useProfile } from "../lib/profileStore";
import { useScreenHeader } from "../theme/header";
import { dim } from "../theme/press";
import { color } from "../theme/tokens";
import { layout, radius, space, target } from "../theme/space";
import { text } from "../theme/type";

/**
 * The best line in the design, ported verbatim. It is the screen's whole
 * position — non-negotiable #5 in one sentence, said to the athlete rather than
 * to the developer — and it is the reason a screen this close to being an alert
 * feed is allowed to exist at all.
 */
const FOOTNOTE =
  "Alerts describe what was observed. They never tell you to stop, rest or see anyone — your coach decides that.";

export default function AlertsScreen() {
  /* Shared `/me`, and with it the single 401 path: a revoked token ends the
     session from inside the store rather than from a catch block here. */
  const { profile, state, refresh } = useProfile();

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={useScreenHeader("Alerts")} />

      <ScrollView contentContainerStyle={styles.page}>
        {/* The subtitle, in the CONTENT rather than in the bar —
            `useScreenHeader` draws one line and offers no second one, and
            settings.tsx and connect.tsx already open this way. */}
        <Text style={styles.lede}>What changed, and why it was flagged</Text>

        {state === "failed" && !profile ? (
          <Card>
            <Text style={styles.failed}>Your alerts could not be loaded.</Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your alerts again"
              style={({ pressed }) => [styles.retry, dim(pressed)]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        ) : !profile ? (
          /* Said, not drawn. A skeleton card would reserve room for an alert
             that may not exist, which is a placeholder claiming there is
             something to place. */
          <Text style={styles.checking}>Checking for alerts…</Text>
        ) : (
          /* One card of rows, not one card per alert — see (5) above.
             Renders nothing at all when there is nothing. */
          <Notifications items={profile.notifications} />
        )}

        <Text style={styles.footnote}>{FOOTNOTE}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },

  /**
   * The page metrics, same as every other screen.
   *
   * This used to spend `space.lg` and `space.md` on the argument that the
   * design "insets this screen's cards further out than its list screens". It
   * does not — Alerts is `padding:14px 16px 0` (`:882`), byte-identical to
   * Settings, Profile, the run detail and the plan day. Alerts was simply the
   * one pushed screen that had drifted 4px narrower than its siblings, and the
   * comment had been written to justify the drift rather than to describe the
   * design. `layout` now carries the design's own 14 / 16 / 20.
   *
   * `gap` is the design's 10 between stacked cards, at `space.md`. With the
   * alerts rendering as a single card — see (5) above — it is the space
   * between the lede, the card and the footnote.
   */
  page: {
    paddingHorizontal: layout.page,
    paddingTop: layout.pageTop,
    paddingBottom: layout.pageBottom,
    gap: space.md,
  },

  lede: { ...text.base, color: color.ink2 },

  /** Neither a value nor an absence: a sentence about the request. */
  checking: { ...text.meta, color: color.muted },

  failed: { ...text.base, color: color.ink2 },
  retry: {
    marginTop: space.xl,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },

  /**
   * The design sets this at 12.5/1.5. There is no 12.5 role: the app's scale is
   * one step larger than a normal mobile app throughout, and `text.meta` (14)
   * is its secondary-prose rank. `space.xs` of horizontal inset is the design's
   * 4, and the same value `Section` hangs its label at, so the footnote lines
   * up just inside the card's corner rather than flush with the page edge.
   */
  footnote: {
    ...text.meta,
    color: color.muted,
    paddingHorizontal: space.xs,
  },
});
