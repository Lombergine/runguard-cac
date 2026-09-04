/**
 * The training calendar. The native twin of the website's `/dashboard/plan`.
 *
 * A week at a time rather than the web's four. The web page's own reasoning is
 * that "a season is planned in blocks and a single week is not enough to see a
 * build or a taper taking shape" — true on a desktop grid, and not achievable
 * on a 402pt phone without shrinking a day to a cell too small to read a
 * session out of, let alone tap. So the phone takes the other half of the job:
 * a coach plans the block at a desk and adjusts THIS week from the track. The
 * arrows move by whole weeks, so the season is still reachable, just not all at
 * once.
 *
 * ── WHAT WRITING A DAY MEANS ───────────────────────────────────────────────
 * A written day REPLACES the generated template for every athlete on the team
 * (the coach-wins rule in engine.ts weeklyPlan), and clearing it hands the day
 * back to the generator. There is no third state: absence is the default and
 * DELETE restores absence. That is why "Clear" is worded as handing the day
 * back rather than as deleting something — nothing is lost, the generator
 * simply resumes.
 *
 * ── DATES ──────────────────────────────────────────────────────────────────
 * Every date on screen is a pre-formatted local string, and the ISO keys are
 * built from a local Date. The server validates the shape again and rejects a
 * rolled-over day like "2026-02-31", which the Date constructor would silently
 * turn into March 3 — a coach would write a session and find it on a day they
 * did not choose.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../../../components/Card";
import { Press } from "../../../components/Press";
import { ApiError } from "../../../lib/api";
import {
  clearPlanDay,
  getPlan,
  putPlanDay,
  type TeamPlanDay,
} from "../../../lib/coachApi";
import { useSession } from "../../../lib/session";
import { fmtMiles } from "../../../lib/units";
import { color, shadow } from "../../../theme/tokens";
import { font, tabular, text } from "../../../theme/type";
import { layout, radius, ruleWidth, space, target } from "../../../theme/space";

/** Miles → metres, for the one field a coach types in miles. */
const METRES_PER_MILE = 1609.344;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Local `YYYY-MM-DD`. Never `toISOString`, which is UTC and shifts the day. */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The Monday of the week containing `d`, shifted by whole weeks. */
function mondayOf(d: Date, weekOffset: number): Date {
  const copy = new Date(d);
  // getDay(): 0 = Sunday. Monday-first means Sunday belongs to the week before.
  const shift = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - shift + weekOffset * 7);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

/** "Mon, 31 Aug" — explicit and local, per the spec's date rule. */
function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Just the day and month: "31 Aug".
 *
 * A second formatter rather than string-surgery on `dayLabel`. Stripping the
 * weekday with a regex assumed a format the locale does not promise — on this
 * device `dayLabel` renders "Mon, Aug 31", the `^[A-Za-z]+ ` pattern did not
 * match "Mon, ", and the row header read "MON · MON, AUG 31". Asking Intl for
 * the fields wanted cannot be wrong in a locale nobody tested.
 */
