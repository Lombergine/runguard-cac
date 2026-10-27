/**
 * Add a race to the athlete's own calendar, and take one back off it.
 *
 * The web original is `RaceForm` / `RaceEditControls`
 * (website/src/components/athlete/widgets.tsx:616-708). Two of its choices do
 * not survive the port.
 *
 * ── THE DATE ─────────────────────────────────────────────────────────────────
 * The web uses `<input type="date">`, which React Native has no equivalent for
 * and no date picker is installed (see app/package.json — and one is not being
 * added for a single field). The alternative every app reaches for, three
 * numeric boxes, is exactly what visual-spec non-negotiable #2 forbids: "10/09"
 * is a different day either side of the Atlantic, and "31/02" is a date the
 * athlete can type and the server cannot store.
 *
 * So the date is not typed at all — it is STEPPED. The value starts on the local
 * day, six buttons move it by a day, a week or four weeks, and the day itself is
 * spelled out above them as "Sat 15 Aug 2026". Three things follow for free:
 * the value is always a real calendar day, it is always already YYYY-MM-DD, and
 * what the athlete reads is the explicit local date rather than a numeric string
 * they have to decode. Whole days only — "4 weeks" rather than "1 month",
 * because `setMonth` turns 31 Jan into 3 Mar and a button must do what it says.
 *
 * Stepping BACK stops at this phone's local day. That is an affordance, not a
 * validation: the server compares against ITS OWN `localDay()`, so a phone west
 * of the server can hold a date that looks like today here and reads as
 * yesterday there. When that happens the server's sentence is what the athlete
 * sees — this file does not pre-judge it.
 *
 * ── WHOSE VALIDATION IS WHOSE ────────────────────────────────────────────────
 * `POST /api/race` writes a sentence for a person for every rejection, and
 * `request()` in lib/api lifts it onto `ApiError.message`, so a missing name,
 * event or date is shown VERBATIM — one message naming every missing field at
 * once, rather than a second copy of the rules here that drifts from the route.
 *
 * The one exception is deliberate. A non-positive or unparseable distance folds
 * into that same "Please fill in: …" list with no sentence of its own, and the
 * athlete typing "5k" into a miles field would be told to fill in a field they
 * just filled in. So a non-empty distance that is not a positive number is
 * refused HERE, with the only copy in the app that can explain it. An EMPTY
 * distance is left to the server, so that it can be listed alongside whatever
 * else is missing in a single round trip.
 *
 * ── canEdit ──────────────────────────────────────────────────────────────────
 * `RemoveRace` renders NOTHING when `race.canEdit` is false. That flag is an
 * authorisation boundary, not a hint: coach- and seed-created races sit on the
 * athlete's calendar without being theirs, and `DELETE /api/race/{id}` answers
 * 403 for them. The 403 is still handled — if one arrives, this copy of
 * `canEdit` was stale, so the failure is surfaced and the screen refetched.
 *
 * Miles in, metres out: the athlete types miles and `M_PER_MI` converts at the
 * boundary (non-negotiable #3 — never a metric and an imperial figure on the
 * same screen). The kilometres and metres the API speaks stop at this file.
 */
import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Card } from "./Card";
import {
  ApiError,
  createRace,
  deleteRace,
  RACE_COURSE_TYPES,
  RACE_PRIORITIES,
  type RaceCourseType,
  type RacePriority,
} from "../lib/api";
import { dayLabel, localDay, localDayOffset, parseLocalDay } from "../lib/dates";
import type { UpcomingRace } from "../lib/types";
import { M_PER_MI } from "../lib/units";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { radius, ruleWidth, space, target } from "../theme/space";

/** The route's own truncation points, so nothing is silently cut server-side. */
const MAX_NAME = 120;
const MAX_EVENT = 20;
const MAX_LOCATION = 120;

const MAX_NOTES = 1000;

/**
 * Course and priority are CLOSED SETS the route rejects anything outside of, so
 * they are chosen, never typed. Typing them would make "XC" and "cross-country"
 * both reachable and both a 400 — the same reasoning that made `feel` a set of
 * buttons in LogResultForm rather than a text field.
 *
 * The priority labels say what the letter MEANS. "A" alone is jargon an athlete
 * has to already know; "A — the one you peak for" teaches it in place.
 */
