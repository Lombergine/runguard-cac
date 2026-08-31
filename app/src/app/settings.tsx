/**
 * Settings. A STACK route, not a tab — the tab bar's five items are the daily
 * surfaces and this is not one of them.
 *
 * The groups and their order come from the design study. Its CONTROLS mostly do
 * not, and that is the whole story of this file — the brief it is held to is a
 * short one: SAY WHAT IS TRUE.
 *
 * ── THE DESIGN'S FOUR TOGGLES, AND WHY NONE OF THEM SHIPS ───────────────────
 *
 * The design draws Data and Check-in as switch rows. A switch is a promise that
 * something is stored and honoured. Nothing in this build can keep any of these
 * four, so all four ship as plain, un-tappable rows that name the reason, and
 * `Switch` is not imported at all:
 *
 *   - Apple Health sync      There is no sync PREFERENCE. `lib/health.ts` keeps
 *                            a permission timestamp and a last-sync record and
 *                            nothing else; syncing is an act the athlete
 *                            performs on the Connect screen, not a state they
 *                            set. Storing a new flag would mean a new key in
 *                            SecureStore, and every stored key has to be in
 *                            `lib/auth.ts`'s erase list or sign-out leaks it.
 *   - Share with my coach    There is no endpoint. A coach seeing their own
 *                            athlete's load is what the product IS, and the one
 *                            call that changes it — `leaveTeam()` — is leaving
 *                            the team, not a sharing preference. Wiring a
 *                            switch to it would make a destructive act look
 *                            like a setting.
 *   - Morning reminder       No APNs credentials and no expo-notifications, so
 *                            nothing in this build can deliver one. This is the
 *                            one an athlete would actually rely on, and it is
 *                            the one a dead switch would hurt most: they would
 *                            find out at 6am, when the reminder never came.
 *   - Weekly summary email   Refused rather than shown dead. A dead row is
 *                            honest about a setting that is MISSING; there is
 *                            no weekly email anywhere in this product, on any
 *                            surface, so a row for it would not be admitting a
 *                            gap, it would be advertising a feature.
 *
 * The units rows are the same shape for the same reason: `lib/units.ts`
 * hard-codes miles per formatter and welds "mi" on itself, so there is no
 * preference to read and nothing for a switch to set.
 *
 * Appearance is the one row where the design's control became real, by becoming
 * a value instead: the app follows the phone, so the row REPORTS what it is
 * currently drawing rather than offering a choice it does not have.
 *
 * The token rule from lib/auth.ts applies here in full: this file never reads,
 * renders, logs or hints at the device token. Signing out deletes it without
 * ever holding it.
 *
 * This screen sits inside the session gate (lib/session.tsx), so it exists only
 * while someone is signed in. It therefore states the signed-in case plainly and
 * carries no signed-out branch: there is no frame in which this file renders to
 * a signed-out phone.
 *
 * ── THE SHAPE: components/List.tsx, NOT A LOCAL ONE ─────────────────────────
 *
 * Every key/value and every link here is a `ListRow` inside a `List` — the iOS
 * inset grouped list. This file is where that shape was first hand-written
 * (`LinkRow`, `StaticRow`, `Divider`, a local `Chevron`), and the component was
 * lifted out of it; those four are deleted rather than kept alive beside their
 * own extract, because a second definition is how a codebase ends up with three
 * competing row heights.
 *
 * The rule this file used to state locally now lives in the component and is
 * enforced by its API: an inert row is simply a row with no `onPress`, which
 * renders as a plain `View` — no chevron, no press flash, no accessibility
 * role. Nothing on this screen has to remember not to look tappable.
 *
 * ── THE LABEL: components/Section.tsx, NOT `List`'s own `header` ────────────
 *
 * Every group label on this screen goes through `Section`. `List` will draw one
 * itself, from the same `text.micro`, but it has no counterpart to `Panel`'s
 * note — so each group's caveat used to be folded into the label string
 * ("UNITS · DISPLAY ONLY") and set in the eyebrow's uppercase mono, which is not
 * the rank a caveat belongs in. That was the NEEDS PRIMITIVE note in the
 * hand-off; `Section` is the primitive, and it reads label-left, note-right like
 * every other head in the app.
 *
 * Dropping the caveats was never an option — "not available in this build" is
 * the honest half of the Check-in group, not decoration.
 *
 * ── THE WAY OUT: A SLAB OF CENTRED ROWS, NOT A PANEL AND A BUTTON ───────────
 *
 * The bottom of the screen used to be a `Panel` — a paragraph and one outlined
 * red button. It is now the design's shape: a slab of centred destructive rows
 * with a full-bleed hairline between them, and the paragraph demoted to the
 * screen's closing footnote.
 *
 * Nothing was lost by dropping the prose. What it said — that the server keeps
 * your runs and check-ins, and that you can sign back in — is said by the
 * confirmation Alert, BEFORE anything happens, which is the only moment it is
 * actually being read.
 *
 * `List` supplies the slab; the rows are its children rather than `ListRow`s,
 * because a `ListRow` puts its title on the left and these are centred. The
 * hairline between them is local for the same reason: `ListRow`'s separator is
 * inset from the left so it starts under a title, and under a centred label
 * that inset reads as a mistake.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import Constants from "expo-constants";

import { Absent } from "../components/Nothing";
import { List, ListRow } from "../components/List";
import { Section } from "../components/Section";
import { getHome, isUnauthorized } from "../lib/api";
import { isDemo } from "../lib/demo";
import { useSession } from "../lib/session";
import { useScreenHeader } from "../theme/header";
import { rowPress } from "../theme/press";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, ruleWidth, space, target } from "../theme/space";

/**
 * From app.json. Null in any runtime that does not embed the config rather than
 * a fabricated "1.0.0" — a version string that is wrong is worse than none when
 * someone is reporting a bug against it.
 */
