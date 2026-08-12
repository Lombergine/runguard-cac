/**
 * The coach chat. A STACK route, not a tab — the tab bar has four items and
 * this is not one of them; it is reached from the home screen.
 *
 * The whole point of this screen is the branch in `Row` below. The server tags
 * a safety-intercepted exchange on BOTH rows (`engine = 'safety:<id>'` in
 * `website/src/lib/chat.ts`, surfaced as `safety: boolean` by GET /api/chat),
 * and `lib/api` carries that through to `ChatMessage.safety`. A flagged message
 * returns `SafetyNotice` before `ChatBubble` is ever constructed — see
 * visual-spec non-negotiable #1. That branch is not a convention: `ChatBubble`
 * takes a branded string that only `bubbleText()` can mint, and it mints
 * nothing for a flagged row.
 *
 * Because `SafetyNotice` is full-bleed, the list itself carries NO horizontal
 * inset; the bubble rows carry their own. Adding padding to the list would put
 * the safety rule in from the edge and start it looking like a card.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { ChatBubble, bubbleText } from "../components/ChatBubble";
import { SafetyNotice } from "../components/SafetyNotice";
import { getChat, isUnauthorized, postChat } from "../lib/api";
import { useSession } from "../lib/session";
import type { ChatMessage } from "../lib/types";
import { color, shadow } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * The website's five openers, ported verbatim from
 * `website/src/components/athlete/widgets.tsx:361-367`.
 *
 * Checked against `website/src/lib/safety.ts`: none of the five matches a tier-1
 * pattern (CRISIS, PURGE, DRUGS), so none of them makes the app suggest a
 * question that answers itself with a crisis referral. The first one is
 * symptom-shaped (`legs` + `sore`), so it may come back as the tier-2 symptom
 * escalation — that is a normal reply, tagged `engine = 'rules'`, and it stays a
 * bubble. Re-check this list against `safetyIntercept()` if it is ever edited.
 */
const SUGGESTED = [
  "Should I run today, my legs are really sore?",
  "How do I run a faster 800m?",
  "Am I on track to break 5 minutes in the mile?",
  "What should I do the day before my race?",
  "Why is my pace getting slower even though I'm training more?",
] as const;

/**
 * The one place a message becomes a component. `bubbleText` is the only thing
 * that can mint the branded string `ChatBubble` accepts, and it refuses a
 * flagged message — so the null check below IS the safety branch, and a row
 * that fails it has no way to reach the bubble renderer.
 */
function Row({ message }: { message: ChatMessage }) {
  const body = bubbleText(message);
  if (body === null) return <SafetyNotice text={message.text} />;
  return (
    <View style={styles.bubbleRow}>
      <ChatBubble role={message.role} text={body} />
    </View>
  );
}

/**
 * The website's Panel hierarchy (`website/src/components/athlete/tabs.tsx:22`):
 * a semibold title on the LEFT, an optional muted note on the RIGHT, then the
 * content. Used for the two things on this screen that are the app talking
 * about the thread rather than in it.
 *
 * Note that neither of these is a message, so neither may look like one — and
 * neither may look like `SafetyNotice` either. A rounded, inset, shadowed card
 * is the correct third shape: it is plainly furniture.
 */
