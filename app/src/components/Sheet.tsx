/**
 * A sheet you swipe away — what the check-in and the explainers become.
 *
 * Two of the mock's six changes land here: "Check-in → a sheet you swipe away,
 * not a page" and "Hover tooltips → tappable disclosure rows". They are the
 * same move. A phone has no hover, so an explanation has to be somewhere you go
 * and come back from; and a check-in is a thing you finish and dismiss, not a
 * destination you navigate to and then have to find your way out of.
 *
 * ── WHY IT IS NOT A ROUTE ──────────────────────────────────────────────────
 * The check-in used to be part of the Home screen's own layout, which meant
 * finishing it re-laid-out the page underneath the reader. Pushing it onto the
 * navigation stack instead would put it in the back history, so the hardware
 * back gesture would return to it. A modal owns neither problem: the screen
 * behind is undisturbed and still visible at the edges, which is what makes a
 * sheet read as "on top of what I was doing" rather than "somewhere else".
 *
 * ── DISMISSAL IS PLURAL ON PURPOSE ─────────────────────────────────────────
 * The grabber, the backdrop and the hardware back gesture all close it, because
 * a modal with one exit is the shape people get stuck in. `onRequestClose` is
 * what Android's back button and the iOS swipe both route through, so it is
 * wired to the same handler rather than to a second one that could drift.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, space, target } from "../theme/space";

export function Sheet({
  visible,
  onClose,
  title,
  /** A short line under the title. The "what is this" half of a disclosure. */
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      /* Both the Android back button and the iOS swipe-down land here. */
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.backdrop}>
        {/*
          The backdrop dismisses, and it is a sibling of the panel rather than
          its parent — a tap inside the sheet must never bubble out to this.
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <SafeAreaView edges={["bottom"]} style={styles.panel}>
          {/* The grabber. Decorative — the accessible exit is the button. */}
          <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no" />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
            >
              <Text style={styles.doneLabel}>Done</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    /* Dimming the page behind is what makes the sheet read as ON it. */
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panel: {
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.card * 2,
    borderTopRightRadius: radius.card * 2,
    /* Never full height: the strip of page left showing is the thing that says
       "you are still where you were". */
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.ruleStrong,
    marginTop: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.page,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headText: { flex: 1, gap: 2 },
  title: { ...text.title, color: color.ink },
  subtitle: { ...text.meta, color: color.muted },
  done: {
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.control,
  },
  donePressed: { backgroundColor: color.press },
  doneLabel: { ...text.baseSemi, color: color.brandText },
  body: {
    paddingHorizontal: layout.page,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
});

export default Sheet;
