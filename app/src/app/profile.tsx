/**
 * Profile — who the athlete is, what team they are on, what HRmax their
 * training is scored against, and the fact that this phone is the paired
 * device.
 *
 * A STACK route, not a tab. The bar's five items are the daily surfaces and this
 * is not one of them; `chat.tsx` is the precedent for a pushed route with its
 * own header. `settings.tsx` links here.
 *
 * ── THE SHAPE, FROM THE DESIGN STUDY ────────────────────────────────────────
 *
 * An identity header — avatar, name, one meta line — and then a vertical stack
 * of labelled groups: a muted uppercase eyebrow, then a card of rows. Every
 * eyebrow goes through `Section` and every card through `Card` — neither is
 * drawn here, because a hand-drawn heading is exactly how this app ended up
 * with three different section sizes once already (`components/Section.tsx`).
 *
 * This REPLACES the `Panel` stack the screen shipped with. `Panel` puts its
 * title INSIDE the card, which is the website's shape and the right one for a
 * card that is a single object with a caveat. The design's profile is the other
 * shape throughout: the label names a GROUP and sits outside and above the card,
 * and the card underneath is a list of facts rather than one fact. The Panel
 * note survives as `Section`'s note — same role, same right-hand slot.
 *
 * Where the design and this file differ, and why:
 *
 *  - Eyebrows are `text.micro` (11.5 mono, uppercase), not the design's 13px
 *    sans. `Section` owns that decision for the whole app; see docs/design-port.md.
 *  - A row's trailing figure is mono and tabular. The design sets it in sans.
 *  - Separators run BETWEEN rows only. The design emits one after the last row
 *    too, which reads as a clipped row above the card's bottom edge.
 *  - The screen title lives in the native header (`useScreenHeader`), so the
 *    design's subtitle and its identity header are the only page content that
 *    is not a labelled group.
 *  - The design's four groups are five here. Max heart rate and Season goals
 *    keep their own labels rather than folding into "Training": one carries a
 *    group-level action and the server's provenance sentence, the other is
 *    three states per goal. See the "Training" group at the call site.
 *  - No "Edit" pill, no "Export my data", no "Pair another device", no "Last
 *    sync", no second "Sign out". Each is a control for something this app
 *    cannot do; see docs/design-port.md rows 22, 25 and 26.
 *
 * ── THREE DEPARTURES FROM THE WEBSITE'S `ProfileTab` ────────────────────────
 * (website/src/components/athlete/tabs.tsx ~:760)
 *
 *  1. THE PAIRING GROUP DOES NOT CROSS. The web shows the device token with a
 *     copy button, because the browser is not the paired device and the token
 *     has to get to the phone somehow. Here the phone IS the paired device, so
 *     there is nothing to copy and everything to lose: the token never expires
 *     and cannot be revoked (lib/auth.ts), so rendering it would put a
 *     permanent credential for a minor's health data on a screen that can be
 *     shoulder-read or screenshotted. This file therefore never reads the
 *     Keychain for display — the token is read only to sign a request, and
 *     `signOut()` erases it without ever holding it — and `lib/api` has already
 *     stripped `athlete.deviceToken` from the payload before it arrives. What
 *     replaces it is a statement of fact (paired, or not) and a way out
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
 *     automatic" is offered and which caveat the row carries.
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
import { Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import {
  Achievements,
  ConnectedApps,
  InjuryHistory,
  SeasonGoals,
} from "../components/ProfilePanels";
import { Card } from "../components/Card";
import { ListRow } from "../components/List";
import { Section } from "../components/Section";
import { MentalChart } from "../components/charts/MentalChart";
import { ApiError, joinTeam, leaveTeam, setHrMax } from "../lib/api";
import { useProfile } from "../lib/profileStore";
import { fitnessKnown } from "../lib/readiness";
import { useSession } from "../lib/session";
import type { Profile } from "../lib/types";
import { fmtMiles } from "../lib/units";
import { useScreenHeader } from "../theme/header";
import { dim } from "../theme/press";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * The one field this screen wants that the server does not send.
 *
 * `athlete.events`, `fitness.tier` and `risk.hrMax` all already exist on
 * `Profile`, so no widening is needed for those. The team's join code is
 * different: `teams.join_code` is surfaced only on the COACH dashboard
 * (website/src/app/dashboard/page.tsx:73), and `buildProfile()` does not put it
 * in the athlete payload at all — so this key is always undefined today and the
 * code row simply does not render. It is declared rather than dropped because
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
 * Who this is. The design's header row, and the one thing on this screen that
 * is not a labelled group.
 *
 * The name was a `FactRow` reading "Name / Aria N.", which is how you render a
 * field and not how you render a person. It is the subject of the screen, so it
 * gets the display face and the avatar beside it, and the facts that identify
 * rather than describe — grade and school — drop out of the Athlete group into
 * the one muted line under it.
 *
 * THREE THINGS THE DESIGN PUTS HERE AND THIS DOES NOT:
 *
 *  - The "Edit" pill. Nothing on this screen is editable from the phone (see
 *    `FactRow`), and there is no athlete-facing PATCH for name, grade or school.
 *    A pill that opens nothing is the same lie as a chevron on an inert row.
 *  - A 62pt avatar. `target.min + space.md` is 60 — the 4px scale's neighbour,
 *    and `space.ts` is the single source for a size.
 *  - A photo, and any per-athlete colour from `athlete.hue`. § Imagery is
 *    explicit: "initials in circles instead of photos", and colour is rationed
 *    to about three appearances per screen. A tinted circle would spend one of
 *    them on decoration and start a second accent system beside the ember.
 *
 * The meta line is assembled from the parts that are present and simply omits
 * the ones that are not. That is not the absent/zero collapse: a strapline
 * makes no claim to be complete, where a row labelled "Grade" with nothing
 * beside it does — which is why grade keeps a `—`/"Not recorded" row on the
 * coach's side of the app and gets no such treatment here.
 *
 * `tier` is deliberately NOT in this line, though the design's is. It is a
 * bucket of a score that is fabricated when there is no qualifying training
 * (`fitnessKnown`), so it needs a caveat, and a strapline has nowhere to put
 * one. It is a row in Training instead.
 */
