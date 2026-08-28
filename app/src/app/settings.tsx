/**
 * Settings. A STACK route, not a tab — the tab bar's five items are the daily
 * surfaces and this is not one of them.
 *
 * This screen is not a port: the website has no settings page, so it is designed
 * here. The design brief it is held to is a short one — SAY WHAT IS TRUE. Three
 * of the five things an athlete would look for in a settings screen do not exist
 * in this product yet:
 *
 *   - a kilometres/miles switch  (lib/units.ts hard-codes miles per formatter;
 *     there is no preference to read, so a switch would have nothing to set)
 *   - a check-in reminder        (no APNs credentials, no expo-notifications;
 *     the app cannot deliver one)
 *   - anything to do with the device token beyond deleting it
 *
 * Each is therefore rendered as a plain, un-tappable row that names the reason.
 * A settings screen full of switches that do nothing is worse than a short one
 * that is true, and a dead switch is a lie the athlete only discovers at 6am
 * when the reminder they thought they enabled never arrives.
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
 * `List` has no counterpart to `Panel`'s note, so each group's caveat is folded
 * into the group header ("UNITS · DISPLAY ONLY"). Dropping those was not an
 * option — "not available in this build" is the honest half of the
 * Notifications group, not decoration. See the NEEDS PRIMITIVE note in the
 * hand-off.
 *
 * The two prose-and-a-button sections at the bottom stay `Panel`s. They are not
 * lists and forcing them into one would cost the paragraph that explains what
 * the red button actually does.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import Constants from "expo-constants";

import { Absent } from "../components/Nothing";
import { List, ListRow } from "../components/List";
import { getHome, isUnauthorized } from "../lib/api";
import { isDemo } from "../lib/demo";
import { useSession } from "../lib/session";
import { useScreenHeader } from "../theme/header";
import { Panel } from "../components/Panel";
import { dim } from "../theme/press";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * From app.json. Null in any runtime that does not embed the config rather than
 * a fabricated "1.0.0" — a version string that is wrong is worse than none when
 * someone is reporting a bug against it.
 */