function dayMonth(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Draft = {
  date: string;
  label: string;
  type: string;
  miles: string;
  targetPace: string;
  details: string;
  existing: boolean;
};

export default function CoachPlanScreen() {
  const { signOutCoach } = useSession();

  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<Record<string, TeamPlanDay> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * ONE clock read, held for the life of the screen.
   *
   * `mondayOf(new Date(), ...)` inline looked equivalent and was not: it reads
   * the clock on EVERY render, so `from`/`to` were fresh strings each time,
   * `load` was a new callback each time, and the effect that depends on it
   * re-fired forever — a refetch loop on the coach's calendar. Anchoring the
   * week on a value captured once makes the range change only when the coach
   * actually moves it.
   */
  const [anchorMs] = useState(() => Date.now());
  const { dates, from, to, todayIso } = useMemo(() => {
    const monday = mondayOf(new Date(anchorMs), weekOffset);
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
    return {
      dates: week,
      from: isoDay(week[0]),
      to: isoDay(week[6]),
      todayIso: isoDay(new Date(anchorMs)),
    };
  }, [anchorMs, weekOffset]);

  const load = useCallback(async () => {
    try {
      const res = await getPlan(from, to);
      setDays(res.days);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load the calendar.");
    }
  }, [from, to, signOutCoach]);

  useEffect(() => {
    // Async closure so state settles after an await rather than synchronously
    // off the mount. Same shape connect.tsx uses.
    void (async () => {
      await load();
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function open(d: Date) {
    const iso = isoDay(d);
    const existing = days?.[iso];
    setSaveError(null);
    setDraft({
      date: iso,
      label: dayLabel(d),
      type: existing?.type ?? "",
      // Metres on the wire, miles in the field: a coach thinks in miles and
      // every other figure in this app is rendered in them.
      miles:
        existing?.distance_m == null
          ? ""
          : String(Math.round((existing.distance_m / METRES_PER_MILE) * 10) / 10),
      targetPace: existing?.target_pace ?? "",
      details: existing?.details ?? "",
      existing: existing !== undefined,
    });
  }

  async function save() {
    if (!draft || saving) return;
    const type = draft.type.trim();
    if (!type) {
      setSaveError("Give the session a name.");
      return;
    }
    // Empty means "no distance stated", not zero. A 0 here would print "0 mi"
    // on fourteen phones as though it had been planned.
    let distanceM: number | null = null;
    if (draft.miles.trim() !== "") {
      const n = Number(draft.miles);
      if (!Number.isFinite(n) || n < 0) {
        setSaveError("That distance is not a number.");
        return;
      }
      distanceM = Math.round(n * METRES_PER_MILE);
    }
    setSaving(true);
    setSaveError(null);
    try {
      await putPlanDay({
        date: draft.date,
        type,
        distanceM,
        targetPace: draft.targetPace.trim() || null,
        details: draft.details.trim() || null,
      });
      setDraft(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await clearPlanDay(draft.date);
      setDraft(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not clear the day.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>TRAINING CALENDAR</Text>
        <Text style={styles.title}>
          {dayLabel(dates[0])} – {dayLabel(dates[6])}
        </Text>
      </View>

      <View style={styles.weekNav}>
        <Press
          onPress={() => setWeekOffset((w) => w - 1)}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          style={styles.navBtn}
          pressedStyle={styles.pressed}
        >
          <Text style={styles.navLabel}>← Previous</Text>
        </Press>
        {weekOffset === 0 ? null : (
          <Press
            onPress={() => setWeekOffset(0)}
            accessibilityRole="button"
            accessibilityLabel="Back to this week"
            style={styles.navBtn}
            pressedStyle={styles.pressed}
          >
            <Text style={styles.navLabelActive}>This week</Text>
          </Press>
        )}
        <Press
          onPress={() => setWeekOffset((w) => w + 1)}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          style={styles.navBtn}
          pressedStyle={styles.pressed}
        >
          <Text style={styles.navLabel}>Next →</Text>
        </Press>
      </View>

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <Card>
            <Text style={styles.blockTitle}>Could not load the calendar</Text>
            <Text style={styles.body}>{error}</Text>
          </Card>
        ) : days === null ? (
          <View style={styles.skeleton} />
        ) : (
          dates.map((d, i) => {
            const iso = isoDay(d);
            const written = days[iso];
            const isToday = iso === todayIso;
            return (
              <Press
                key={iso}
                onPress={() => open(d)}
                accessibilityRole="button"
                accessibilityLabel={`${written ? "Edit" : "Add"} the session for ${dayLabel(d)}`}
                style={[
                  styles.day,
                  !written && styles.dayEmpty,
                  isToday && styles.dayToday,
                ]}
                pressedStyle={styles.pressed}
              >
                <View style={styles.dayHead}>
                  <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                    {WEEKDAYS[i]} · {dayMonth(d)}
                  </Text>
                  {isToday ? <Text style={styles.todayTag}>TODAY</Text> : null}
                </View>

                {written ? (
                  <>
                    <Text style={styles.sessionType}>
                      {written.type}
                      {written.distance_m == null
                        ? ""
                        : ` · ${fmtMiles(written.distance_m / 1000)}`}
                      {written.target_pace ? ` · ${written.target_pace}` : ""}
                    </Text>
                    {written.details ? (
                      <Text style={styles.sessionBody} numberOfLines={2}>
                        {written.details}
                      </Text>
                    ) : null}
                    {written.updated_by ? (
                      <Text style={styles.byline}>Written by {written.updated_by}</Text>
                    ) : null}
                  </>
                ) : (
                  /*
                   * Dotted, not dashed. This is the spec's NO-RUN state — rest,
                   * or nothing written — and it must not wear the dashed
                   * treatment, which means "we don't know". Nothing is unknown
                   * here: no session written is a fact, and the athletes see
                   * their generated plan for it.
                   */
                  <Text style={styles.empty}>
                    Nothing written · athletes see their generated plan
                  </Text>
                )}
              </Press>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={draft !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDraft(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.eyebrow}>{draft?.label.toUpperCase()}</Text>
              <Text style={styles.sheetTitle}>
                {draft?.existing ? "Edit the session" : "Write a session"}
              </Text>
              <Text style={styles.sheetBlurb}>
                This replaces the generated plan for every athlete on the team.
              </Text>

              <Text style={styles.label}>Session</Text>
              <TextInput
                style={styles.input}
                value={draft?.type ?? ""}
                onChangeText={(v) => setDraft((d) => (d ? { ...d, type: v } : d))}
                placeholder="Easy run"
                placeholderTextColor={color.placeholder}
                editable={!saving}
                accessibilityLabel="Session name"
              />

              <View style={styles.row}>
                <View style={styles.rowHalf}>
                  <Text style={styles.label}>Distance (mi)</Text>
                  <TextInput
                    style={styles.input}
                    value={draft?.miles ?? ""}
                    onChangeText={(v) => setDraft((d) => (d ? { ...d, miles: v } : d))}
                    placeholder="5"
                    placeholderTextColor={color.placeholder}
                    keyboardType="decimal-pad"
                    editable={!saving}
                    accessibilityLabel="Distance in miles"
                  />
                </View>
                <View style={styles.rowHalf}>
                  <Text style={styles.label}>Target pace</Text>
                  <TextInput
                    style={styles.input}
                    value={draft?.targetPace ?? ""}
                    onChangeText={(v) => setDraft((d) => (d ? { ...d, targetPace: v } : d))}
                    placeholder="8:30/mi"
                    placeholderTextColor={color.placeholder}
                    editable={!saving}
                    accessibilityLabel="Target pace"
                  />
                </View>
              </View>

              <Text style={styles.label}>Details</Text>
              <TextInput
                style={[styles.input, styles.inputTall]}
                value={draft?.details ?? ""}
                onChangeText={(v) => setDraft((d) => (d ? { ...d, details: v } : d))}
                placeholder="Conversational the whole way. Meet at the track."
                placeholderTextColor={color.placeholder}
                multiline
                editable={!saving}
                accessibilityLabel="Session details"
              />

              {saveError ? (
                <View style={styles.error} accessibilityRole="alert">
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              ) : null}

              <Press
                onPress={save}
                disabled={saving}
                accessibilityRole="button"
                style={[styles.primary, saving && styles.primaryOff]}
                scale={false}
                pressedStyle={styles.pressed}
              >
                <Text style={styles.primaryLabel}>
                  {saving ? "Saving…" : draft?.existing ? "Save changes" : "Write it"}
                </Text>
              </Press>

              {draft?.existing ? (
                <Press
                  onPress={clear}
                  disabled={saving}
                  accessibilityRole="button"
                  style={styles.secondary}
                  pressedStyle={styles.pressed}
                >
                  {/* Worded as handing the day back, not deleting: nothing is
                      lost, the generator simply resumes. */}
                  <Text style={styles.secondaryLabel}>
                    Clear · hand the day back to the generator
                  </Text>
                </Press>
              ) : null}

              <Press
                onPress={() => setDraft(null)}
                disabled={saving}
                accessibilityRole="button"
                style={styles.secondary}
                pressedStyle={styles.pressed}
              >
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </Press>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** A surface under the finger. Survives Reduce Motion, where scale does not. */
  pressed: { backgroundColor: color.press },
  safe: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: layout.page, paddingBottom: space.sm },
  eyebrow: { ...text.micro, color: color.muted },
  title: { ...text.title, color: color.ink, marginTop: space.xs },

  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.page,
    paddingBottom: space.md,
    gap: space.sm,
  },
  navBtn: { minHeight: target.min, justifyContent: "center", paddingHorizontal: space.sm },
  navLabel: { ...text.meta, color: color.ink2 },
  navLabelActive: { ...text.meta, color: color.brandText },

  page: { paddingHorizontal: layout.page, paddingBottom: space.xxxl, gap: space.md },
  skeleton: { height: 420, borderRadius: radius.card, backgroundColor: color.well },

  day: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  /** Dotted and unfilled: the spec's NO-RUN, never the dashed unknown. */
  dayEmpty: {
    backgroundColor: "transparent",
    borderStyle: "dotted",
    borderColor: color.rule,
    shadowOpacity: 0,
    elevation: 0,
  },
  /** Today is the only ember on this screen. */
  dayToday: { borderLeftWidth: 3, borderLeftColor: color.brandStrong },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayName: { ...text.micro, color: color.muted },
  dayNameToday: { color: color.brandText },
  todayTag: { ...text.micro, color: color.brandText },
  sessionType: { ...text.baseSemi, color: color.ink, marginTop: space.sm },
  sessionBody: { ...text.meta, color: color.ink2, marginTop: space.xs },
  /* A sentence, not a label — the tracked-out caps voice belongs on the
     screen eyebrow and the day header, not on prose. */
  byline: { ...text.meta, color: color.muted, marginTop: space.sm },
  empty: { ...text.meta, color: color.muted, marginTop: space.sm },

  blockTitle: { ...text.title, color: color.ink },
  body: { ...text.base, color: color.ink2, marginTop: space.sm },

  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(34,29,21,0.35)" },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: layout.page,
    maxHeight: "88%",
  },
  sheetTitle: { ...text.title, color: color.ink, marginTop: space.xs },
  sheetBlurb: { ...text.meta, color: color.ink2, marginTop: space.xs },
  label: { ...text.micro, color: color.muted, marginTop: space.lg, marginBottom: space.sm },
  input: {
    ...text.base,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    minHeight: target.min,
  },
  inputTall: { minHeight: 96, paddingTop: space.md, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: space.md },
  rowHalf: { flex: 1 },

  error: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.control,
    borderWidth: ruleWidth,
    borderColor: color.unusualText,
    backgroundColor: color.well,
  },
  errorText: { ...text.meta, color: color.unusualText },

  primary: {
    marginTop: space.xl,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.brand,
  },
  primaryOff: { opacity: 0.6 },
  // `ink`, never white: the ember is 5.9:1 against ink and 1.7:1 against white.
  primaryLabel: { fontFamily: font.bodySemi, fontSize: 16.5, color: color.onBrand },
  secondary: { minHeight: target.min, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { ...text.meta, color: color.muted },

  score: { fontFamily: font.mono, ...tabular },
});