const APP_VERSION = Constants.expoConfig?.version ?? null;

/**
 * The screen's closing footnote, from the design, verbatim.
 *
 * It survives the fact that nothing on this screen deletes anything: it
 * describes what deletion COSTS, which is exactly what someone about to ask for
 * it needs, and the last clause is the one that matters — the runs an athlete
 * cares most about were never RunGuard's only copy.
 */
const DELETE_NOTE =
  "Deleting removes your check-ins and soreness history. Runs stay in Apple Health on your phone — RunGuard never had the only copy.";

/** The demo has no account to delete and nothing on the server to lose. */
const DEMO_NOTE =
  "You are looking at a real seeded runner's training as an athlete would see it. Anything you changed stayed on this phone and is never sent — the roster on the server is untouched.";

/**
 * The athlete's name is the only server value on this screen. Three states, not
 * two: "still loading" is not "we asked and there is nothing", and neither of
 * them may render as an empty line that reads as fine.
 *
 * There is no "unpaired" state any more. It used to be inferred from a caught
 * 401, which made this screen a second, weaker auth gate that disagreed with the
 * real one; a 401 now ends the session instead, and this screen goes with it.
 */
type NameState =
  | { kind: "loading" }
  | { kind: "known"; name: string }
  | { kind: "failed" };

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useSession();
  const [name, setName] = useState<NameState>({ kind: "loading" });
  const [unpairing, setUnpairing] = useState(false);
  // Read once per render: the value only changes on sign-out, which unmounts this.
  const demo = isDemo();
  /*
   * What the app is CURRENTLY drawing, not what the athlete picked — there is
   * nothing to pick. Every colour in theme/tokens.ts is a `DynamicColorIOS`
   * pair, so the appearance is the phone's and the row reports it.
   */
  const scheme = useColorScheme();

  useEffect(() => {
    let alive = true;
    // /home rather than /me: this screen reads one string, and /me is 57 KB.
    getHome()
      .then((profile) => {
        if (alive) setName({ kind: "known", name: profile.athlete.name });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // The gate is keychain-deep: it knows a token is stored, not that the
        // server still honours it. A 401 is a dead token, and the answer is the
        // one chat.tsx gives — end the session. Nothing is rendered for it,
        // because ending the session unmounts the surface that would render it.
        if (isUnauthorized(err)) {
          void signOut();
          return;
        }
        setName({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [signOut]);

  /**
   * Leave. `signOut()` is the only sanctioned way out, and it does the two
   * things this screen used to do badly: it erases EVERY stored key — the token
   * and the cached health state that used to outlive it on the Connect screen —
   * and it fails closed, so the gate shuts whether or not the keychain obeyed.
   * No `router.replace` here: which navigator exists is the gate's decision, and
   * routing from a screen that is being unmounted only races it.
   *
   * A refused erase is reported in an Alert rather than in a line of text on
   * this panel, because by then there is no panel: the session is already "out"
   * and the authed group, this screen included, is on its way out of the tree.
   * An Alert is presented by the OS above whatever is on screen, so it survives
   * that and the athlete reads it wherever they land.
   *
   * The wording had to move with it. "Nothing changed — the device is still
   * paired" was true when this screen stayed put; it is a lie now, because the
   * app really is signed out. What did not change is the keychain, and the part
   * the athlete needs is the consequence: the pairing is still on the phone, so
   * it can sign them back in.
   */
  const unpair = useCallback(() => {
    setUnpairing(true);
    void (async () => {
      const { erased } = await signOut();
      if (erased) return;
      Alert.alert(
        "Signed out, but the pairing is still on this phone",
        "This phone's keychain would not release it, so RunGuard may sign itself back in the next time you open the app. Try unpairing again, or restart the phone."
      );
    })();
  }, [signOut]);

  /**
   * Deletion, which this build cannot perform.
   *
   * There is no delete endpoint — `lib/api.ts` has no call for it and
   * `/api/mobile/*` has no route — so the row cannot delete anything, and a red
   * row that silently does nothing is the worst version of that. What it can do
   * is the one real thing there is: say so, and open the policy that carries the
   * address to write to and the list of what is removed. The address is NOT
   * repeated here; privacy.tsx already notes that a second copy of it is a bug.
   */
  const askDelete = useCallback(() => {
    Alert.alert(
      "Deleting is done by email",
      "RunGuard cannot delete an account from inside the app yet. The privacy policy has the address to write to, and says what is removed when you do.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Read the policy", onPress: () => router.push("/privacy") },
      ]
    );
  }, [router]);

  const confirmUnpair = useCallback(() => {
    if (unpairing) return;
    Alert.alert(
      demo ? "Leave the demo?" : "Sign out?",
      demo
        ? "Everything you changed in the demo was kept on this phone, and leaving discards it. Nothing on the server was ever touched."
        : "RunGuard will sign out of this phone. Your runs and check-ins stay on the server, and you can sign back in with your email and password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: demo ? "Leave" : "Sign out",
          style: "destructive",
          onPress: unpair,
        },
      ]
    );
  }, [unpair, unpairing, demo]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={useScreenHeader("Settings")} />

      <ScrollView contentContainerStyle={styles.page}>
        {/*
          The screen's subtitle, in the CONTENT rather than in the bar.
          `useScreenHeader` draws one line and offers no second one
          (theme/header.ts), and connect.tsx already carries its opening
          sentence this way — so the two pushed screens read alike.
        */}
        <Text style={styles.lede}>Sync, sharing and units</Text>

        {/* ---- Account ----------------------------------------------- */}
        <Section label="Account" note="This phone">
          <List>
            {name.kind === "known" ? (
              <ListRow title="Signed in as" detail={name.name} />
            ) : name.kind === "loading" ? (
              // `target.row` reserves the row's height, so nothing jumps when the
              // name lands. Not a spinner: it is one line of text arriving, and
              // the row's detail is already muted so it cannot read as the answer.
              <ListRow title="Signed in as" detail="Loading…" />
            ) : (
              /*
                Absent, not an em dash in the detail slot. A failed fetch is "we
                do not know", and in this app that is one specific object: dashed
                border, sunken fill, the word that says what the dash means. It
                keeps its own eyebrow because it replaces the whole row, title
                included.

                It is a block, so it cannot go through `detail` (a `Text`) and it
                draws no row separator. See the NEEDS PRIMITIVE note.
              */
              <View style={styles.blockRow}>
                <Absent eyebrow="SIGNED IN AS" label="Could not reach the server." />
              </View>
            )}

            <ListRow
              title="Profile"
              sub="School, events, team and max heart rate"
              onPress={() => router.push("/profile")}
              chevron
              isLast
            />
          </List>
        </Section>

        {/* ---- Data ---------------------------------------------------- */}
        {/*
          The design's first group, with its two switches turned back into the
          things they actually are: a screen you go to, and a fact about the
          product. See the toggle table at the top of this file.
        */}
        <Section label="Data" note="Read only">
          <List>
            <ListRow
              title="Apple Health"
              sub="Where your runs, sleep and heart rate come from. Syncing is something you do on that screen, not a switch that runs on its own."
              onPress={() => router.push("/connect")}
              chevron
            />
            {/*
              The design labels this "Share with my coach" and draws it switched
              on, noted "Load, soreness and check-ins — not your messages".

              The switch is refused because there is nothing behind it. The NOTE
              is refused for a second, worse reason: it is not true. The privacy
              policy — this app's screen and the website's page, which must not
              disagree about the same data — says chat is stored so that you and
              your coach can both see the conversation. The one exception is the
              one the athlete cannot be told about here: a safety-tagged exchange
              never reaches the coach at all.
            */}
            <ListRow
              title="Shared with your coach"
              sub="Your runs, load, soreness and check-ins. A coach seeing their own athlete's training is what RunGuard is for, so it is not a switch — the privacy policy lists exactly what is shared."
              isLast
            />
          </List>

          {/*
            The design's group footnote, minus its second sentence — "Turning
            sync off stops new runs arriving; it does not delete what is already
            here." There is no off. A sentence that describes a control which
            does not exist is the same lie as the control, told in prose.
          */}
          <Text style={styles.footnote}>
            RunGuard reads from Apple Health and writes nothing back.
          </Text>
        </Section>

        {/* ---- Display ------------------------------------------------- */}
        {/*
          Read-only on purpose. lib/units.ts is display-only and the server is
          metric throughout, but each formatter has miles written into it and
          welds "mi" on itself — there is no preference to read and no caller
          that could pass one. A real toggle is a change to units.ts, to a new
          stored preference, and to every screen that formats a distance or a
          pace, so it is more than a display-layer change and it is not offered
          as one.

          No `onPress`, so `ListRow` renders a plain View: no chevron promising
          a screen underneath, and no flash promising an effect.
        */}
        <Section label="Display" note="Nothing here is a choice yet">
          <List>
            <ListRow
              title="Distance"
              detail="Miles"
              sub="The server records kilometres; the app converts them on the way to the screen."
            />
            <ListRow
              title="Pace"
              detail="Minutes per mile"
              sub="Kilometres are not a setting yet — the conversion is written into the app rather than read from a preference, so there is nothing here to switch."
            />
            {/*
              The design's "Appearance / Light" — the one row of its four
              controls that is real, because it is a REPORT rather than a
              choice. `useColorScheme()` is what the app is drawing right now.
              `null` (an appearance the OS will not name) draws light, so
              "Light" is a description of the screen either way rather than a
              claim about a setting.
            */}
            <ListRow
              title="Appearance"
              detail={scheme === "dark" ? "Dark" : "Light"}
              sub="Follows your phone, under Display & Brightness. RunGuard has no appearance of its own to set."
              isLast
            />
          </List>
        </Section>

        {/* ---- Check-in ------------------------------------------------ */}
        {/*
          The single biggest open problem in the product — 10 of 14 athletes do
          not report — and the honest row is still the empty one. There are no
          APNs credentials and expo-notifications is not installed, so this build
          cannot deliver a reminder by any route. A switch here would be the one
          setting an athlete would actually rely on, and it would silently do
          nothing.

          The design's second row here, "Weekly summary email", is not rendered
          at all — see the top of this file.
        */}
        <Section label="Check-in" note="Not available in this build">
          <List>
            <ListRow
              title="Morning reminder"
              detail="Off"
              sub="RunGuard cannot send notifications yet — nothing in this build can deliver one, so there is no switch to turn on. Until then the check-in waits for you on the home screen."
              isLast
            />
          </List>
        </Section>

        {/* ---- About --------------------------------------------------- */}
        <Section label="About" note="RunGuard">
          <List>
            <ListRow
              title="Privacy"
              sub="What RunGuard collects, and who can see it"
              onPress={() => router.push("/privacy")}
              chevron
            />

            {APP_VERSION ? (
              /*
                A numeral, so mono and tabular (non-negotiable #3). Nested inside
                the row's own detail `Text`, which supplies the size and the
                muted colour — only the FACE changes, so a version can never
                drift a point away from the value beside it on another row.

                Last in the group, as the design places it — which also puts the
                `Absent` fallback last, where a block that draws no separator of
                its own cannot leave a gap in the middle of the slab.
              */
              <ListRow
                title="Version"
                detail={<Text style={styles.figure}>{APP_VERSION}</Text>}
                isLast
              />
            ) : (
              <View style={styles.blockRow}>
                <Absent eyebrow="VERSION" label="Not recorded in this build." />
              </View>
            )}
          </List>

          {/*
            The line the whole product is built around, in plain type, as the
            group's footer — where iOS puts the sentence that qualifies a group.
            It is NOT styled as a SafetyNotice: that component belongs to safety-
            intercepted chat replies alone, and spending its shape on a footer
            would blunt it where it matters.
          */}
          <Text style={styles.footnote}>
            RunGuard is a monitoring signal, not medical advice. It describes what
            your runs, sleep and check-ins show. It does not diagnose anything, and
            it is not a substitute for your coach, an athletic trainer or a doctor.
          </Text>
        </Section>

        {/* ---- Leaving ------------------------------------------------- */}
        {/*
          The design's destructive card: centred rows, a full-bleed hairline
          between them, and one footnote underneath.

          In the demo it is a different act entirely: nothing was paired, there
          is nothing to sign out of, and everything the visitor typed lived on
          this phone. Saying "sign out" there would imply an account they never
          made — and there is no account to delete either, so that row is not
          drawn at all.
        */}
        <View style={styles.group}>
          <List>
            <Pressable
              onPress={confirmUnpair}
              disabled={unpairing}
              accessibilityRole="button"
              accessibilityState={{ disabled: unpairing }}
              /*
                `rowPress`, not `dim`: this is a row in a slab, so it flashes a
                fill across its full width like every other row in the app.
                theme/press.ts draws that line.
              */
              style={({ pressed }) => [styles.dangerRow, rowPress({ pressed })]}
            >
              <Text style={styles.dangerLabel}>
                {demo
                  ? unpairing
                    ? "Leaving…"
                    : "Leave the demo"
                  : unpairing
                    ? "Signing out…"
                    : "Sign out"}
              </Text>
            </Pressable>

            {demo ? null : (
              <>
                <View style={styles.dangerRule} pointerEvents="none" />
                <Pressable
                  onPress={askDelete}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.dangerRow, rowPress({ pressed })]}
                >
                  <Text style={styles.dangerLabel}>Delete my account</Text>
                </Pressable>
              </>
            )}
          </List>

          <Text style={styles.footnote}>{demo ? DEMO_NOTE : DELETE_NOTE}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
    gap: layout.section,
  },

  /**
   * The subtitle, directly under the native title. Same role and same token as
   * connect.tsx's opening sentence, so the two pushed screens open alike.
   */
  lede: { ...text.base, color: color.ink2 },

  /**
   * A block standing in for a row inside the slab — currently only `Absent`,
   * which draws its own border and fill and therefore cannot be a `Text`
   * detail. Padded to the slab's own row inset so it lines up with the titles
   * above and below it.
   */
  blockRow: {
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },

  /**
   * The mono face alone. Size and colour are inherited from `ListRow`'s detail
   * `Text`, so this changes a numeral's FACE without pinning its size — the
   * pattern `ListRow`'s own docs prescribe for figures.
   */
  figure: { fontFamily: font.mono, ...tabular },

  /**
   * A group footer, at the slab's own row inset so the caveat lines up with the
   * titles it qualifies rather than floating at the page edge.
   *
   * No `paddingTop`: the group is a `Section` now, and its `gap` already spaces
   * every child from the one above it. The padding this used to carry was for a
   * bare `View`, and laying it on top of the gap would double the distance.
   */
  footnote: {
    ...text.meta,
    color: color.ink2,
    paddingHorizontal: layout.cardPadding,
  },

  /**
   * The last group has no label — the design gives the destructive card none,
   * and an eyebrow over it would name the obvious. It still needs `Section`'s
   * own gap so its footnote sits under the slab rather than a section away
   * from it.
   */
  group: { gap: space.sm },

  /**
   * A destructive row, centred, filling the slab's width.
   *
   * NOT the ember: the ember is the brand's yes, and these are the two actions
   * that undo the athlete's setup. `unusualText` measures 5.18:1 on card and
   * carries no fill a mis-tap could ride — the red is on the word alone.
   */
  dangerRow: {
    minHeight: target.row,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  /**
   * Full-bleed, unlike `ListRow`'s separator, which is inset from the left so
   * that it starts under a title. Under a centred label there is no title to
   * start under, and the inset would read as a misdrawn line.
   */
  dangerRule: { height: ruleWidth, backgroundColor: color.ruleSoft },
  dangerLabel: { ...text.baseSemi, color: color.unusualText },
});
