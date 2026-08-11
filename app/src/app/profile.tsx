/**
 * Profile — who the athlete is, what team they are on, what HRmax their
 * training is scored against, and the fact that this phone is the paired
 * device.
 *
 * A STACK route, not a tab. The bar has four items deliberately and this is not
 * one of them; `chat.tsx` is the precedent for a pushed route with its own
 * header. Nothing links here yet — the nav entry has to be added by whoever
 * owns `(tabs)/_layout.tsx`.
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
 *     Keychain for display — `clearToken()` is the only auth call it makes, and
 *     `lib/api` has already stripped `athlete.deviceToken` from the payload
 *     before it arrives. What replaces the panel is a statement of fact
 *     ("paired") and a way out (Unpair).
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
 *
 * On the data layer: this screen mutates, and `lib/api` — which this segment
 * does not own — exposes no join-team, no leave-team, no HRmax call, and no
 * DELETE at all. `mutate()` below is that module's `request()` narrowed to the
 * three writes this screen makes; fold it into the client and delete it once
 * the client grows them.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { ApiError, BASE_URL, getProfile, isUnauthorized } from "../lib/api";
import { clearToken, getToken } from "../lib/auth";
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

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

/**
 * The three writes, sharing `request()`'s contract: Bearer from the Keychain,
 * fail closed with no token, one timeout, and NEVER a token in an error.
 *
 * The server's own message is carried through verbatim, because these routes
 * write the sentence the athlete needs — the HRmax bounds
 * (website/src/app/api/hrmax/route.ts) and "That team code doesn't match any
 * team." (website/src/app/api/athlete/join-team/route.ts). Restating either one
 * client-side is how the two drift.
 */
async function mutate(
  path: string,
  method: "POST" | "DELETE",
  body?: unknown
): Promise<void> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "This device isn't paired to an athlete.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // The thrown value can echo the request, Authorization header included.
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then((j: unknown) =>
        j && typeof j === "object" && typeof (j as { error?: unknown }).error === "string"
          ? (j as { error: string }).error
          : null
      )
      .catch(() => null);
    throw new ApiError(res.status, detail ?? `Request failed (${res.status}).`);
  }
}

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
 * for `teamName`, so the screen refetches instead. Until that refetch lands the
 * panel stays in its old state rather than optimistically claiming a team —
 * `setAthleteTeam` is the server's write, and this screen does not know it
 * happened until the server says so.
 */
function TeamPanel({
  athlete,
  onChanged,
}: {
  athlete: AppProfile["athlete"];
  onChanged: () => Promise<void>;
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
      await mutate("/api/athlete/join-team", "POST", { joinCode: entered });
      setCode("");
      await onChanged();
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
      await mutate("/api/athlete/join-team", "DELETE");
      await onChanged();
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
 * The number every run's intensity is scored against, and the only place in the
 * app the athlete can correct it.
 *
 * The 400 the route returns names its own bounds. That message is shown
 * verbatim rather than being pre-empted with a client-side range check: the
 * constants live in website/src/lib/hrmax.ts, and a second copy here would keep
 * telling the athlete the old range for as long as it took anyone to notice.
 */
function HrMaxPanel({
  hrMax,
  onChanged,
}: {
  hrMax: AppProfile["risk"]["hrMax"];
  onChanged: () => Promise<void>;
}) {
  const [entry, setEntry] = useState(hrMax ? String(hrMax.value) : "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(value: number | null) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await mutate("/api/hrmax", "POST", { hrMax: value });
      await onChanged();
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
          This is an estimate, not something measured on you. Every run&apos;s intensity,
          your training load and your workload ratio are all scored against it, so a real
          figure from a test or an all-out race is worth entering.
        </Text>
      ) : (
        <Text style={styles.body}>
          Every run&apos;s intensity is scored against this number, so it feeds your
          training load and your workload ratio.
        </Text>
      )}
      <View style={styles.hrRow}>
        <TextInput
          style={styles.hrInput}
          value={entry}
          onChangeText={setEntry}
          keyboardType="number-pad"
          inputMode="numeric"
          editable={!busy}
          placeholder="bpm"
          placeholderTextColor={color.muted}
          accessibilityLabel="Max heart rate in beats per minute"
        />
        <EmberButton
          label={busy ? "Saving…" : "Save"}
          onPress={() => send(Number(entry))}
          disabled={busy || entry.trim().length === 0}
        />
      </View>
      {isSet ? (
        <QuietButton
          label="Use automatic"
          onPress={() => send(null)}
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
 * Unpairing is confirmed because it is not reversible from here — the token
 * cannot be re-derived on the device, so getting back in means fetching it from
 * the web app again, which an athlete standing on a track at 6am cannot do.
 * Renders whether or not the profile loaded: a device whose token the server
 * rejects is exactly a device that needs this control.
 */
function DevicePanel() {
  const router = useRouter();

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
              try {
                await clearToken();
              } catch {
                // SecureStore can reject on a locked keychain, and the error
                // object may carry the value — swallowed, exactly as lib/auth
                // swallows it. Pairing again overwrites the entry anyway.
              }
              router.replace("/pair");
            })();
          },
        },
      ]
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
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loadError, setLoadError] = useState<"none" | "unpaired" | "failed">("none");

  /**
   * The whole profile, refetched after every write. `/me` is the only endpoint
   * carrying `events`, `fitness.tier` and `risk.hrMax`, and it is 57 KB — a
   * cost this screen pays once on entry and once per change, which is a handful
   * of times in a season.
   */
  const load = useCallback(async () => {
    try {
      setProfile((await getProfile()) as AppProfile);
      setLoadError("none");
    } catch (err) {
      setLoadError(isUnauthorized(err) ? "unpaired" : "failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        >
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

              <TeamPanel athlete={profile.athlete} onChanged={load} />
              <HrMaxPanel hrMax={profile.risk.hrMax} onChanged={load} />
            </>
          ) : loadError === "none" ? (
            // Nothing to say while the first fetch is in flight. No spinner:
            // the panels below it must not shift when the data lands.
            null
          ) : (
            <Panel
              title="Your profile"
              note={loadError === "unpaired" ? "Not paired" : "Could not load"}
            >
              <Text style={styles.body}>
                {loadError === "unpaired"
                  ? "This device isn't paired to an athlete, so there is nothing to show."
                  : "Your profile couldn't be loaded. Nothing here has changed."}
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
  },
  quietLabel: { ...text.baseSemi, color: color.ink2 },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2 },
});
