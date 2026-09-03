/**
 * Profile — who the athlete is, what team they are on, what HRmax their
 * training is scored against, and the fact that this phone is the paired
 * device.
 *
 * A STACK route, not a tab. The bar's five items are the daily surfaces and this
 * is not one of them; `chat.tsx` is the precedent for a pushed route with its
 * own header. `settings.tsx` links here.
 *
 * Ported from the website's `ProfileTab`
 * (website/src/components/athlete/tabs.tsx ~:760), with three deliberate
 * departures:
 *
 *  1. THE PAIRING PANEL DOES NOT CROSS. The web shows the device token with a
 *     copy button, because the browser is not the paired device and the token
 *     has to get to the phone somehow. Here the phone IS the paired device, so
 *     there is nothing to copy and everything to lose: the token never expires
 *     and cannot be revoked (lib/auth.ts), so rendering it would put a
 *     permanent credential for a minor's health data on a screen that can be
 *     shoulder-read or screenshotted. This file therefore never reads the
 *     Keychain for display — the token is read only to sign a request, and
 *     `signOut()` erases it without ever holding it — and `lib/api` has already
 *     stripped `athlete.deviceToken` from the payload before it arrives. What
 *     replaces the panel is a statement of fact (paired, or not) and a way out
 *     (Unpair).
 *
 *  2. The school name is shown in full. The web renders
 *     `p.athlete.school.split(" ")[0]` with the full name as a sub-line, which
 *     is a fix for a four-up desktop grid, not a decision about the data.
 *
 *  3. HRmax provenance is the server's SENTENCE (`hrMax.label`), never the
 *     `source` enum the web prints in its panel note. lib/types.ts is explicit
 *     about this: an "age" or "default" figure is an estimate about the athlete
 *     rather than a measurement of them, and the enum is a database value, not
 *     an explanation. `source` is read here only to decide whether "Use
 *     automatic" is offered and whether the estimate caveat is shown.
 */
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import {
  Achievements,
  ConnectedApps,
  InjuryHistory,
  SeasonGoals,
} from "../components/ProfilePanels";
import { MentalChart } from "../components/charts/MentalChart";
import { ApiError, joinTeam, leaveTeam, setHrMax } from "../lib/api";
import { useProfile } from "../lib/profileStore";
import { useSession } from "../lib/session";
import type { Profile } from "../lib/types";
import { color, shadow } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * The one field this screen wants that the server does not send.
 *
 * `athlete.events`, `fitness.tier` and `risk.hrMax` all already exist on
 * `Profile`, so no widening is needed for those. The team's join code is
 * different: `teams.join_code` is surfaced only on the COACH dashboard
 * (website/src/app/dashboard/page.tsx:73), and `buildProfile()` does not put it
 * in the athlete payload at all — so this key is always undefined today and the
 * code line simply does not render. It is declared rather than dropped because
 * turning it on is a one-line server change (`joinCode: team?.join_code ?? null`
 * in website/src/lib/profile.ts:341), and because a fabricated code is worse
 * than an absent one: it would be typed into a form that rejects it.
 */
type AppProfile = Profile & {
  athlete: Profile["athlete"] & { joinCode?: string | null };
};

function explain(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/* ------------------------------------------------------------------ *
 * Furniture
 * ------------------------------------------------------------------ */

/**
 * The website's Panel (website/src/components/athlete/tabs.tsx:22): a 14px
 * semibold title on the LEFT, a 12px muted note on the RIGHT, then the content.
 * The note is the caveat, the unit, or the instruction — never decoration.
 *
 * Same shape as `chat.tsx`'s local Panel. Neither file owns a shared component,
 * so both spell it out from the same tokens.
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
 * One labelled fact in the identity list.
 *
 * A missing value renders as an inline dash in `color.unknown` with "Not
 * recorded" beneath it — the same treatment `Tile` uses, and for the same
 * reason: absence must be distinguishable, not prominent, and four dashed boxes
 * stacked down a profile would make not knowing someone's grade the loudest
 * thing on the screen. It is still never a blank and never a zero.
 *
 * `mono` is not styling: the rule is that every numeral is mono, so a grade is
 * and a school is not.
 */
function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {value === null ? (
        <>
          <Text style={styles.fieldAbsent}>—</Text>
          <Text style={styles.fieldAbsentLabel}>Not recorded</Text>
        </>
      ) : (
        <Text style={[styles.fieldValue, mono && styles.fieldValueMono]}>{value}</Text>
      )}
    </View>
  );
}

/**
 * The ember signature, on the things you tap to commit something.
 *
 * Disabled wears NO ember at all — a sunken `well` ground with a muted label,
 * as in `chat.tsx`. Dimming the gradient instead would make "you cannot do this
 * yet" look like a faded brand rather than an inert control.
 */
function EmberButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <View
        style={[styles.ember, styles.emberOff]}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
      >
        <Text style={styles.emberLabelOff}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={styles.ember}
      onPress={onPress}
      accessibilityRole="button"
    >
      {({ pressed }) => (
        <>
          {/* Pressing drops the gradient to the flat `brandStrong` ground
              underneath, which is also the fallback if the gradient never
              draws — either way the label keeps a real background. */}
          {pressed ? null : (
            <LinearGradient
              colors={color.ember}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {/* INK on the ember, never white and never `brandText`: here the
              ember is the ground, not the glyph. */}
          <Text style={styles.emberLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A bordered, unfilled control. Leaving, clearing, unpairing. */
function QuietButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={styles.quiet}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text style={styles.quietLabel}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Team
 * ------------------------------------------------------------------ */

/**
 * Join by code, or leave. Both verbs are the same route
 * (`/api/athlete/join-team`, POST and DELETE), and both accept the Bearer
 * token, so the app calls them directly.
 *
 * The web finishes each with `router.refresh()`, which re-runs the server
 * component. There is no equivalent here: membership changes what `/me` returns
 * for `teamName`, so the screen invalidates the shared profile instead. Until
 * that refetch lands the panel stays in its old state rather than optimistically
 * claiming a team — `setAthleteTeam` is the server's write, and this screen does
 * not know it happened until the server says so.
 */
function TeamPanel({
  athlete,
  onChanged,
}: {
  athlete: AppProfile["athlete"];
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function join() {
    const entered = code.trim();
    if (!entered || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await joinTeam(entered);
      setCode("");
      onChanged();
    } catch (err) {
      setProblem(explain(err, "Could not join that team."));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await leaveTeam();
      onChanged();
    } catch (err) {
      setProblem(explain(err, "Could not leave that team."));
    } finally {
      setBusy(false);
    }
  }

  if (athlete.teamName) {
    return (
      <Panel title="Team" note="Your coach can see your training">
        <Text style={styles.body}>
          You are on <Text style={styles.bodyStrong}>{athlete.teamName}</Text>.
        </Text>
        {/* Only renders once the server sends it — see AppProfile. */}
        {athlete.joinCode ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Join code</Text>
            <Text style={styles.codeValue}>{athlete.joinCode}</Text>
          </View>
        ) : null}
        <QuietButton
          label={busy ? "Leaving…" : "Leave team"}
          onPress={leave}
          disabled={busy}
        />
        {problem ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel title="Team" note="You are solo">
      <Text style={styles.body}>
        Nobody is coaching you here yet. If a coach gave you a team code, enter it and
        you will show up on their roster.
      </Text>
      <TextInput
        style={styles.codeInput}
        value={code}
        // Uppercased on every keystroke as well as by the keyboard: the
        // keyboard hint is a suggestion, and a pasted code bypasses it
        // entirely. `getTeamByCode` compares case-insensitively, so this is
        // for the athlete reading back what they typed, not for the server.
        onChangeText={(t) => setCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        editable={!busy}
        placeholder="TEAM CODE"
        placeholderTextColor={color.muted}
        accessibilityLabel="Team code"
      />
      <EmberButton
        label={busy ? "Joining…" : "Join team"}
        onPress={join}
        disabled={busy || code.trim().length === 0}
      />
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Max heart rate
 * ------------------------------------------------------------------ */

/**
 * The number every run's intensity is scored against.
 *
 * There is no manual-entry control here any more: `health.ts` now requests the
 * live HeartRate HealthKit scope and `readSince()` computes a real peak per
 * workout, so `hrmax.ts`'s `detected` resolution (an athlete's own workout
 * history) is a better source than a figure typed once and never revisited.
 * The one write this panel still offers is `send(null)` — reverting a
 * previously-entered manual/calibrated value back to automatic — because a
 * number an athlete already set stays authoritative (`resolveHrMax` prefers a
 * stored choice over anything detected) until they choose to let it go.
 */
function HrMaxPanel({
  hrMax,
  onChanged,
}: {
  hrMax: AppProfile["risk"]["hrMax"];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function useAutomatic() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await setHrMax(null);
      onChanged();
    } catch (err) {
      setProblem(explain(err, "Could not save that."));
    } finally {
      setBusy(false);
    }
  }

  if (!hrMax) {
    return (
      <Panel title="Max heart rate" note="Every run's intensity is scored against this">
        <Field label="Current" value={null} />
      </Panel>
    );
  }

  // The enum decides what is OFFERED; it is never printed. `label` is the
  // server's sentence about where the number came from, and it is the only
  // provenance the athlete reads.
  const isSet = hrMax.source === "manual" || hrMax.source === "calibrated";
  const isEstimate = hrMax.source === "age" || hrMax.source === "default";

  return (
    <Panel title="Max heart rate" note={hrMax.label}>
      {/* One text node — the unit is welded to the numeral, never adjacent. */}
      <Text style={styles.hrValue}>{`${hrMax.value} bpm`}</Text>
      {isEstimate ? (
        <Text style={styles.body}>
          This is an estimate, not something measured on you. It updates on its own once
          enough workouts have synced from Apple Health — every run&apos;s intensity, your
          training load and your workload ratio are all scored against it.
        </Text>
      ) : isSet ? (
        <Text style={styles.body}>
          Every run&apos;s intensity is scored against this number, so it feeds your
          training load and your workload ratio.
        </Text>
      ) : (
        <Text style={styles.body}>
          Read from your own workout history in Apple Health, and it feeds your training
          load and your workload ratio.
        </Text>
      )}
      {isSet ? (
        <QuietButton
          label={busy ? "Saving…" : "Use automatic"}
          onPress={useAutomatic}
          disabled={busy}
        />
      ) : null}
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * This device
 * ------------------------------------------------------------------ */

/**
 * What the web's "Pair the RunGuard iPhone app" panel becomes on the phone
 * itself: a statement, not a credential. See the file header.
 *
 * The statement is CONDITIONAL on `useSession()`, which is the only thing in the
 * app that knows. It used to read "Paired" unconditionally, so a phone with no
 * token was told it was paired directly beneath the panel that had just said it
 * was not. Note that "in" means the keychain holds a pairing, not that the
 * server accepts it — a rejected token is still a token, and a device holding
 * one is exactly the device that needs the control below, so this renders
 * whether or not the profile loaded.
 *
 * Unpairing is confirmed because it is not reversible from here — the token
 * cannot be re-derived on the device, so getting back in means fetching it from
 * the web app again, which an athlete standing on a track at 6am cannot do.
 *
 * It goes through `signOut()` rather than deleting the key itself: that clears
 * every stored key rather than the token alone, and it FAILS CLOSED — the gate
 * shuts even when the keychain refuses, so nobody is left looking at athlete
 * data after asking to leave. The old path did the opposite, swallowing the
 * rejection and routing to `/pair` with the token still on the device.
 *
 * `erased: false` is surfaced in an Alert rather than inline: closing the gate
 * unmounts this entire screen on the very next render, so a message rendered
 * here would never be read.
 */
function DevicePanel() {
  const { status, signOut } = useSession();

  function confirm() {
    Alert.alert(
      "Unpair this device?",
      "RunGuard will stop showing your training here until you pair it again with the token from the web app.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const { erased } = await signOut();
              if (erased) return;
              Alert.alert(
                "This device is still paired",
                "This phone's keychain would not release the pairing, so nothing changed — this device is still paired, and it will sign back in the next time the app starts. Try again once the phone is unlocked."
              );
            })();
          },
        },
      ]
    );
  }

  if (status !== "in") {
    return (
      <Panel title="This device" note={status === "out" ? "Not paired" : "Checking"}>
        <Text style={styles.body}>
          {status === "out"
            ? "This phone isn't paired to a RunGuard account, so nothing is syncing from it and there is no pairing here to remove."
            : "Checking whether this phone is paired."}
        </Text>
      </Panel>
    );
  }

  return (
    <Panel title="This device" note="Paired">
      <Text style={styles.body}>
        This phone is paired to your RunGuard account and syncs on its own. The pairing
        token is held in this device&apos;s keychain and is never shown.
      </Text>
      <QuietButton label="Unpair this device" onPress={confirm} />
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export default function ProfileScreen() {
  /**
   * The shared `/me` (lib/profileStore). It is the only endpoint carrying
   * `events`, `fitness.tier` and `risk.hrMax`, and it is 57 KB — a cost the
   * whole app now pays once rather than once per screen. Every write below
   * finishes with `invalidate()`, which refetches it in place: the panels keep
   * their old values until the server says what the new ones are.
   *
   * There is no "unpaired" branch any more. A 401 signs out from inside the
   * store and the gate unmounts this screen, so the only failure that can reach
   * the render below is a transport one.
   */
  const { profile: shared, state, refreshing, refresh, invalidate } = useProfile();
  /** The join code the server does not send yet — see AppProfile. */
  const profile: AppProfile | null = shared;
  const failed = state === "failed";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Profile",
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
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
        >
          {/* One quiet line, and nothing else changes: the panels below are
              still showing what the server last said, which is still true. */}
          {failed && profile ? (
            <Text style={styles.stale}>
              Could not reach your server just now. This is your profile as it was
              last loaded.
            </Text>
          ) : null}

          {profile ? (
            <>
              <Panel title={profile.athlete.name} note={profile.athlete.school}>
                <View style={styles.fields}>
                  <Field
                    label="Grade"
                    value={profile.athlete.grade === null ? null : String(profile.athlete.grade)}
                    mono
                  />
                  <Field
                    label="Events"
                    value={
                      profile.athlete.events && profile.athlete.events.length > 0
                        ? profile.athlete.events.join(" · ")
                        : null
                    }
                  />
                  <Field label="Fitness tier" value={profile.fitness?.tier ?? null} />
                </View>
              </Panel>

              <TeamPanel athlete={profile.athlete} onChanged={invalidate} />
              <HrMaxPanel hrMax={profile.risk.hrMax} onChanged={invalidate} />

              {/*
                Energy & motivation, where the website keeps it. It owns its own
                panel head — do not wrap it.

                Worth knowing: on the web this chart plots two things the athlete
                has no control to enter, so it is always half empty there. The
                app's check-in posts `energy`, so here it is a picture of the
                athlete's own reporting handed back to them — which is the best
                argument the app has for checking in at all.
              */}
              <MentalChart mental30={profile.mental30} />

              <Panel title="How your data syncs" note="Read from your watch">
                <ConnectedApps sources={profile.connectedSources} />
              </Panel>

              <Panel title="Season goals" note="Target against today's forecast">
                <SeasonGoals goals={profile.goals} />
              </Panel>

              <Panel title="Achievements" note="What you have done so far">
                <Achievements badges={profile.badges} />
              </Panel>

              {/* Read-only: writing an injury is a coach action, and
                  POST/PATCH /api/injury are mounted only on the dashboard. */}
              <Panel title="Injury history" note="Recorded by your coach">
                <InjuryHistory injuries={profile.injuries} />
              </Panel>
            </>
          ) : !failed ? (
            // Nothing to say while the first fetch is in flight. No spinner:
            // the panels below it must not shift when the data lands.
            null
          ) : (
            <Panel title="Your profile" note="Could not load">
              <Text style={styles.body}>
                Your profile couldn&apos;t be loaded. Nothing here has changed.
              </Text>
            </Panel>
          )}

          <DevicePanel />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  page: {
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
    gap: layout.section,
  },

  /* Panel: title left, note right, content under. */
  panel: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    padding: layout.cardPadding,
    gap: space.md,
    // Elevation, never emphasis. Every panel carries the same one.
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
  panelNote: { ...text.meta, color: color.muted, flexShrink: 1 },

  body: { ...text.base, color: color.ink2 },
  bodyStrong: { ...text.baseSemi, color: color.ink },
  /** The stale-data line. Quiet by construction: the size and colour of a note. */
  stale: { ...text.meta, color: color.muted },

  fields: { gap: space.lg },
  field: { gap: space.xs },
  fieldLabel: { ...text.micro, color: color.muted },
  fieldValue: { ...text.base, color: color.ink },
  /** Every numeral is mono. A grade is a number; a school is not. */
  fieldValueMono: { ...text.stat },
  /** `unknown` #6F675C: 5.21:1 on card. Distinguishable, not prominent. */
  fieldAbsent: { ...text.stat, color: color.unknown },
  fieldAbsentLabel: { ...text.meta, color: color.ink2 },

  /** A code, not prose: mono, tracked out, so O and 0 are told apart. */
  codeValue: { ...text.stat, color: color.ink, letterSpacing: 2 },
  codeInput: {
    ...text.base,
    fontFamily: font.mono,
    letterSpacing: 2,
    color: color.ink,
    // Sunken against the white panel, so the field reads as a field.
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    minHeight: target.min,
  },

  /**
   * `text.stat`, not `text.prompt`: prompt is the check-in question and nothing
   * else, and it is a display face — every numeral in this app is mono.
   */
  hrValue: { ...text.stat, color: color.ink },
  hrRow: { flexDirection: "row", alignItems: "center", gap: target.gap },
  hrInput: {
    ...text.stat,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    minHeight: target.min,
    minWidth: target.min * 2,
  },

  ember: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  emberLabel: { ...text.baseSemi, color: color.bg },
  /** No ember at all: "cannot act yet" is not a dimmed brand. */
  emberOff: { backgroundColor: color.well, borderWidth: ruleWidth, borderColor: color.ruleSoft },
  emberLabelOff: { ...text.baseSemi, color: color.muted },

  quiet: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  quietLabel: { ...text.baseSemi, color: color.ink2 },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2 },
});
