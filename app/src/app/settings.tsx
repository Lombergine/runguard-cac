/**
 * Settings. A STACK route, not a tab — the tab bar's four items are the daily
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
 * renders, logs or hints at the device token. "Unpair" deletes it without ever
 * holding it.
 *
 * This screen sits inside the session gate (lib/session.tsx), so it exists only
 * while someone is signed in. It therefore states the signed-in case plainly and
 * carries no signed-out branch: there is no frame in which this file renders to
 * a signed-out phone.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import Constants from "expo-constants";
import Svg, { Path } from "react-native-svg";

import { Absent } from "../components/Nothing";
import { getHome, isUnauthorized } from "../lib/api";
import { useSession } from "../lib/session";
import { color, shadow } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * From app.json. Null in any runtime that does not embed the config rather than
 * a fabricated "1.0.0" — a version string that is wrong is worse than none when
 * someone is reporting a bug against it.
 */
const APP_VERSION = Constants.expoConfig?.version ?? null;

/** Coordinate grid the chevron is drawn on, matching the tab bar's glyphs. */
const GRID = 24;
const CHEVRON_SIZE = 20;
const CHEVRON = "M9.5 5.5 L16 12 L9.5 18.5";

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

/* ------------------------------------------------------------------ *
 * Panel — the website's hierarchy (website/src/components/athlete/tabs.tsx:22):
 * semibold title LEFT, muted note RIGHT, content beneath. The note is the
 * caveat.
 *
 * Copied rather than imported: `Panel` is a local shape in chat.tsx too, and
 * both files are screens rather than the component library. The type ramp is
 * chat.tsx's exactly (`text.meta` for title and note) so the two screens agree —
 * the theme has no 12px body step, and inventing one here to match the web's
 * text-xs would be a bare size, which the token rule forbids.
 * ------------------------------------------------------------------ */

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

function Divider() {
  return <View style={styles.divider} />;
}

function Chevron() {
  return (
    <Svg width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={CHEVRON}
        fill="none"
        stroke={color.muted}
        strokeWidth={(ruleWidth * GRID) / CHEVRON_SIZE}
      />
    </Svg>
  );
}

