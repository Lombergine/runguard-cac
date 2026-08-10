/**
 * The coach chat. A STACK route, not a tab — the tab bar has four items and
 * this is not one of them; it is reached from the home screen.
 *
 * The whole point of this screen is the branch in `Row` below. The server tags
 * a safety-intercepted exchange on BOTH rows (`engine = 'safety:<id>'` in
 * `website/src/lib/chat.ts`, surfaced as `safety: boolean` by GET /api/chat),
 * and `lib/api` carries that through to `ChatMessage.safety`. A flagged message
 * returns `SafetyNotice` before `ChatBubble` is ever constructed — see
 * visual-spec non-negotiable #1.
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

import { ChatBubble } from "../components/ChatBubble";
import { SafetyNotice } from "../components/SafetyNotice";
import { getChat, postChat } from "../lib/api";
import type { ChatMessage } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * The one place a message becomes a component. A safety row returns here and
 * never reaches the line below it.
 */
function Row({ message }: { message: ChatMessage }) {
  if (message.safety) return <SafetyNotice text={message.text} />;
  return (
    <View style={styles.bubbleRow}>
      <ChatBubble role={message.role} text={message.text} />
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

  useEffect(() => {
    let alive = true;
    getChat()
      .then((history) => {
        if (alive) setMessages(history);
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
        {loadFailed ? (
          <View style={styles.notice}>
            <Text style={styles.plain}>Your messages could not be loaded.</Text>
          </View>
        ) : (
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
              messages === null ? null : (
                <View style={styles.notice}>
                  <Text style={styles.plain}>
                    No messages yet. Ask about a run, a workout, or how you have been
                    feeling.
                  </Text>
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
        )}

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
              <Text style={canSend ? styles.sendLabel : styles.sendLabelOff}>Send</Text>
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
  notice: { paddingHorizontal: layout.page },
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
    backgroundColor: color.bg,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: target.min,
    maxHeight: target.min * 3,
  },
  send: {
    minWidth: target.min,
    minHeight: target.min,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  sendLabel: { ...text.baseSemi, color: color.accent },
  sendLabelOff: { ...text.baseSemi, color: color.muted },
  sendFailed: { ...text.meta, color: color.ink2 },
});
