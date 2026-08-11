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
import { getChat, postChat } from "../lib/api";
import type { ChatMessage } from "../lib/types";
import { color, shadow } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

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

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
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

  useEffect(() => {
    let alive = true;
    getChat()
      .then((history) => {
        if (alive && !sendStarted.current) setMessages(history);
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const send = useCallback(async () => {
    const q = draft.trim();
    if (!q || pending) return;
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
    } catch {
      // Nothing was said to anyone, so nothing should look said: drop the
      // optimistic row and hand the words back to the composer.
      setMessages((prev) => (prev ?? []).filter((m) => m !== mine));
      setDraft(q);
      setSendFailed(true);
    } finally {
      setPending(false);
    }
  }, [draft, pending]);

  const canSend = draft.trim().length > 0 && !pending;

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
          The failure sits ABOVE the list rather than replacing it. The composer
          stays live either way, and a message sent after a failed load must be
          on screen: if it trips an intercept the reply is fetched and logged
          server-side, so it can never be shown to nobody.
        */}
        {loadFailed ? (
          <View style={styles.loadFailed}>
            <Panel title="Earlier messages" note="Could not load">
              <Text style={styles.plain}>
                Anything you send now will still appear here.
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
            messages === null ? null : (
              <Panel title="Ask your coach" note="Nothing sent yet">
                <Text style={styles.plain}>
                  Ask about a run, a workout, or how you have been feeling.
                </Text>
              </Panel>
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
          {sendFailed ? (
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
              onPress={send}
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