const COURSES: readonly { id: RaceCourseType; label: string }[] = RACE_COURSE_TYPES.map(
  (id) => ({ id, label: id })
);

const PRIORITIES: readonly { id: RacePriority; label: string }[] = [
  { id: "A", label: "A: the one you peak for" },
  { id: "B", label: "B: race it, no taper" },
  { id: "C", label: "C: a training effort" },
];

/**
 * What the date control moves by. Whole days, so every step lands on a real
 * calendar day and the label is exactly what the button does.
 */
const STEPS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "1 week" },
  { days: 28, label: "4 weeks" },
] as const;

/** The server's sentence when there is one, the fallback when there is not. */
function explain(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * `iso` moved by whole days. `localDayOffset` counts BACKWARD from its date, so
 * a forward step is a negative offset — the arithmetic stays inside lib/dates,
 * which is the only place in the app allowed to do calendar maths.
 */
function shiftDay(iso: string, days: number): string {
  return localDayOffset(-days, parseLocalDay(iso));
}

/**
 * "Sat 15 Aug 2026" — one node, explicit and local (non-negotiable #2).
 *
 * `dayLabel` omits the year, which is right where every date on screen is
 * inside a season and wrong here: a race entered in December for March is a
 * year away, and "Sun 15 Mar" alone does not say which March. Components
 * normally take a pre-formatted date as a prop rather than making one — this
 * one cannot, because the date is a value it owns and no screen has it to pass.
 */
function fullDayLabel(iso: string): string {
  return `${dayLabel(iso)} ${parseLocalDay(iso).getFullYear()}`;
}

/* ------------------------------------------------------------------ *
 * Furniture
 * ------------------------------------------------------------------ */

/**
 * The website's Panel head (website/src/components/athlete/tabs.tsx:22), the
 * shape every form row in this app already uses: semibold title left, muted
 * note right. The note is the field's caveat or its unit — "miles",
 * "optional" — which is where the athlete looks for it.
 */
function Head({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.panelHead}>
      <Text style={styles.panelTitle}>{title}</Text>
      {note ? <Text style={styles.panelNote}>{note}</Text> : null}
    </View>
  );
}

/** One labelled text field. Matches `signup.tsx`'s `Field` exactly. */
function Field({
  label,
  note,
  style,
  ...input
}: { label: string; note?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Head title={label} note={note} />
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={color.placeholder}
        accessibilityLabel={label}
        {...input}
      />
    </View>
  );
}

