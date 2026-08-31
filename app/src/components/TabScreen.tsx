/**
 * The frame every tab renders through — chrome above, the page below.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Because three tabs had already lost their header and nobody noticed.
 *
 * `ScreenHeader` was being mounted inside each screen's state switch, so it was
 * only as reliable as the discipline of whoever wrote the branches. Recovery and
 * Races mounted it in `loading` and `error` and forgot the success branch — the
 * title and all three actions vanished the moment the payload arrived. Home had
 * the mirror of it: no header on the error branch, which also covers a revoked
 * token, so a cold launch with a dead session showed a bare page. Stats mounted
 * it three times and `coach/athlete/[id]` twice; both were correct, and both
 * were one edit from the same bug.
 *
 * `runs.tsx` had already worked this out and said so in a comment — "a header
 * that appears only once the payload lands would make the tab look like it
 * changed identity on arrival". This is that wrapper, lifted, so the rule is
 * structural rather than remembered: a screen hands its states to `children`
 * and CANNOT render one without its chrome.
 *
 * The scroller lives here for the same reason. Recovery, Races, Stats and the
 * coach detail rendered their loading and error states into a plain `View`, so
 * pull-to-refresh was missing in exactly the two states that most want it, and
 * an error message taller than the screen could not be reached.
 *
 * ── SUBTITLES ARE CONSTANTS ─────────────────────────────────────────────────
 *
 * `subtitle` is a prop rather than something a branch computes. Roster passed
 * `roster ? <Text/> : null`, so its header was one line tall while loading and
 * two once data arrived — the bar changed height under the content. A subtitle
 * describes the TAB, which does not change while you wait for it.
 */
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { ScreenHeader, useTabHeaderActions } from "./ScreenHeader";
import { color } from "../theme/tokens";
import { layout } from "../theme/space";

/** Training's warm ground: the top stop fading into the page colour. */
const SUNRISE_STOPS = [color.bgTop, color.bg] as const;
const SUNRISE_HEIGHT = 420;

export type TabScreenProps = {
  title: string;
  /**
   * The line under the title. A NODE, not a string, because a date in one has
   * to arrive pre-formatted rather than be derived here (non-negotiable #2).
   *
   * Pass a constant. See the note at the top of this file.
   */
  subtitle?: ReactNode;
  /** The sunrise ground behind the page. Training's, for now. */
  gradient?: boolean;
  /**
   * Pull-to-refresh. Both or neither — a spinner with no handler is a control
   * that spins and does nothing.
   */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Set `false` when the screen brings its own scroller — a `FlatList`, which
   * must not be nested inside a `ScrollView`. Training does; everything else
   * lets this own it.
   */
  scroll?: boolean;
  children: ReactNode;
};

export function TabScreen({
  title,
  subtitle,
  gradient = false,
  refreshing,
  onRefresh,
  scroll = true,
  children,
}: TabScreenProps) {
  const actions = useTabHeaderActions();

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      /*
       * Both, together, always. Roster had the first and not the second, which
       * is the pairing that eats a tap: with the default
       * `keyboardShouldPersistTaps="never"`, the first press on a button while
       * the keyboard is up is spent dismissing the keyboard and never reaches
       * the button. The athlete presses twice and blames the app.
       *
       * Harmless on the tabs with no text input — there is no keyboard to
       * dismiss and no tap to preserve.
       */
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      /*
       * The other half: the keyboard must not COVER the field being typed in.
       * Races carries two forms with ten inputs between them and had neither
       * this nor a `KeyboardAvoidingView`, so `LogResultForm` — near the bottom
       * of a long page — sat under the keyboard by default.
       *
       * This rather than a `KeyboardAvoidingView` wrapper, which is what the
       * older input screens use: it is one prop instead of a view and a
       * platform check, it insets the scroller the keyboard's actual height
       * rather than guessing, and it costs nothing on the tabs with no inputs.
       */
      automaticallyAdjustKeyboardInsets
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <View style={styles.root}>
      {gradient ? (
        <LinearGradient
          colors={SUNRISE_STOPS}
          style={styles.sunrise}
          pointerEvents="none"
        />
      ) : null}
      {/*
       * `edges={["top"]}` only. The bottom inset belongs to the tab bar, which
       * reserves it in its own height, so spending it here would stack two.
       */}
      <SafeAreaView style={gradient ? styles.safeOverGradient : styles.safe} edges={["top"]}>
        <ScreenHeader title={title} subtitle={subtitle} actions={actions} />
        {body}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  /** Opaque, so the page reads against the ground rather than through it. */
  safe: { flex: 1, backgroundColor: color.bg },
  /** Transparent, so the gradient underneath shows. */
  safeOverGradient: { flex: 1 },
  sunrise: { position: "absolute", top: 0, left: 0, right: 0, height: SUNRISE_HEIGHT },
  /**
   * The design's own page metrics — see `layout` in theme/space.ts. `flexGrow`
   * so a short page (an empty state, an error) still fills the screen and its
   * content does not float against a collapsed scroller.
   */
  page: {
    flexGrow: 1,
    paddingHorizontal: layout.page,
    paddingTop: layout.pageTop,
    paddingBottom: layout.pageBottom,
  },
});

export default TabScreen;
