/**
 * Training calendar — the week the team is running, and the editor that writes
 * it.
 *
 * ── THE DESIGN PROMISES AN EDITOR AND DOES NOT DRAW ONE ────────────────────
 *
 * Its subtitle reads "Write the session; the team sees it" over seven read-only
 * rows. That is the same lie docs/design-port.md #22 rejected on the profile —
 * a control that opens nothing — one size larger, because here the copy states
 * the capability outright. So the rows push a real editor, in the app's own
 * idiom: a `pageSheet` modal, as `(tabs)/index.tsx` uses for the check-in.
 *
 * The write goes to `POST /api/mobile/coach/plan`, modelled field for field on
 * the web's `/api/team-plan` (website/src/app/api/team-plan/route.ts), which is
 * the handler the mobile route mirrors. **Distance crosses the wire in MILES,
 * as `distanceMi`, and comes back in METRES as `distanceM`** — that asymmetry is
 * the web route's, deliberately: "the coach types miles because that is what an
 * American high-school coach says out loud, and every other distance in the
 * database is metres… doing the conversion here rather than in the browser means
 * a second client — the phone, a script — cannot get the unit wrong."
 *
 * The write is `saveCoachPlanDay` in `lib/api.ts`, beside the four coach reads.
 * Going through that module's `request()` is what makes the coach demo work: a
 * non-GET is recorded locally and resolves without leaving the phone, so Save
 * does not throw at someone being shown the app.
 *
 * ── WHAT THE DESIGN DRAWS THAT THIS DOES NOT ───────────────────────────────
 *
 *  1. TODAY'S ACCENT WASH. `color.accentSoft` is `#FDECC8`, a raw literal and
 *     NOT one of tokens.ts's `dyn()` pairs — its docblock scopes it to "a bar
 *     track or a pressed state", i.e. surfaces with no type on them. Painting a
 *     row with it puts dark-mode ink (`#F6F2EB`) on a cream ground at about
 *     1.05:1: invisible. Today's row takes the neutral system `fill`, which does
 *     follow the appearance, and the day is NAMED — "today" in the date column —
 *     so the state survives greyscale rather than resting on a tint.
 *  2. SEVEN ROWS AND NOTHING ELSE FOR AN UNWRITTEN WEEK. The GET's own docblock:
 *     "Only days a coach actually wrote come back. A date with no entry is
 *     absent from `days`, and that is not the same as a rest day… A blank must
 *     never read as a value." An unwritten day says so, in the unknown colour,
 *     with the em dash the whole app uses for absence — never "Rest".
 *  3. HARDCODED FIGURES. Every distance below is `distanceM` through
 *     lib/units.ts, and the week label is built from the payload's own `from`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { Card } from "../../components/Card";
import { Chevron } from "../../components/List";
import { Section } from "../../components/Section";
import { TabScreen } from "../../components/TabScreen";
import {
  getCoachPlan,
  saveCoachPlanDay,
  type CoachPlan,
  type CoachPlanDay,
  type CoachPlanWrite,
} from "../../lib/api";
import { isDemo, writesTo } from "../../lib/demo";
import { dayLabel, localDay, parseLocalDay } from "../../lib/dates";
import { M_PER_MI, miNumFromMeters } from "../../lib/units";
import { dim, rowPress } from "../../theme/press";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/** The date column. `target.min - space.md` is 36; the design draws 38. */
/*
 * Wide enough for the longest label the column can hold, which is "Today" —
 * not the three-letter abbreviations it was sized for. At `target.min - md`
 * (36) the word wrapped to "TODA / Y" on the one row a coach looks at first.
 * `text.micro` is mono and tracked +0.12em, so five characters need about 40.
 */
const DATE_COL = target.min;

/** Row height floor, and what a skeleton reserves. */
const ROW_H = target.row + space.md;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The website's `--ember` stops and its 135°, exactly as `login.tsx` lays them. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.placeholder}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        accessibilityLabel={label}
        style={[styles.input, multiline ? styles.inputTall : null]}
      />
    </View>
  );
}