const APP_VERSION = Constants.expoConfig?.version ?? null;

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
        {/* ---- Account ------------------------------------------------- */}
        <List header="Account · this phone">
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
          />
          <ListRow
            title="Connect data"
            sub="Where your runs, sleep and heart rate come from"
            onPress={() => router.push("/connect")}
            chevron
            isLast
          />
        </List>

        {/* ---- Units --------------------------------------------------- */}
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
        <List header="Units · display only">
          <ListRow
            title="Distance"
            detail="Miles"
            sub="The server records kilometres; the app converts them on the way to the screen."
          />
          <ListRow
            title="Pace"
            detail="Minutes per mile"
            sub="Kilometres are not a setting yet — the conversion is written into the app rather than read from a preference, so there is nothing here to switch."
            isLast
          />
        </List>

        {/* ---- Notifications ------------------------------------------- */}
        {/*
          The single biggest open problem in the product — 10 of 14 athletes do
          not report — and the honest row is still the empty one. There are no
          APNs credentials and expo-notifications is not installed, so this build
          cannot deliver a reminder by any route. A switch here would be the one
          setting an athlete would actually rely on, and it would silently do
          nothing.
        */}
        <List header="Notifications · not available in this build">
          <ListRow
            title="Check-in reminder"
            detail="Off"
            sub="RunGuard cannot send notifications yet — nothing in this build can deliver one, so there is no switch to turn on. Until then the check-in waits for you on the home screen."
            isLast
          />
        </List>

        {/* ---- About --------------------------------------------------- */}
        <View>
          <List header="About · RunGuard">
            {APP_VERSION ? (
              /*
                A numeral, so mono and tabular (non-negotiable #3). Nested inside
                the row's own detail `Text`, which supplies the size and the
                muted colour — only the FACE changes, so a version can never
                drift a point away from the value beside it on another row.
              */
              <ListRow
                title="Version"
                detail={<Text style={styles.figure}>{APP_VERSION}</Text>}
              />
            ) : (
              <View style={styles.blockRow}>
                <Absent eyebrow="VERSION" label="Not recorded in this build." />
              </View>
            )}

            <ListRow
              title="Privacy policy"
              sub="What RunGuard collects, and who can see it"
              onPress={() => router.push("/privacy")}
              chevron
              isLast
            />
          </List>

          {/*
            The line the whole product is built around, in plain type, as the
            group's footer — where iOS puts the sentence that qualifies a group.
            It is NOT styled as a SafetyNotice: that component belongs to safety-
            intercepted chat replies alone, and spending its shape on a footer
            would blunt it where it matters.
          */}
          <Text style={styles.disclaimer}>
            RunGuard is a monitoring signal, not medical advice. It describes what
            your runs, sleep and check-ins show. It does not diagnose anything, and
            it is not a substitute for your coach, an athletic trainer or a doctor.
          </Text>
        </View>

        {/* ---- Danger zone --------------------------------------------- */}
        {/*
          Prose plus one button, so a `Panel` and not a `List`. A grouped list
          would render the red action as a bare centred row, which is the iOS
          idiom but costs the paragraph — and "your data stays on the server" is
          the reassurance that actually matters before tapping it.

          "Unpair this device" was the old title, and it asked the athlete to
          know what pairing is. It is the app's word for its own plumbing — the
          device token in the keychain — not a thing a 16-year-old came here to
          do. They came to sign out. The mechanism is still described in the
          body, where it belongs.

          In the demo it is a different act entirely: nothing was paired, there
          is nothing to sign out of, and everything the visitor typed lived on
          this phone. Saying "sign out" there would imply an account they never
          made.
        */}
        {demo ? (
          <Panel title="Athlete demo" note="Nothing here is saved">
            <Text style={styles.body}>
              You are looking at a real seeded runner&apos;s training as an
              athlete would see it. Anything you change stays on this phone and
              is never sent — the roster on the server is untouched. The coach
              side of the demo lives on the RunGuard website.
            </Text>

            <Pressable
              onPress={confirmUnpair}
              disabled={unpairing}
              accessibilityRole="button"
              accessibilityState={{ disabled: unpairing }}
              style={({ pressed }) => [styles.danger, dim(pressed)]}
            >
              <Text style={styles.dangerLabel}>
                {unpairing ? "Leaving…" : "Leave the demo"}
              </Text>
            </Pressable>
          </Panel>
        ) : (
          <Panel title="Sign out" note="Affects this phone only">
            <Text style={styles.body}>
              Signing out removes this phone&apos;s pairing from its keychain.
              Nothing on the RunGuard server changes — your runs, check-ins and
              history stay exactly as they are. To use the app again you will
              need your email and password, or a pairing code from the web app.
            </Text>

            <Pressable
              onPress={confirmUnpair}
              disabled={unpairing}
              accessibilityRole="button"
              accessibilityState={{ disabled: unpairing }}
              style={({ pressed }) => [styles.danger, dim(pressed)]}
            >
              <Text style={styles.dangerLabel}>
                {unpairing ? "Signing out…" : "Sign out"}
              </Text>
            </Pressable>
          </Panel>
        )}
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

  body: { ...text.base, color: color.ink2 },
  /**
   * A group footer: the same left inset as `List`'s header, so the caveat lines
   * up with the group it qualifies rather than floating at the page edge.
   */
  disclaimer: {
    ...text.meta,
    color: color.ink2,
    paddingTop: space.md,
    paddingHorizontal: layout.cardPadding,
  },

  /**
   * Destructive, and therefore NOT the ember: the ember is the brand's yes, and
   * this is the one action in the app that undoes the athlete's setup. An
   * outline in `unusual` with the `unusualText` glyph (5.18:1 on card) reads as
   * serious without shouting, and carries no fill that a mis-tap could ride.
   *
   * Pressed state is `dim`, not the row wash it used to paint. This is an
   * OBJECT, not a surface: theme/press.ts draws that line, and a button that
   * fills on press is the row language borrowed by something that is not a row.
   */
  danger: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    marginTop: space.sm,
    borderWidth: ruleWidth,
    borderColor: color.unusual,
    borderRadius: radius.control,
    borderCurve: "continuous",
  },
  dangerLabel: { ...text.baseSemi, color: color.unusualText },
});