function IdentityHeader({ athlete }: { athlete: AppProfile["athlete"] }) {
  const initials =
    athlete.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase() || "—";

  return (
    <View style={styles.identity}>
      {/* Decorative: the initials restate the name six points to the right. */}
      <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <View style={styles.identityBody}>
        <Text style={styles.name} accessibilityRole="header">
          {athlete.name}
        </Text>
        <Text style={styles.meta}>
          {/* Non-negotiable #3: the numeral is mono and tabular even one word
              deep in a sentence. The word "Grade" is prose and stays prose. */}
          {athlete.grade === null ? null : (
            <>
              {"Grade "}
              <Text style={styles.figure}>{athlete.grade}</Text>
              {" · "}
            </>
          )}
          {athlete.school}
        </Text>
      </View>
    </View>
  );
}

/**
 * One labelled fact, as a row.
 *
 * This was a hand-drawn `Field` — a stacked label over a value — which is the
 * web shape. On iOS a key/value fact is a ROW: label left, value right, a
 * separator inset under the label. `ListRow` owns that shape now, so this is
 * only the two things the row cannot know about itself.
 *
 * A missing value renders as an inline dash in `color.unknown` with "Not
 * recorded" as the row's sub-line — the same treatment `Tile` uses, and for the
 * same reason: absence must be distinguishable, not prominent, and five dashed
 * boxes stacked down a profile would make not knowing someone's grade the
 * loudest thing on the screen. It is still never a blank and never a zero, and
 * the dash is never left alone to carry the meaning.
 *
 * The row is inert on purpose — no `onPress`, so `ListRow` draws no chevron and
 * no press flash. None of these facts is editable from the phone, and the
 * design's chevron means "a screen is underneath", not "tappable".
 *
 * There was a `mono` flag for a numeric value. It went with the Grade row, into
 * the header's meta line; every remaining figure on this screen is a `ListRow`
 * with its own `styles.rowMono` node, because each also welds on a unit.
 */
function FactRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string | null;
  isLast?: boolean;
}) {
  return (
    <ListRow
      title={label}
      detail={
        value === null ? <Text style={styles.rowAbsent}>—</Text> : value
      }
      sub={value === null ? "Not recorded" : undefined}
      isLast={isLast}
    />
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

/**
 * A bordered, unfilled control. Leaving, clearing, unpairing.
 *
 * It sits UNDER its group's card rather than inside it, which is where the
 * design puts an action that belongs to a group rather than to one of its rows.
 *
 * `dim` and not `rowPress`: this is an OBJECT, not a surface, so it dims as a
 * whole rather than flashing a fill behind its own label (see theme/press). It
 * had no pressed state at all, which on "Leave team" and "Unpair this device"
 * is the worst place for one to be missing — both post, both take a moment, and
 * a control that does not acknowledge the tap gets tapped twice.
 *
 * The dim is skipped while `disabled`, where a press is not registered anyway.
 */
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
      style={({ pressed }) => [styles.quiet, dim(pressed && !disabled)]}
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
 * that refetch lands the group stays in its old state rather than optimistically
 * claiming a team — `setAthleteTeam` is the server's write, and this screen does
 * not know it happened until the server says so.
 *
 * The joined state is a card of rows; the solo state is a card of prose, a field
 * and a button, because "enter a code" is not a fact and cannot be a row.
 */
function TeamSection({
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
      <Section label="Team" note="What your coach sees">
        <Card padded={false} style={styles.group}>
          <ListRow title="Team" detail={athlete.teamName} isLast={!athlete.joinCode} />
          {/* Only renders once the server sends it — see AppProfile. A code is
              read back character by character, so it is mono like a numeral. */}
          {athlete.joinCode ? (
            <ListRow
              title="Join code"
              detail={<Text style={styles.rowMono}>{athlete.joinCode}</Text>}
              isLast
            />
          ) : null}
        </Card>
        {/*
          THE DESIGN'S FOOTNOTE IS NOT SHIPPED VERBATIM, BECAUSE IT IS FALSE.

          It reads: "Your coach sees your training load, soreness and check-ins.
          They do not see your messages with RunGuard." The second sentence is a
          privacy promise to a minor and the coach's dashboard breaks it — it
          runs `SELECT text … role = 'user' … ORDER BY id DESC LIMIT 5`
          (website/src/lib/profile.ts:189-192) and prints those five lines in
          quotes at dashboard/athlete/[id]/page.tsx:330-337. `chat.tsx` already
          tells the athlete so in the composer; a profile screen that told them
          the opposite would make the app contradict itself about the one thing
          they might be deciding whether to type.

          What DOES hold: safety-intercepted exchanges are tagged and stay off
          the coach's screen entirely (CLAUDE.md → Safety), so the sentence is
          about ordinary messages and says "you send", not "you exchange".
        */}
        <Text style={styles.footnote}>
          Your coach sees your training load, soreness and check-ins — and the
          last <Text style={styles.figure}>5</Text> messages you send to
          RunGuard, word for word.
        </Text>
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
      </Section>
    );
  }

  return (
    <Section label="Team" note="You are solo">
      <Card style={styles.stack}>
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
          placeholderTextColor={color.placeholder}
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
      </Card>
    </Section>
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
 * The one write this group still offers is `send(null)` — reverting a
 * previously-entered manual/calibrated value back to automatic — because a
 * number an athlete already set stays authoritative (`resolveHrMax` prefers a
 * stored choice over anything detected) until they choose to let it go.
 *
 * The figure is a row's trailing detail rather than the 22pt `text.stat` it used
 * to be. That is the design's shape and it is also the truer weight: this is one
 * fact among the profile's facts, not the number a screen is about.
 */
function HrMaxSection({
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
      <Section
        label="Max heart rate"
        note="Every run's intensity is scored against this"
      >
        <Card padded={false} style={styles.group}>
          <FactRow label="Current" value={null} isLast />
        </Card>
      </Section>
    );
  }

  // The enum decides what is OFFERED; it is never printed. `label` is the
  // server's sentence about where the number came from, and it is the only
  // provenance the athlete reads.
  const isSet = hrMax.source === "manual" || hrMax.source === "calibrated";
  const isEstimate = hrMax.source === "age" || hrMax.source === "default";

  return (
    <Section label="Max heart rate" note={hrMax.label}>
      <Card padded={false} style={styles.group}>
        {/* One text node — the unit is welded to the numeral, never adjacent. */}
        <ListRow
          title="Current"
          detail={<Text style={styles.rowMono}>{`${hrMax.value} bpm`}</Text>}
          sub={
            isEstimate
              ? "An estimate, not something measured on you. It updates on its own once enough workouts have synced from Apple Health."
              : isSet
                ? "Every run's intensity is scored against this number, so it feeds your training load and your workload ratio."
                : "Read from your own workout history in Apple Health, and it feeds your training load and your workload ratio."
          }
          isLast
        />
      </Card>
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
    </Section>
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
 * token was told it was paired directly beneath the group that had just said it
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
function DeviceSection() {
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
      <Section label="This device">
        <Card padded={false} style={styles.group}>
          <ListRow
            title="Pairing"
            detail={status === "out" ? "Not paired" : "Checking"}
            sub={
              status === "out"
                ? "This phone isn't paired to a RunGuard account, so nothing is syncing from it and there is no pairing here to remove."
                : "Checking whether this phone is paired."
            }
            isLast
          />
        </Card>
      </Section>
    );
  }

  return (
    <Section label="This device">
      <Card padded={false} style={styles.group}>
        {/* A STATEMENT, never the token itself. See the file header. */}
        <ListRow
          title="Pairing"
          detail="Paired"
          sub="This phone is paired to your RunGuard account and syncs on its own. The pairing token is held in this device's keychain and is never shown."
          isLast
        />
      </Card>
      <QuietButton label="Unpair this device" onPress={confirm} />
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Your data
 * ------------------------------------------------------------------ */

/**
 * The design's fourth group, minus the row that would be a promise.
 *
 * IT DOES NOT SHIP "EXPORT MY DATA". There is no export endpoint — not on
 * `/api/mobile/*`, not anywhere — so the design's row, and its note "A JSON
 * file of everything RunGuard holds", describe a file the app cannot produce.
 * Rendering it as the inert-row treatment was the alternative and it is worse
 * here than omitting it: an inert row is honest when a thing exists and cannot
 * be changed from the phone, and this thing does not exist.
 *
 * The athlete is not left without an answer, which is the only reason omitting
 * is acceptable. `privacy.tsx` says, verbatim, that a copy of your data or its
 * deletion is a request by email, so the sub-line points there rather than
 * inventing a control. That is the one true route and this row is on it.
 *
 * A chevron, because a screen IS underneath — that is what the chevron promises
 * (components/List.tsx), and it is the only row on this screen that keeps it.
 */
function YourDataSection() {
  const router = useRouter();
  return (
    <Section label="Your data">
      <Card padded={false} style={styles.group}>
        <ListRow
          title="Privacy"
          sub="What RunGuard reads, who can see it, and how to ask for a copy of your data or have it deleted."
          onPress={() => router.push("/privacy")}
          chevron
          isLast
        />
      </Card>
    </Section>
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
   * finishes with `invalidate()`, which refetches it in place: the groups keep
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
      <Stack.Screen options={useScreenHeader("Profile")} />
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
          {/*
            The design's subtitle. The title itself is the native header's
            ("Profile"), so this is the only line on the screen that is not a
            labelled group — putting the word "Profile" here as well would give
            the screen two titles.
          */}
          <Text style={styles.subtitle}>Goals, zones and pairing</Text>

          {/* One quiet line, and nothing else changes: the groups below are
              still showing what the server last said, which is still true. */}
          {failed && profile ? (
            <Text style={styles.stale}>
              Could not reach your server just now. This is your profile as it was
              last loaded.
            </Text>
          ) : null}

          {profile ? (
            <>
              <IdentityHeader athlete={profile.athlete} />

              {/*
                Name, grade and school moved UP into the header row — see
                `IdentityHeader`. What is left in this group is the one fact
                about the athlete that is neither identity nor training.
              */}
              <Section label="Athlete">
                <Card padded={false} style={styles.group}>
                  <FactRow
                    label="Events"
                    value={
                      profile.athlete.events && profile.athlete.events.length > 0
                        ? profile.athlete.events.join(" · ")
                        : null
                    }
                    isLast
                  />
                </Card>
              </Section>

              {/*
                The design's "Training" group. It holds four rows there; two of
                them keep their own groups here and one of those is directly
                below:

                 - Max heart rate carries a group-level action ("Use automatic")
                   and the server's own provenance sentence as its note. A row
                   cannot hold either, so it stays a `Section` and simply sits
                   next to this one.
                 - Season goals is three states per goal, not one value — see
                   `SeasonGoals`. Flattening it to "Season goal / 18:30" is what
                   turns "not enough training recorded to forecast this" into a
                   number.
              */}
              <Section label="Training">
                <Card padded={false} style={styles.group}>
                  {/*
                    KILOMETRES on the wire, miles on the screen, unit welded in
                    one node — lib/units.

                    The caveat is permanent because the payload cannot tell the
                    two cases apart: `profile.ts:344` uses the athlete's own
                    `weekly_km` if there is one and otherwise INVENTS
                    `max(round(weekKm * 1.05), 20)`. Printing that as "your
                    goal" with no note is the same fabricated-from-nothing
                    failure as readiness scoring 100 with no check-in.
                  */}
                  <ListRow
                    title="Weekly distance goal"
                    detail={
                      profile.weeklyTargetKm === undefined ? (
                        <Text style={styles.rowAbsent}>—</Text>
                      ) : (
                        <Text style={styles.rowMono}>{fmtMiles(profile.weeklyTargetKm)}</Text>
                      )
                    }
                    sub={
                      profile.weeklyTargetKm === undefined
                        ? "Not recorded"
                        : "Yours if you set one on the web. If you have not, this is worked out from your recent weeks rather than chosen by you."
                    }
                  />
                  {/*
                    GATED, and it was not. `fitness.tier` is a bucket of a score
                    that `computeFitness` falls back to 50 for whenever no week
                    holds enough running — which buckets to "Intermediate". So
                    an athlete who has never trained was being told their tier
                    as a plain labelled fact. `fitnessKnown` is the honest test
                    (lib/readiness.ts): `weekly` is empty exactly when the
                    fallback fired.
                  */}
                  <ListRow
                    title="Tier"
                    detail={
                      fitnessKnown(profile) && profile.fitness ? (
                        profile.fitness.tier
                      ) : (
                        <Text style={styles.rowAbsent}>—</Text>
                      )
                    }
                    sub={
                      fitnessKnown(profile) && profile.fitness
                        ? undefined
                        : "Not enough qualifying training recorded yet to place you in a tier."
                    }
                    isLast
                  />
                </Card>
              </Section>

              <HrMaxSection hrMax={profile.risk.hrMax} onChanged={invalidate} />
              <TeamSection athlete={profile.athlete} onChanged={invalidate} />

              {/*
                Energy & motivation, where the website keeps it. It owns its own
                panel head — do not wrap it in a Section, or the group is named
                twice.

                Worth knowing: on the web this chart plots two things the athlete
                has no control to enter, so it is always half empty there. The
                app's check-in posts `energy`, so here it is a picture of the
                athlete's own reporting handed back to them — which is the best
                argument the app has for checking in at all.
              */}
              <MentalChart mental30={profile.mental30} />

              <Section label="How your data syncs" note="Read from your watch">
                <ConnectedApps sources={profile.connectedSources} />
              </Section>

              <Section label="Season goals" note="Target against today's forecast">
                <SeasonGoals goals={profile.goals} />
              </Section>

              <Section label="Achievements" note="What you have done so far">
                <Achievements badges={profile.badges} />
              </Section>

              {/* Read-only: writing an injury is a coach action, and
                  POST/PATCH /api/injury are mounted only on the dashboard. */}
              <Section label="Injury history" note="Recorded by your coach">
                <InjuryHistory injuries={profile.injuries} />
              </Section>
            </>
          ) : !failed ? (
            // Nothing to say while the first fetch is in flight. No spinner:
            // the groups below it must not shift when the data lands.
            null
          ) : (
            <Section label="Your profile" note="Could not load">
              <Card>
                <Text style={styles.body}>
                  Your profile couldn&apos;t be loaded. Nothing here has changed.
                </Text>
              </Card>
            </Section>
          )}

          <DeviceSection />
          <YourDataSection />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  /**
   * `layout.section` between groups — the design's 22, on the app's 4px scale.
   * `Section` supplies the 8 between an eyebrow and its own card.
   */
  page: {
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
    gap: layout.section,
  },

  /**
   * A card whose content is rows.
   *
   * `overflow: "hidden"` is the design's, and it is load-bearing rather than
   * cosmetic: it clips a row's press flash and its separator to the card's
   * corner. Layout only, so it belongs in the caller's style — `Card` owns the
   * ground, the corner and the shadow (see `CardProps.style`).
   */
  group: { overflow: "hidden" },
  /** A card whose content is prose, a field and a button rather than rows. */
  stack: { gap: space.md },

  body: { ...text.base, color: color.ink2 },
  /** The design's subtitle, under the header's title. */
  subtitle: { ...text.meta, color: color.muted },

  /* ---- The identity header. See `IdentityHeader`. ---------------------- */
  identity: { flexDirection: "row", alignItems: "center", gap: layout.cardPadding },
  /**
   * 60, not the design's 62: `target.min` plus one step of the 4px scale, so
   * the size comes out of space.ts like every other one. `radius.pill` is
   * clamped by RN to half the shorter side, which is what makes it a circle at
   * any diameter — and it takes no `borderCurve` (see space.ts).
   */
  avatar: {
    width: target.min + space.md,
    height: target.min + space.md,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Initials, in the display face. Never a photo — § Imagery. */
  initials: { ...text.title, color: color.ink2 },
  identityBody: { flex: 1, gap: space.xs },
  /**
   * The design sets a name at 700/22 sans. `text.title` (19 display 700) is the
   * app's nearest rank and the scale is roles, not sizes — there is no 22
   * display step, and adding one for a single string would give the app two
   * title ranks that differ by 3pt.
   */
  name: { ...text.title, color: color.ink },
  meta: { ...text.meta, color: color.muted },
  /** A numeral inside a sentence: mono and tabular, wherever it sits. */
  figure: { fontFamily: font.mono, ...tabular },
  /** Sits under a card, in the note register — see the Team group. */
  footnote: { ...text.meta, color: color.ink2 },
  /** The stale-data line. Quiet by construction: the size and colour of a note. */
  stale: { ...text.meta, color: color.muted },

  /**
   * Nested inside `ListRow`'s own `detail` node, so these carry the FACE only
   * — size and colour are inherited from the row and must stay the row's, or
   * one screen's key/value pairs read a size apart from every other screen's.
   *
   * `text.stat` is deliberately not used here: it is 22pt, which is a figure a
   * screen is about, not a value sitting at the right-hand end of a row.
   */
  rowMono: { fontFamily: font.mono, ...tabular },
  /** `unknown` #6F675C: 5.21:1 on card. Distinguishable, not prominent. */
  rowAbsent: { fontFamily: font.mono, ...tabular, color: color.unknown },

  /*
   * Dead before this port and left alone by it: `HrMaxPanel` dropped its
   * manual-entry field when HealthKit started detecting a real peak, and these
   * two are what dressed it. Not this change's to remove.
   */
  hrRow: { flexDirection: "row", alignItems: "center", gap: target.gap },
  hrInput: {
    ...text.stat,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    borderCurve: "continuous",
    paddingHorizontal: space.md,
    minHeight: target.min,
    minWidth: target.min * 2,
  },

  codeInput: {
    ...text.base,
    fontFamily: font.mono,
    letterSpacing: 2,
    color: color.ink,
    // Sunken against the white card, so the field reads as a field.
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    // The squircle iOS draws itself. See space.ts: every non-pill radius in
    // this app is paired with it.
    borderCurve: "continuous",
    paddingHorizontal: space.md,
    minHeight: target.min,
  },

  ember: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  emberLabel: { ...text.baseSemi, color: color.ink },
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
    borderCurve: "continuous",
  },
  quietLabel: { ...text.baseSemi, color: color.ink2 },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2 },
});