function Editor({
  date,
  dateText,
  existing,
  onClose,
  onSaved,
}: {
  date: string;
  /** Pre-formatted by the screen. A component never derives a date. */
  dateText: string;
  existing: CoachPlanDay | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(existing?.type ?? "");
  const [distance, setDistance] = useState(
    existing?.distanceM != null ? String(miNumFromMeters(existing.distanceM)) : ""
  );
  const [pace, setPace] = useState(existing?.targetPace ?? "");
  const [details, setDetails] = useState(existing?.details ?? "");
  const [why, setWhy] = useState(existing?.why ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const raw = distance.trim();
      const mi = raw === "" ? null : Number(raw);
      if (mi !== null && (!Number.isFinite(mi) || mi < 0 || mi > 60)) {
        setError("Distance must be a number of miles between 0 and 60.");
        setSaving(false);
        return;
      }
      await saveCoachPlanDay({
        date,
        type: type.trim(),
        // 0 is not a distance anyone planned; the web route reads it as "leave
        // the day without one", and blank means the same thing. Sent as null so
        // the two clients agree.
        distanceMi: mi !== null && mi > 0 ? mi : null,
        targetPace: pace.trim() || null,
        details: details.trim() || null,
        why: why.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The session could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const canSave = type.trim().length > 0 && !saving;

  return (
    <SafeAreaView style={styles.sheet} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.sheetPage} keyboardDismissMode="on-drag">
        <Text style={styles.sheetEyebrow}>{dateText}</Text>
        <Text style={styles.sheetTitle}>
          {existing ? "Edit the session" : "Write the session"}
        </Text>
        <Text style={styles.sheetNote}>
          What you write here replaces RunGuard&apos;s suggestion for every
          athlete on the team that day.
        </Text>

        <Field
          label="Session"
          value={type}
          onChangeText={setType}
          placeholder="Easy run, 6×800m, Rest"
        />
        <Field
          label="Distance, miles"
          value={distance}
          onChangeText={setDistance}
          placeholder="Leave blank for no set distance"
          keyboardType="decimal-pad"
        />
        <Field
          label="Target pace"
          value={pace}
          onChangeText={setPace}
          placeholder="8:30/mi"
        />
        <Field
          label="Details"
          value={details}
          onChangeText={setDetails}
          placeholder="What the session is"
          multiline
        />
        <Field
          label="Why"
          value={why}
          onChangeText={setWhy}
          placeholder="Why it is on the calendar"
          multiline
        />

        {error ? <Text style={styles.sheetError}>{error}</Text> : null}

        {/* The app's one primary-action treatment, as `login.tsx` draws it:
            pressing drops the gradient to reveal the flat `brandStrong` ground
            beneath, which is a token rather than a hand-mixed press tint. */}
        <Pressable
          onPress={() => void save()}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Save this session"
          accessibilityState={{ disabled: !canSave }}
          style={[styles.save, canSave ? null : styles.saveOff]}
        >
          {({ pressed }) => (
            <>
              {pressed || !canSave ? null : (
                <LinearGradient
                  colors={color.ember}
                  locations={EMBER_STOPS}
                  start={EMBER_START}
                  end={EMBER_END}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Text style={canSave ? styles.saveLabel : styles.saveLabelOff}>
                {saving ? "Saving\u2026" : "Save"}
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
          style={({ pressed }) => [styles.cancel, dim(pressed)]}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function DayRow({
  date,
  day,
  isToday,
  isLast,
  onPress,
}: {
  date: string;
  day: CoachPlanDay | null;
  isToday: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const d = parseLocalDay(date);

  /*
   * The detail line, as NODES rather than one joined string.
   *
   * "5 mi" and "8:30/mi" are figures and every figure in this app is mono and
   * tabular (type.ts), while `details` is prose. Joining them into one `Text`
   * would set the two distances in the body face — the split between the two
   * voices is most of what makes a column of numbers read as numbers. Nested
   * inside the line the way `login.tsx`'s `figure` is, so each inherits the
   * line's size, leading and colour and changes only the face. Metres in, miles
   * out, through lib/units.ts: the payload's unit is metres.
   */
  const distance = day?.distanceM != null ? `${miNumFromMeters(day.distanceM)} mi` : null;
  const pace = day?.targetPace ?? null;
  const figures = [distance, pace].filter((x): x is string => x !== null);
  const prose = day?.details ?? null;
  const hasDetail = figures.length > 0 || prose !== null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(date)}, ${day ? day.type : "not written"}`}
      accessibilityHint="Opens the session editor for this day"
      style={({ pressed }) => [
        styles.row,
        isToday ? styles.rowToday : null,
        rowPress({ pressed }),
      ]}
    >
      <View style={styles.dateCol}>
        {/* "today" as a WORD, not only as a wash — see the file header. */}
        {/* `numberOfLines` so a future label cannot silently wrap again. */}
        <Text style={styles.dow} numberOfLines={1}>
          {isToday ? "Today" : DOW[d.getDay()]}
        </Text>
        <Text style={styles.dom}>{String(d.getDate())}</Text>
      </View>
      <View style={styles.rowBody}>
        {day ? (
          <>
            <Text style={styles.rowType}>{day.type}</Text>
            {hasDetail ? (
              <Text style={styles.rowDetail} numberOfLines={2}>
                {figures.map((f, i) => (
                  <Text key={f} style={styles.figure}>
                    {i === 0 ? f : ` · ${f}`}
                  </Text>
                ))}
                {prose ? (figures.length ? ` · ${prose}` : prose) : ""}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {/* Not written is not a rest day. The em dash is the app's absence
                mark and the sentence says what happens instead. */}
            <Text style={styles.rowUnwritten}>— not written</Text>
            <Text style={styles.rowDetail}>
              RunGuard fills this day per athlete.
            </Text>
          </>
        )}
      </View>
      <Chevron />
      {isLast ? null : <View style={styles.separator} pointerEvents="none" />}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export default function CalendarScreen() {

  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [week, setWeek] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      setPlan(await getCoachPlan());
      setFailed(null);
    } catch (err) {
      setFailed(
        err instanceof Error ? err.message : "The team calendar could not be loaded."
      );
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  /**
   * The first load, started once.
   *
   * The indirection through a ref is `lib/profileStore.tsx`'s `ensure()`, and it
   * is not ceremony: an effect that calls a fetch which sets state on its way in
   * is a cascading render, and the app's own store solves it exactly this way.
   * A remount — a tab revisited, a fast refresh — does not refire it; pull to
   * refresh is how a coach asks for new data.
   */
  const started = useRef(false);
  const ensure = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void load(false);
  }, [load]);

  useEffect(() => {
    ensure();
  }, [ensure]);

  /*
   * The route returns FOUR whole weeks from the Monday of this week, and
   * `getCoachPlan()` takes no `?week=`, so paging is a window onto the payload
   * that already arrived rather than a refetch. Prev and Next therefore stop at
   * the ends of that payload — bounded by the data, which is the honest place
   * for a pager to stop.
   */
  const weeks = plan?.weeks ?? 0;
  const dates = useMemo(() => {
    if (!plan?.from) return [];
    const start = parseLocalDay(plan.from);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + week * 7 + i);
      return localDay(d);
    });
  }, [plan, week]);

  /**
   * The week's written days, server first, then anything the demo is holding.
   *
   * ── WHY THE DEMO BRANCH IS HERE ─────────────────────────────────────────
   *
   * In the demo the POST never leaves the phone: `request()` records it and
   * resolves (`lib/demo.ts`). `onSaved` then calls `load(true)`, which refetches
   * the week the server still has — so without this the coach would write
   * Thursday, watch the sheet close, and see Thursday empty again. A demo where
   * saving silently does nothing is worse than one that refuses to save.
   *
   * The server refuses these writes too, independently and for real:
   * `resolveCoachTeam` rejects any non-GET for the demo team. That is the
   * guarantee; this is the part that keeps the demo worth looking at.
   *
   * MILES IN, METRES OUT — the same conversion `website/src/lib/teamPlan.ts`
   * does, through the same constant, because the wire carries what the coach
   * typed and `CoachPlanDay` carries what the column would hold. Zero becomes
   * null there and here: a rest day is a day with no distance, not a 0.0 mi one.
   */
  const written = useMemo(() => {
    const m = new Map<string, CoachPlanDay>();
    for (const d of plan?.days ?? []) m.set(d.date, d);

    if (isDemo()) {
      for (const body of writesTo("/api/mobile/coach/plan")) {
        const w = body as Partial<CoachPlanWrite> | null;
        if (!w || typeof w.date !== "string" || typeof w.type !== "string") continue;
        const mi = w.distanceMi == null || w.distanceMi === "" ? null : Number(w.distanceMi);
        m.set(w.date, {
          date: w.date,
          type: w.type,
          distanceM: mi !== null && Number.isFinite(mi) && mi > 0 ? mi * M_PER_MI : null,
          targetPace: w.targetPace ?? null,
          details: w.details ?? null,
          why: w.why ?? null,
        });
      }
    }
    return m;
  }, [plan]);

  const today = localDay();
  const weekLabel = dates.length
    ? `${dayLabel(dates[0])} – ${dayLabel(dates[6])}`
    : "";
  const writtenThisWeek = dates.filter((d) => written.has(d)).length;

  return (
    <>
      <TabScreen
        title="Training calendar"
        subtitle="Write the session; the team sees it"
        refreshing={refreshing}
        onRefresh={() => void load(true)}
      >
        {failed && !plan ? (
          <Card>
            <Text style={styles.emptyTitle}>The team calendar could not be loaded.</Text>
            <Text style={styles.emptyBody}>{failed}</Text>
            <Pressable
              onPress={() => void load(false)}
              accessibilityRole="button"
              accessibilityLabel="Try loading the calendar again"
              style={({ pressed }) => [styles.retry, dim(pressed)]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        ) : !plan ? (
          <View style={styles.sections}>
            <View style={[styles.skeleton, { height: target.min }]} />
            <View style={[styles.skeleton, styles.skeletonHeading]} />
            <View style={[styles.skeleton, { height: ROW_H * 7 }]} />
          </View>
        ) : (
          <View style={styles.sections}>
            <View style={styles.pager}>
              <Pressable
                onPress={() => setWeek((w) => Math.max(0, w - 1))}
                disabled={week === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                accessibilityState={{ disabled: week === 0 }}
                style={({ pressed }) => [styles.pagerButton, dim(pressed)]}
              >
                <Text style={week === 0 ? styles.pagerLabelOff : styles.pagerLabel}>
                  Prev
                </Text>
              </Pressable>
              <Text style={styles.pagerWeek} accessibilityRole="header">
                {weekLabel}
              </Text>
              <Pressable
                onPress={() => setWeek((w) => Math.min(weeks - 1, w + 1))}
                disabled={week >= weeks - 1}
                accessibilityRole="button"
                accessibilityLabel="Next week"
                accessibilityState={{ disabled: week >= weeks - 1 }}
                style={({ pressed }) => [styles.pagerButton, dim(pressed)]}
              >
                <Text
                  style={week >= weeks - 1 ? styles.pagerLabelOff : styles.pagerLabel}
                >
                  Next
                </Text>
              </Pressable>
            </View>

            {/* The count is derived. The design bakes one into the eyebrow. */}
            {/* Both figures are derived: the label names WHICH week of the
                payload's own window you are on, and the note counts the days
                that actually came back written. */}
            <Section
              label={week === 0 ? "This week" : `Week ${week + 1} of ${weeks}`}
              note={`${writtenThisWeek} of ${dates.length} written`}
            >
              {dates.length === 0 ? (
                <Card>
                  <Text style={styles.emptyTitle}>
                    The calendar window did not come back.
                  </Text>
                  <Text style={styles.emptyBody}>
                    The server sent no date range for this team, so there are no
                    days to show — not an empty week.
                  </Text>
                </Card>
              ) : (
                <Card padded={false} style={styles.list}>
                  {dates.map((date, i) => (
                    <DayRow
                      key={date}
                      date={date}
                      day={written.get(date) ?? null}
                      isToday={date === today}
                      isLast={i === dates.length - 1}
                      onPress={() => setEditing(date)}
                    />
                  ))}
                </Card>
              )}
            </Section>

            {/* The design has no empty state; a week nobody has written is the
                common one, and seven bare rows would read as seven rest days. */}
            {dates.length > 0 && writtenThisWeek === 0 ? (
              <Text style={styles.emptyWeek}>
                Nothing is written for this week yet. Until a day is written,
                RunGuard generates that day for each athlete from their own
                training — the team has no shared session.
              </Text>
            ) : null}

            {failed ? (
              <Text style={styles.stale}>
                This is the last calendar that loaded. {failed}
              </Text>
            ) : null}
          </View>
        )}
      </TabScreen>

      <Modal
        visible={editing !== null}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        {editing ? (
          <Editor
            date={editing}
            dateText={dayLabel(editing)}
            existing={written.get(editing) ?? null}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load(true);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  sections: { gap: layout.section },

  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  pagerButton: { minHeight: target.min, justifyContent: "center" },
  pagerLabel: { ...text.baseSemi, color: color.brandText },
  /** At the end of the payload's window. Muted, not faded — see `saveOff`. */
  pagerLabelOff: { ...text.baseSemi, color: color.muted },
  /** A date range is figures. `statInline` is the app's 14pt mono tabular rank. */
  pagerWeek: { ...text.statInline, color: color.ink, flexShrink: 1, textAlign: "center" },

  list: { overflow: "hidden" },
  row: {
    minHeight: ROW_H,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  /**
   * The neutral system fill, which follows the appearance. NOT `accentSoft` —
   * see the file header: that token is a light-only literal scoped to surfaces
   * with no type on them.
   */
  rowToday: { backgroundColor: color.fill },
  dateCol: { width: DATE_COL, alignItems: "flex-start" },
  dow: { ...text.micro, color: color.muted },
  dom: { ...text.statInline, color: color.ink },
  rowBody: { flex: 1, gap: space.xs },
  rowType: { ...text.base, color: color.ink },
  /** Same size and position as a real session name, so the column still lines up. */
  rowUnwritten: { ...text.base, color: color.unknown },
  rowDetail: { ...text.meta, color: color.muted },
  /**
   * A figure inside one of those lines. Nested in the surrounding `Text`, so it
   * inherits the line's size, leading and colour and changes only the face —
   * `login.tsx` carries the same style for the same reason.
   */
  figure: { fontFamily: font.mono, ...tabular },
  separator: {
    position: "absolute",
    left: layout.cardPadding,
    right: 0,
    bottom: 0,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },

  emptyTitle: { ...text.base, color: color.ink },
  emptyBody: { ...text.meta, color: color.muted, marginTop: space.xs },
  emptyWeek: { ...text.meta, color: color.muted },
  stale: { ...text.meta, color: color.muted },

  retry: { minHeight: target.min, justifyContent: "center", marginTop: space.md },
  retryLabel: { ...text.baseSemi, color: color.brandText },

  skeleton: {
    backgroundColor: color.well,
    borderRadius: radius.card,
    borderCurve: "continuous",
  },
  skeletonHeading: { height: text.micro.lineHeight as number, width: "50%" },

  /** `bg`, not `card`: a pageSheet is its own page, as the check-in sheet is. */
  sheet: { flex: 1, backgroundColor: color.bg },
  sheetPage: {
    flexGrow: 1,
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
    gap: space.md,
  },
  sheetEyebrow: { ...text.micro, color: color.muted },
  sheetTitle: { ...text.title, color: color.ink },
  sheetNote: { ...text.meta, color: color.muted },
  sheetError: { ...text.meta, color: color.unusualText },

  field: { gap: space.xs },
  fieldLabel: { ...text.micro, color: color.muted },
  input: {
    ...text.base,
    color: color.ink,
    backgroundColor: color.fill,
    borderRadius: radius.control,
    borderCurve: "continuous",
    minHeight: target.min,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  inputTall: { minHeight: target.min + space.xl, textAlignVertical: "top" },

  save: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    borderCurve: "continuous",
    marginTop: space.md,
    overflow: "hidden",
  },
  /**
   * Disabled is a COLOUR, not an alpha. There is no disabled-opacity token, and
   * inventing one would put a bare number in a component (app/CLAUDE.md); a
   * faded ember also stays ember-shaped, where the neutral system fill reads as
   * inert at a glance. The gradient is withheld too, so the control is flat.
   */
  saveOff: { backgroundColor: color.fill },
  /**
   * INK on the ember, not white — `login.tsx` measured it: white on the lightest
   * stop is 1.67:1, `ink` is 5.97:1 on the darkest and 10.03:1 on the lightest.
   * Not `brandText`, because here the ember is the ground rather than the glyph.
   */
  saveLabel: { ...text.baseSemi, color: color.ink },
  saveLabelOff: { ...text.baseSemi, color: color.muted },
  cancel: { minHeight: target.min, alignItems: "center", justifyContent: "center" },
  cancelLabel: { ...text.base, color: color.brandText },
});