/**
 * The ember signature, on the one thing you tap to commit. Same construction as
 * `profile.tsx`'s `EmberButton`: disabled wears NO ember at all, because "you
 * cannot do this yet" is an inert control rather than a faded brand.
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
    <Pressable style={styles.ember} onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <>
          {/* Pressing drops the gradient to the flat `brandStrong` ground
              underneath, which is also the fallback if it never draws. */}
          {pressed ? null : (
            <LinearGradient
              colors={color.ember}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {/* INK on the ember: here the ember is the ground, not the glyph. */}
          <Text style={styles.emberLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Ruled rows rather than a picker wheel, the same construction LogResultForm
 * uses for `feel`: every choice stays readable at arm's length and the selected
 * one is visible without opening anything. The dot is the ember as a SHAPE —
 * `brand` is 2.01:1 and no glyph ever sits on it.
 *
 * Selecting the row that is already selected CLEARS it. Both fields here are
 * optional, and without this an athlete who taps "Track" by mistake has no way
 * back to "not specified" short of leaving the form.
 */
function Choices<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: readonly { id: T; label: string }[];
  selected: T | null;
  onSelect: (id: T | null) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup">
      {options.map((option, index) => {
        const on = option.id === selected;
        return (
          <Pressable
            key={option.id}
            style={[styles.choice, index > 0 && styles.choiceRuled]}
            onPress={() => onSelect(on ? null : option.id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={option.label}
            accessibilityHint={on ? "Clears this choice." : undefined}
          >
            <View style={[styles.dot, on && styles.dotOn]} />
            <Text style={on ? styles.choiceLabelOn : styles.choiceLabel}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The date
 * ------------------------------------------------------------------ */

/** One step button. Inert rather than absent when the step is not available. */
function Step({
  glyph,
  step,
  forward,
  onPress,
  disabled,
}: {
  glyph: string;
  step: string;
  forward: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[styles.step, disabled && styles.stepOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`Move the race ${forward ? "later" : "earlier"} by ${step}`}
    >
      <Text style={disabled ? styles.stepLabelOff : styles.stepLabel}>
        {`${glyph} ${step}`}
      </Text>
    </Pressable>
  );
}

/**
 * The date, spelled out, and six buttons that move it. See the file header for
 * why it is stepped rather than typed.
 *
 * `today` is read on every render rather than captured once, so a form left open
 * across midnight steps against the real day.
 */
function DateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const today = localDay();
  // YYYY-MM-DD sorts lexically, so this is a date comparison.
  const atFloor = value <= today;

  return (
    <View style={styles.field}>
      <Head title="Date" note="tap to move the day" />
      {/* Sunken like the fields above it: this is the value of the control,
          even though it is not typed into. */}
      <View style={styles.dateWell}>
        <Text style={styles.dateValue} accessibilityLiveRegion="polite">
          {fullDayLabel(value)}
        </Text>
      </View>
      <View style={styles.stepGrid}>
        {STEPS.map((step) => {
          // Back steps clamp at today rather than refusing: the athlete sees
          // where the date landed, which is the whole feedback loop here.
          const back = shiftDay(value, -step.days);
          return (
            <View key={step.days} style={styles.stepCol}>
              <Step
                glyph="−"
                step={step.label}
                forward={false}
                onPress={() => {
                  // The floor is read HERE, not from `today` above. Nothing
                  // re-renders this form at midnight, so a form left open
                  // across it holds yesterday in `today`, and clamping to that
                  // would step the date onto a day the server will refuse.
                  // `atFloor` can still be a render stale — the worst that
                  // costs is a button that clamps to the same day it is on.
                  const floor = localDay();
                  onChange(back < floor ? floor : back);
                }}
                disabled={disabled || atFloor}
              />
              <Step
                glyph="+"
                step={step.label}
                forward
                onPress={() => onChange(shiftDay(value, step.days))}
                disabled={disabled}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Add
 * ------------------------------------------------------------------ */

export function AddRaceForm({ onChanged }: { onChanged: () => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(localDay);
  const [event, setEvent] = useState("");
  const [distanceMi, setDistanceMi] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [courseType, setCourseType] = useState<RaceCourseType | null>(null);
  const [priority, setPriority] = useState<RacePriority | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * One line, for the refusal and for the confirmation alike. Both are plain
   * description in the same weight and colour — non-negotiable #5's tone rule
   * outlives the sentence that happens to be in it, and a form that shouts one
   * of the two would be shouting at an athlete who has done nothing wrong.
   */
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    if (busy) return;

    // The one rule this file owns rather than surfaces. See the file header.
    const entry = distanceMi.trim();
    const miles = entry === "" ? 0 : Number(entry);
    if (entry !== "" && (!Number.isFinite(miles) || miles <= 0)) {
      setMessage(
        "Enter the race distance in miles as a number greater than zero, 3.1 for a 5K."
      );
      return;
    }

    setBusy(true);
    setMessage(null);
    void (async () => {
      try {
        await createRace({
          name: name.trim(),
          date,
          event: event.trim(),
          // Miles → metres at the boundary, the same arithmetic the web form
          // does, so both sides store the identical figure for one race.
          distanceM: miles * M_PER_MI,
          // Omitted rather than sent empty: the route stores "" as "" but null
          // as absent, and an unnamed venue is absent.
          location: location.trim() || undefined,
          // Same rule for all four. The gun time is NOT pre-checked here: the
          // route's own sentence ("Start time must look like 09:30 or 16:05.")
          // names the format better than a second copy of the regex could, and
          // the file header's rule is that a message clear enough to act on
          // belongs to the server.
          startTime: startTime.trim() || undefined,
          // Already narrowed to the route's closed sets by `Choices` — null is
          // "not specified" and is omitted, never sent as an empty string.
          courseType: courseType ?? undefined,
          priority: priority ?? undefined,
          notes: notes.trim() || undefined,
        });
        setName("");
        setEvent("");
        setDistanceMi("");
        setLocation("");
        setStartTime("");
        setCourseType(null);
        setPriority(null);
        setNotes("");
        setDate(localDay());
        setMessage("Added. It is in your upcoming races.");
        onChanged();
      } catch (err) {
        setMessage(explain(err, "Could not add that race."));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <Card>
      <Head title="Add a race" note="only you can remove it" />
      <Text style={styles.body}>
        A race you add here shows up on your calendar with a countdown and a pacing
        plan. Races your coach puts on the schedule arrive on their own.
      </Text>

      <Field
        label="Race name"
        value={name}
        onChangeText={setName}
        editable={!busy}
        placeholder="Central League Championships"
        autoCapitalize="words"
        maxLength={MAX_NAME}
        returnKeyType="next"
      />

      <DateField value={date} onChange={setDate} disabled={busy} />

      <Field
        label="Event"
        note="the distance contested"
        value={event}
        onChangeText={setEvent}
        editable={!busy}
        placeholder="5K"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={MAX_EVENT}
        returnKeyType="next"
        style={styles.shortInput}
      />

      <Field
        label="Distance"
        note="miles"
        value={distanceMi}
        onChangeText={setDistanceMi}
        editable={!busy}
        placeholder="3.1"
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={6}
        returnKeyType="next"
        style={styles.shortInput}
      />

      <Field
        label="Location"
        note="optional"
        value={location}
        onChangeText={setLocation}
        editable={!busy}
        placeholder="Where it is being run"
        autoCapitalize="words"
        maxLength={MAX_LOCATION}
        returnKeyType="next"
      />

      <Field
        label="Gun time"
        note="optional · 24-hour"
        value={startTime}
        onChangeText={setStartTime}
        editable={!busy}
        placeholder="09:30"
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        maxLength={5}
        returnKeyType="next"
        style={styles.shortInput}
      />

      <View style={styles.field}>
        <Head title="Course" note="optional · tap again to clear" />
        <Choices
          options={COURSES}
          selected={courseType}
          onSelect={setCourseType}
          disabled={busy}
        />
      </View>

      <View style={styles.field}>
        <Head title="How much it matters" note="optional" />
        <Choices
          options={PRIORITIES}
          selected={priority}
          onSelect={setPriority}
          disabled={busy}
        />
      </View>

      <Field
        label="Notes"
        note="optional"
        value={notes}
        onChangeText={setNotes}
        editable={!busy}
        placeholder="Course, travel, anything worth remembering"
        multiline
        numberOfLines={3}
        maxLength={MAX_NOTES}
        returnKeyType="done"
        style={styles.notesInput}
      />

      <View style={styles.action}>
        <EmberButton
          label={busy ? "Adding…" : "Add this race"}
          onPress={submit}
          disabled={busy}
        />
      </View>

      {message ? (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Remove
 * ------------------------------------------------------------------ */

/**
 * The remove control for one upcoming race, for the races screen to place on
 * the card. Nothing at all for a race that is not the athlete's — see the file
 * header on `canEdit`.
 *
 * Removing is confirmed because it cannot be undone from here: there is no
 * restore, and re-entering a coach's meet is not something the athlete can do
 * at all. `profile.tsx`'s Sign out confirms the same way and for the same
 * reason.
 *
 * A failure is surfaced in an Alert rather than inline, also as in `profile.tsx`:
 * `onChanged()` refetches the screen and this control can disappear with the
 * card it sits on, so a line rendered here might never be read. The Alert
 * outlives the re-render.
 */
export function RemoveRace({
  race,
  onChanged,
}: {
  race: UpcomingRace;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  // After the hook, before everything else: nothing about this control exists
  // for a race the athlete may not delete.
  if (!race.canEdit) return null;

  async function remove() {
    setBusy(true);
    try {
      await deleteRace(race.id);
      onChanged();
    } catch (err) {
      Alert.alert(
        "That race is still on your calendar",
        explain(err, "Could not reach your server, so nothing was removed.")
      );
      // 403 means the race is not the athlete's after all, and this copy of
      // `canEdit` was stale. Refetch so the control stops offering something
      // the server will keep refusing.
      if (err instanceof ApiError && err.status === 403) onChanged();
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (busy) return;
    Alert.alert(
      "Remove this race?",
      `${race.name} on ${fullDayLabel(race.date)} comes off your calendar, along with its countdown and pacing plan. This cannot be undone.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void remove();
          },
        },
      ]
    );
  }

  return (
    <Pressable
      style={styles.remove}
      onPress={confirm}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      accessibilityLabel={`Remove ${race.name}`}
    >
      <Text style={styles.removeLabel}>{busy ? "Removing…" : "Remove race"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  panelTitle: { ...text.meta, fontFamily: font.bodySemi, color: color.ink },
  /** The caveat. Always the right-hand side, always muted. */
  panelNote: { ...text.meta, color: color.muted, flexShrink: 1 },
  body: { ...text.base, color: color.ink2, marginTop: space.sm },

  field: { marginTop: space.xl, gap: space.sm },
  /**
   * Sunken against the white card, the way the empty slot is: the field is a
   * hole to type into. Vertical padding is explicit because Android's default
   * top-aligns the text in a fixed-height box.
   */
  input: {
    ...text.base,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: target.min,
  },
  /** An event name and a distance never need the full width, and say so. */
  /**
   * Multiline. `textAlignVertical` is Android-only and required there: without
   * it the caret sits vertically centred in the taller box, so an empty notes
   * field looks like a text field that has been misdrawn rather than one
   * waiting for a paragraph.
   */
  notesInput: {
    minHeight: target.min * 2,
    textAlignVertical: "top",
  },

  /* The choice control, matching LogResultForm's `feel` rows exactly so the two
     forms cannot describe the same interaction two ways. */
  choices: {
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min,
    paddingHorizontal: space.md,
  },
  /** The rule between rows, not around them — one control, several choices. */
  choiceRuled: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  dot: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.pill,
    borderWidth: ruleWidth,
    borderColor: color.ruleStrong,
    backgroundColor: color.card,
  },
  /** FILL, not text: the ember is 2.01:1 and nothing legible sits on it. */
  dotOn: { backgroundColor: color.brand, borderColor: color.brandStrong },
  choiceLabel: { ...text.base, color: color.ink2 },
  choiceLabelOn: { ...text.baseSemi, color: color.ink },

  shortInput: {
    fontFamily: font.mono,
    // Mandatory on any mono numeral (theme/type.ts) — `text.base` does not
    // carry it, so overriding the family to mono has to bring it along.
    ...tabular,
    alignSelf: "flex-start",
    minWidth: target.min * 3,
  },

  /** The same sunken ground as an input: this is the control's value. */
  dateWell: {
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    justifyContent: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: target.min,
  },
  /** Mono, like every other figure. The day is spelled out; the year is a numeral. */
  dateValue: { ...text.stat, color: color.ink },

  /** Three columns, one per step size; back on top, forward below. */
  stepGrid: { flexDirection: "row", gap: target.gap },
  stepCol: { flex: 1, gap: target.gap },
  step: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /** Inert, not dimmed: a sunken well is a control that does nothing. */
  stepOff: { backgroundColor: color.well, borderColor: color.ruleSoft },
  stepLabel: { ...text.meta, fontFamily: font.mono, ...tabular, color: color.ink },
  stepLabelOff: { ...text.meta, fontFamily: font.mono, ...tabular, color: color.muted },

  action: { marginTop: space.xl },
  ember: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  emberLabel: { ...text.baseSemi, color: color.onBrand },
  emberOff: {
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
  },
  emberLabelOff: { ...text.baseSemi, color: color.muted },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  message: { ...text.meta, color: color.ink2, marginTop: space.md },

  /**
   * Bordered and unfilled, like every other leaving-or-clearing control in the
   * app. Deliberately not red: `unusual` is a verdict about the athlete's
   * training, and destructive-red chrome is exactly the shouting the spec rules
   * out. The confirmation carries the weight instead.
   */
  remove: {
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  removeLabel: { ...text.baseSemi, color: color.ink2 },
});

export default AddRaceForm;