/** A row that goes somewhere. The only tappable row shape on this screen. */
function LinkRow({
  label,
  note,
  onPress,
}: {
  label: string;
  note: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={note}
      // `accentSoft` is the token's own named use — a pressed wash. No opacity
      // trick, and no ember fill: the ember marks the primary action, and every
      // row here is equally ordinary.
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowNote}>{note}</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

/**
 * A setting that exists but cannot be changed from here, or cannot be offered at
 * all. Deliberately NOT a Pressable and deliberately not a dimmed control: there
 * is nothing to press, so there is no affordance to dim. `reason` is required —
 * a disabled row without one is just a broken row.
 */
function StaticRow({
  label,
  value,
  reason,
}: {
  label: string;
  value: string;
  reason: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.eyebrow}>{label}</Text>
        <Text style={styles.staticValue}>{value}</Text>
        <Text style={styles.reason}>{reason}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useSession();
  const [name, setName] = useState<NameState>({ kind: "loading" });
  const [unpairing, setUnpairing] = useState(false);

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
      "Unpair this device?",
      "RunGuard will sign out of this phone. Your runs and check-ins stay on the server, and you can pair again with the token from the web app.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unpair", style: "destructive", onPress: unpair },
      ]
    );
  }, [unpair, unpairing]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Settings",
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.ink,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: text.title.fontFamily,
            fontSize: text.title.fontSize,
          },
        }}
      />

      <ScrollView contentContainerStyle={styles.page}>
        {/* ---- Account ------------------------------------------------- */}
        <Panel title="Account" note="This phone">
          {name.kind === "known" ? (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.eyebrow}>SIGNED IN AS</Text>
                <Text style={styles.value}>{name.name}</Text>
              </View>
            </View>
          ) : name.kind === "loading" ? (
            // Reserves the same height as the row above, so nothing jumps when
            // the name lands. Not a spinner: it is one line of text arriving.
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.eyebrow}>SIGNED IN AS</Text>
                <Text style={styles.loading}>Loading…</Text>
              </View>
            </View>
          ) : (
            <View style={styles.absentRow}>
              <Absent eyebrow="SIGNED IN AS" label="Could not reach the server." />
            </View>
          )}

          <Divider />
          <LinkRow
            label="Profile"
            note="School, events, team and max heart rate"
            onPress={() => router.push("/profile")}
          />
          <Divider />
          <LinkRow
            label="Connect data"
            note="Where your runs, sleep and heart rate come from"
            onPress={() => router.push("/connect")}
          />
        </Panel>

        {/* ---- Units --------------------------------------------------- */}
        {/*
          Read-only on purpose. lib/units.ts is display-only and the server is
          metric throughout, but each formatter has miles written into it and
          welds "mi" on itself — there is no preference to read and no caller
          that could pass one. A real toggle is a change to units.ts, to a new
          stored preference, and to every screen that formats a distance or a
          pace, so it is more than a display-layer change and it is not offered
          as one.
        */}
        <Panel title="Units" note="Display only">
          <StaticRow
            label="DISTANCE"
            value="Miles"
            reason="The server records kilometres; the app converts them on the way to the screen."
          />
          <Divider />
          <StaticRow
            label="PACE"
            value="Minutes per mile"
            reason="Kilometres are not a setting yet — the conversion is written into the app rather than read from a preference, so there is nothing here to switch."
          />
        </Panel>

        {/* ---- Notifications ------------------------------------------- */}
        {/*
          The single biggest open problem in the product — 10 of 14 athletes do
          not report — and the honest row is still the empty one. There are no
          APNs credentials and expo-notifications is not installed, so this build
          cannot deliver a reminder by any route. A switch here would be the one
          setting an athlete would actually rely on, and it would silently do
          nothing.
        */}
        <Panel title="Notifications" note="Not available in this build">
          <StaticRow
            label="CHECK-IN REMINDER"
            value="Off"
            reason="RunGuard cannot send notifications yet — nothing in this build can deliver one, so there is no switch to turn on. Until then the check-in waits for you on the home screen."
          />
        </Panel>

        {/* ---- About --------------------------------------------------- */}
        <Panel title="About" note="RunGuard">
          {APP_VERSION ? (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.eyebrow}>VERSION</Text>
                <Text style={styles.version}>{APP_VERSION}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.absentRow}>
              <Absent eyebrow="VERSION" label="Not recorded in this build." />
            </View>
          )}

          <Divider />
          <LinkRow
            label="Privacy policy"
            note="What RunGuard collects, and who can see it"
            onPress={() => router.push("/privacy")}
          />
          <Divider />
          {/*
            The line the whole product is built around, in plain type. It is NOT
            styled as a SafetyNotice: that component belongs to safety-
            intercepted chat replies alone, and spending its shape on a footer
            would blunt it where it matters.
          */}
          <Text style={styles.disclaimer}>
            RunGuard is a monitoring signal, not medical advice. It describes what
            your runs, sleep and check-ins show. It does not diagnose anything, and
            it is not a substitute for your coach, an athletic trainer or a doctor.
          </Text>
        </Panel>

        {/* ---- Danger zone --------------------------------------------- */}
        <Panel title="Unpair this device" note="Affects this phone only">
          <Text style={styles.body}>
            Unpairing removes this phone&apos;s pairing from its keychain and signs
            the app out. Nothing on the RunGuard server changes — your runs,
            check-ins and history stay exactly as they are. To use the app again
            you will need the token from the web app.
          </Text>

          <Pressable
            onPress={confirmUnpair}
            disabled={unpairing}
            accessibilityRole="button"
            accessibilityState={{ disabled: unpairing }}
            style={({ pressed }) => [
              styles.danger,
              pressed && styles.dangerPressed,
            ]}
          >
            <Text style={styles.dangerLabel}>
              {unpairing ? "Unpairing…" : "Unpair this device"}
            </Text>
          </Pressable>
        </Panel>
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

  /* Panel — same surface as chat.tsx's, minus the horizontal margin, which the
     page inset already supplies here. */
  panel: {
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
  /** The caveat. Always right, always muted (5.16:1 on card). */
  panelNote: { ...text.meta, color: color.muted },

  /* Rows */
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: target.min,
    paddingVertical: space.sm,
    // Pulled out to the panel's edge so the pressed wash reads as a full row
    // rather than a floating patch, then padded back in.
    marginHorizontal: -layout.cardPadding,
    paddingHorizontal: layout.cardPadding,
    borderRadius: radius.control,
  },
  rowPressed: { backgroundColor: color.accentSoft },
  rowBody: { flex: 1, gap: space.xs },
  rowLabel: { ...text.baseSemi, color: color.ink },
  rowNote: { ...text.meta, color: color.muted },
  eyebrow: { ...text.micro, color: color.muted },
  value: { ...text.base, color: color.ink },
  /** A setting that is fixed: stated in ink, because it is a real current value. */
  staticValue: { ...text.baseSemi, color: color.ink },
  /** Why it cannot be changed, or why it is not offered. */
  reason: { ...text.meta, color: color.ink2 },
  /** In flight. Muted, so it cannot be mistaken for the answer. */
  loading: { ...text.base, color: color.muted },
  /** A numeral, so mono and tabular — text.stat is the app's figure style. */
  version: { ...text.stat, color: color.ink },
  /** Absent is a block, not a line: give it the row's vertical rhythm. */
  absentRow: { paddingVertical: space.sm },

  divider: {
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
    marginHorizontal: -layout.cardPadding,
  },

  body: { ...text.base, color: color.ink2 },
  disclaimer: { ...text.meta, color: color.ink2, paddingTop: space.sm },

  /**
   * Destructive, and therefore NOT the ember: the ember is the brand's yes, and
   * this is the one action in the app that undoes the athlete's setup. An
   * outline in `unusual` with the `unusualText` glyph (5.18:1 on card) reads as
   * serious without shouting, and carries no fill that a mis-tap could ride.
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
  },
  dangerPressed: { backgroundColor: color.well },
  dangerLabel: { ...text.baseSemi, color: color.unusualText },
});