function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {note ? <Text style={styles.panelNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The five openers, as controls.
 *
 * `onPick` IS `send` — the same function the Send button calls, with the same
 * signature. A suggested prompt is therefore not a special kind of message: it
 * gets the same `postChat` call, the same optimistic row, the same retag when
 * the reply comes back `safety: true`, the same drop-and-restore on failure and
 * the same `Row` on the way back. There is no second path to add a message to
 * this screen, and nothing here can put a reply on screen without `bubbleText`
 * being asked first.
 *
 * Shape: full-width, sunken, control radius, no shadow, left-aligned — nothing a
 * `ChatBubble` has (84% width, a side, card radius, elevation) and nothing
 * `SafetyNotice` has. Five sentences in boxes must not read as a transcript, so
 * the micro-label above says what they are. No ember: the composer's Send button
 * is the one accent on this screen, and a row of glowing prompts would make the
 * app the one with something to say.
 */
function Suggestions({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (q: string) => void;
}) {
  return (
    <View style={styles.suggestions}>
      {/*
        Non-negotiable #5: options, not instructions. Descriptive — "Some things
        people ask", not "Try asking" — so the row reads as examples of what this
        is for rather than a list of things the app wants from the athlete.
      */}
      <Text style={styles.suggestLabel}>Some things people ask</Text>
      {SUGGESTED.map((q) => (
        <Pressable
          key={q}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          onPress={() => onPick(q)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Ask ${q}`}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.chipLabel}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const { signOut } = useSession();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * A 401 is not a load failure and not a blip — the token is gone, so no send
   * from this screen can ever land. Held locally as well as handed to
   * `signOut()` because the gate flips a tick later: until the authed group
   * unmounts, this flag is what stops the composer inviting a send that is
   * already impossible.
   */
  const [signedOut, setSignedOut] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  /**
   * The composer is live while the mount fetch is still in flight, so a send
   * can start before the history lands. Once it has, the history result is
   * DISCARDED rather than merged: `setMessages(history)` would replace the
   * whole array and take an already-rendered SafetyNotice and the athlete's
   * flagged turn off the screen, and landing between send and reply would
   * break the `m === mine` identity match so that turn is never reclassified.
   *
   * Discard rather than merge because the two lists cannot be reconciled
   * safely — POST persists both rows server-side, so a history fetch that
   * resolves late may or may not already contain the turn we are holding
   * optimistically, and prepending it risks showing the crisis exchange twice.
   * Losing older history until the next visit is the cheaper failure.
   */
  const sendStarted = useRef(false);
  /**
   * True once a history fetch has resolved with messages that were then
   * DISCARDED by the rule above. The list is empty but the THREAD IS NOT, so
   * the empty state's "Nothing sent yet" would be a statement about this
   * athlete that is false — an absence of loaded data reading as a known zero.
   *
   * It is reachable: send before the mount fetch lands, the history is
   * discarded, then the send fails and its optimistic row is dropped, leaving
   * `[]`. `loadFailed` already suppresses the empty state for the same reason;
   * this is the case it does not cover, because here the fetch SUCCEEDED.
   */
  const [historyDiscarded, setHistoryDiscarded] = useState(false);

  /**
   * The single response to a 401, from either request. `signOut()` is the only
   * sanctioned way out and it fails closed, so nothing here waits on it or
   * branches on the result: the local flag has already made the composer honest.
   */
  const endSession = useCallback(() => {
    setSignedOut(true);
    void signOut();
  }, [signOut]);

  useEffect(() => {
    let alive = true;
    getChat()
      .then((history) => {
        if (!alive) return;
        if (sendStarted.current) {
          if (history.length > 0) setHistoryDiscarded(true);
          return;
        }
        setMessages(history);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (isUnauthorized(err)) return endSession();
        setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [endSession]);

  /**
   * Takes the text rather than reading `draft`, so a suggested prompt is the
   * same call with a different argument instead of a second sender. Everything
   * below — the optimistic row, the retag, the restore, the 401 — is therefore
   * identical for both, and there is no branch anywhere on where `q` came from.
   *
   * `setDraft("")` and the restore are safe for a chip because the chips only
   * render while the composer is empty (see the call site): there is never a
   * half-typed sentence for a chip to clear.
   */
  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || pending || signedOut) return;
    sendStarted.current = true;
    // Held by reference so the two setState callbacks below can find this exact
    // row again after other updates have landed.
    const mine: ChatMessage = { role: "user", text: q, safety: false };
    setDraft("");
    setSendFailed(false);
    setPending(true);
    setMessages((prev) => [...(prev ?? []), mine]);
    try {
      const reply = await postChat(q);
      setMessages((prev) => [
        // A safety intercept tags the athlete's own turn too, so the message
        // that prompted it moves out of the bubble renderer as well.
        ...(prev ?? []).map((m) => (m === mine && reply.safety ? { ...m, safety: true } : m)),
        reply,
      ]);
    } catch (err: unknown) {
      // Nothing was said to anyone, so nothing should look said: drop the
      // optimistic row and hand the words back to the composer.
      setMessages((prev) => (prev ?? []).filter((m) => m !== mine));
      setDraft(q);
      // "Try again" would be a lie on a 401 — there is nothing to retry with.
      if (isUnauthorized(err)) endSession();
      else setSendFailed(true);
    } finally {
      setPending(false);
    }
  }, [pending, signedOut, endSession]);

  /** Anything at all can be sent — the composer just also needs some words. */
  const canSendAnything = !pending && !signedOut;
  const canSend = draft.trim().length > 0 && canSendAnything;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Coach",
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.ink,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: text.title.fontFamily,
            fontSize: text.title.fontSize,
          },
        }}
      />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/*
          The failure sits ABOVE the list rather than replacing it, in both
          cases: a message that DID send must stay on screen — if it tripped an
          intercept the reply was fetched and logged server-side, so it can
          never be shown to nobody.

          What differs is whether sending is still possible. A transport failure
          is a blip and the composer stays live; a 401 is the end of the session
          and the composer is off, because inviting a send that cannot land is
          how someone types a crisis message into a box that will erase it.
          The copy has to match, and neither line may promise more than that.
        */}
        {signedOut ? (
          <View style={styles.loadFailed}>
            <Panel title="Coach chat" note="Signed out">
              <Text style={styles.plain}>
                This device is no longer signed in, so nothing can be sent from
                here. Sign in again to reach your coach.
              </Text>
            </Panel>
          </View>
        ) : loadFailed ? (
          <View style={styles.loadFailed}>
            <Panel title="Earlier messages" note="Could not load">
              <Text style={styles.plain}>
                Earlier messages will be back when the connection is. You can
                still send one now — it stays on screen only if it sends.
              </Text>
            </Panel>
          </View>
        ) : null}
        <FlatList<ChatMessage>
          ref={list}
          // Oldest first, so the newest sits at the bottom next to the
          // composer. The rows have no server id and the list only ever
          // appends (or drops the row it just appended), so the index is a
          // stable identity for as long as a row is on screen.
          data={messages ?? []}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <Row message={item} />}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            // Nothing to say while the first load is still in flight, and
            // nothing to say when it failed — the notice above covers that.
            // Nothing to say either when the thread is known to be non-empty
            // and we simply are not holding it: an empty list is not a fact
            // about the athlete, and "Nothing sent yet" would assert one.
            messages === null || historyDiscarded ? null : (
              <View style={styles.opener}>
                <Panel title="Ask your coach" note="Nothing sent yet">
                  <Text style={styles.plain}>
                    Ask about a run, a workout, or how you have been feeling.
                  </Text>
                </Panel>
                {/*
                  The chips live HERE, in the empty state, and nowhere else —
                  they are an opener, not a permanent rail. Three reasons, in
                  order of weight:

                  1. Safety. Once a conversation exists, a persistent chip row
                     sits under the LAST thing said. After an intercept that is
                     directly beneath a SafetyNotice, and a tappable "How do I
                     run a faster 800m?" one line below a crisis referral makes
                     the app look like it is moving the conversation on. The
                     website can afford the row because its transcript is a
                     520px panel the composer never covers; a phone cannot.
                  2. Non-negotiable #5 — options, not instructions. Suggestions
                     that reappear after every reply stop reading as examples
                     and start reading as the app prompting for the next line.
                  3. Room. With the keyboard up at 360×640 the chips would
                     either eat the transcript or ride above the composer as a
                     second control competing with Send.

                  Also gated on an empty composer: the athlete's own half-typed
                  sentence outranks any suggestion of ours, and hiding the chips
                  is what makes `send`'s single `setDraft("")` safe for both
                  callers.
                */}
                {draft.trim().length === 0 ? (
                  <Suggestions disabled={!canSendAnything} onPick={send} />
                ) : null}
              </View>
            )
          }
          ListFooterComponent={
            pending ? (
              <View style={styles.bubbleRow}>
                <Text style={styles.pending}>Writing a reply…</Text>
              </View>
            ) : null
          }
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        />

        <View style={styles.composer}>
          {/* "Try again" is only true while trying again is possible. */}
          {sendFailed && !signedOut ? (
            <Text style={styles.sendFailed}>That did not send. Try again.</Text>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask a question"
              placeholderTextColor={color.muted}
              multiline
              accessibilityLabel="Message"
            />
            <Pressable
              style={styles.send}
              // Wrapped, not passed by reference: `send` now takes the text,
              // and Pressable would hand it a gesture event.
              onPress={() => send(draft)}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
            >
              {canSend ? (
                // The ember signature, 135° as on the web. The label is `ink`,
                // NOT `brandText`: measured on the gradient's darkest stop
                // (#F97316) ink is 5.97:1 and brandText only 1.86:1.
                <LinearGradient
                  colors={color.ember}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendFill}
                >
                  <Text style={styles.sendLabel}>Send</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.sendFill, styles.sendOff]}>
                  <Text style={styles.sendLabelOff}>Send</Text>
                </View>
              )}
            </Pressable>
          </View>
          {/*
            Who reads this. A privacy disclosure to a teenager about their own
            words, so it is permanent by construction: it sits in the composer
            block, which is pinned above the keyboard and never scrolls, it is
            not conditional on anything, and there is nothing to dismiss. It is
            deliberately NOT in the empty state — that is the exact bug the
            website fixed, where the note lived inside `msgs.length === 0` and
            vanished forever after the first message.

            The wording is the corrected one from
            `website/src/components/athlete/widgets.tsx:538-544`, not the panel
            note at `tabs.tsx:750` that still says "coach sees a summary".
            Verified against the query the coach's screen actually runs
            (`website/src/lib/profile.ts:189-192`): `SELECT text … role = 'user'
            … ORDER BY id DESC LIMIT 5`, rendered one line per row in quotes at
            `dashboard/athlete/[id]/page.tsx:330-337`. Last 5 — true. The
            athlete's own messages, not the replies — true, "your messages".
            Verbatim, never summarised — true. It is `ink2` and not `muted`
            because fine print is the wrong register for this sentence.
          */}
          <Text style={styles.coachNote}>
            Your coach can read your last 5 messages here, word for word.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  /** No horizontal inset — SafetyNotice is full-bleed. */
  list: { paddingVertical: space.xl },
  bubbleRow: { paddingHorizontal: layout.page },
  separator: { height: space.md },
  loadFailed: { paddingTop: space.xl },
  /** Panel: title left, note right, content under. */
  panel: {
    marginHorizontal: layout.page,
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    padding: layout.cardPadding,
    gap: space.sm,
    ...shadow.card,
  },
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  panelTitle: { ...text.meta, fontFamily: font.bodySemi, color: color.ink },
  /** The caveat. Always the right-hand side, always muted (5.16:1 on card). */
  panelNote: { ...text.meta, color: color.muted },
  plain: { ...text.base, color: color.ink2 },
  /** The empty state: the panel, then the openers under it. */
  opener: { gap: space.xl },
  /**
   * The chips carry the page inset themselves — the list has none, because
   * SafetyNotice is full-bleed.
   */
  suggestions: { paddingHorizontal: layout.page, gap: target.gap },
  suggestLabel: { ...text.micro, color: color.muted, marginBottom: space.xs },
  /**
   * A control, not a bubble and not a notice: full width (no side), sunken,
   * `radius.control` rather than the card radius a bubble uses, no shadow.
   */
  chip: {
    minHeight: target.min,
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /** Pressed state matches the check-in answers: a soft ember wash, no fill. */
  chipPressed: { backgroundColor: color.accentSoft },
  chipLabel: { ...text.meta, color: color.ink2 },
  coachNote: { ...text.meta, color: color.ink2 },
  /** Quiet and inline: no overlay, no spinner, no animation. */
  pending: { ...text.meta, color: color.muted },
  composer: {
    borderTopWidth: ruleWidth,
    borderTopColor: color.rule,
    backgroundColor: color.card,
    paddingHorizontal: layout.page,
    paddingVertical: space.md,
    gap: space.sm,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: target.gap },
  input: {
    flex: 1,
    ...text.base,
    color: color.ink,
    /** Sunken against the white composer, so the field reads as a field. */
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: target.min,
    maxHeight: target.min * 3,
  },
  /** Clips the gradient to the control radius; the fill carries the padding. */
  send: {
    minWidth: target.min,
    minHeight: target.min,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  sendFill: {
    flex: 1,
    minWidth: target.min,
    minHeight: target.min,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Disabled: no ember at all, so "cannot send" is not a dimmed brand. */
  sendOff: {
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
  },
  sendLabel: { ...text.baseSemi, color: color.ink },
  sendLabelOff: { ...text.baseSemi, color: color.muted },
  sendFailed: { ...text.meta, color: color.ink2 },
});
