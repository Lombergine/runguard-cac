/**
 * Log a finished race — the app's version of the website's `RaceLogForm`
 * (website/src/components/athlete/widgets.tsx:553).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THIS FORM IS THE ONLY LINE OF DEFENCE
 *
 * `POST /api/race-result` is an INSERT and nothing else. Grepping the repo for
 * `race_results` finds exactly three statements: the INSERT in
 * website/src/app/api/race-result/route.ts:19, the read in
 * website/src/lib/db.ts:381, and the wholesale wipe in `scripts/seed.ts`. There
 * is no UPDATE, no DELETE, no `race-result/[id]` route, and no edit or remove
 * control on either the website or this app — `RaceEditControls` is for
 * UPCOMING races (`/api/race/[id]`), which is a different table.
 *
 * So a wrong entry here is permanent short of a re-seed, and it is not
 * cosmetic: `raceResultsForAthlete` feeds `engine.ts:644`'s PR detection, the
 * PR progression chart, and the race predictions the races screen prints. A
 * mistyped time becomes a PR the athlete never ran and skews every prediction
 * downstream of it.
 *
 * That is why this form validates rather than letting the server do it, why it
 * spells out what is about to be stored before the athlete commits, and why it
 * refuses to guess at an ambiguous entry.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE THREE THINGS THE ROUTE DOES QUIETLY
 *
 * 1. `timeS` bounds are EXCLUSIVE: `body.timeS > 30 && body.timeS < 7200`
 *    (route.ts:11). Exactly 30 and exactly 7200 are both REJECTED, so a
 *    2:00:00 finish cannot be stored at all and 1:59:59 is the ceiling. The
 *    route's only 400 is "Need event and timeS (seconds)", which explains none
 *    of that — so the bounds are checked here, in the athlete's own units, and
 *    the sentence names them.
 *
 * 2. `feel` outside `great|ok|rough` is dropped to NULL and the route still
 *    answers `{ ok: true }` (route.ts:27). A typo is a lost answer that reports
 *    success — the same class of failure as the soreness data loss this project
 *    already had. It is made unsendable structurally: `feel` is held as
 *    `RaceFeel | null`, the only writers are the three buttons built from
 *    `FEELS`, whose `id`s are that union, and there is no text input anywhere
 *    near it. No keystroke can reach the field.
 *
 * 3. `place` is stored if it is a `number` — any number, including 0, -3 and
 *    3.5. The input accepts digits only and 0 is refused, because
 *    `placeLabel()` on the races screen would render a stored 0 as "0th".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TWO DELIBERATE DEPARTURES FROM THE WEB FORM
 *
 * - **Nothing is pre-selected.** The web defaults `event` to `events[0]` and
 *   `feel` to `"ok"`, so an athlete who touches neither still stores an event
 *   they may not have run and a verdict they never gave. Both start unset here;
 *   an unset `feel` is simply omitted from the body and stored as NULL, which
 *   is the honest record of not having said. (Non-negotiable #4: absence is its
 *   own thing, never a value.)
 *
 * - **The date is SENT, not left to the server.** Omitting `date` files the row
 *   under the server's `localDay()`, which is a different day from the phone's
 *   either side of midnight — and this form has to name the day it is filing
 *   under (non-negotiable #2). Sending the phone's local day makes the date on
 *   screen the date in the row instead of a guess about it.
 *
 * Tone: `races.tsx` marks a PR with a plain unfilled two-letter label and no
 * medal. Logging one is not an achievement to celebrate either — the receipt is
 * one muted line, where the web shows "Logged ✓" in the success colour.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Card } from "./Card";
import { ApiError, logRaceResult } from "../lib/api";
import { dayLabel, localDay, localDayOffset, parseLocalDay } from "../lib/dates";
import { useProfile } from "../lib/profileStore";
import type { RaceFeel } from "../lib/types";
import { color } from "../theme/tokens";
import { font, text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * What the server offers when `athlete.events` is not in the payload. It is the
 * same list twice over in the website — hardcoded at the `RaceLogForm` call
 * site (athlete/tabs.tsx:712) and hardcoded again as every athlete's
 * `athlete.events` (website/src/lib/profile.ts:346) — so this is a third copy
 * of a constant rather than an invention. `events` is optional on `Profile`
 * because `/api/mobile/home` narrows it away; this screen reads `/me`, which
 * carries it, so the fallback is for the moment before the profile lands.
 */
const FALLBACK_EVENTS = ["800m", "Mile", "5K", "XC 5K"] as const;

/**
 * The three words the route stores, with the website's labels
 * (widgets.tsx:598-600). `id` is typed as `RaceFeel`, which is what makes an
 * invalid `feel` unrepresentable rather than merely discouraged.
 */
const FEELS: readonly { id: RaceFeel; label: string }[] = [
  { id: "great", label: "Felt great" },
  { id: "ok", label: "Felt ok" },
  { id: "rough", label: "Felt rough" },
];

/** The route's `timeS > 30`, in whole seconds. 0:30 exactly is refused. */
const MIN_TIME_S = 31;
/** The route's `timeS < 7200`, in whole seconds. 2:00:00 exactly is refused. */
const MAX_TIME_S = 7199;

/**
 * `M:SS`, `MM:SS`, `MMM:SS` — up to 119:59, which is the whole storable range
 * expressed in minutes. Seconds are `[0-5]\d`: two digits, and 00–59 only.
 */
const MIN_SEC = /^(\d{1,3}):([0-5]\d)(?:\.\d+)?$/;
/**
 * `H:MM:SS`. Reachable, and worth accepting: the ceiling is 1:59:59, so a
 * 1:45:00 half is inside the bounds and no athlete writes that as 105:00. One
 * hour digit, because two would already be over the ceiling.
 */
const HOUR_SEC = /^(\d):([0-5]\d):([0-5]\d)(?:\.\d+)?$/;

/** No colon at all — "1842". */
const NO_COLON = /^\d+(?:\.\d+)?$/;
/** One-digit seconds — "18:5", which could be 18:05 or 18:50. */
const SHORT_SEC = /^\d{1,3}:\d(?:\.\d+)?$/;
/** Seconds past 59 — "18:60". */
const OVER_SEC = /^\d{1,3}:[6-9]\d(?:\.\d+)?$/;

type TimeParse = { ok: true; timeS: number } | { ok: false; why: string };

/**
 * `"18:42"` → 1122 seconds, or the reason it is not a finishing time.
 *
 * The website's regex is `^(\d{1,2}):(\d{2})(?:\.\d+)?$` (widgets.tsx:563),
 * which accepts `18:60` and quietly stores it as 19:00 — a minute that was
 * never run, in a table with no edit. Nothing here is coerced: an entry that is
 * open to two readings is refused with the two readings named, because the
 * wrong guess becomes a PR.
 *
 * Fractional seconds ARE accepted and truncated, as on the web — `time_s` is a
 * whole-second column, so `5:04.32` has nowhere to put its hundredths. That is
 * not silent: the preview spells out the whole-second value that will be
 * stored, so the athlete sees 5:04 before committing to it.
 */
/** A parsed split list, or the sentence explaining why it is not one. */
type SplitParse = { ok: true; splits: number[] } | { ok: false; why: string };

/**
 * Splits, entered the way a runner says them.
 *
 * "74, 76, 79" and "1:14 1:16 1:19" are the same three laps; commas and spaces
 * both separate, and the two notations mix freely inside one entry because an
 * athlete reading off a watch will write 400s in seconds and miles in M:SS.
 *
 * PER-LAP, NOT CUMULATIVE. That is the mistake worth catching: a running total
 * is a plausible-looking list of numbers that describes a different race, and
 * `race_results` has no UPDATE path anywhere in the product, so a wrong set of
 * splits is permanent. The sum is checked against the finishing time here as
 * well as on the route, because this is the copy that can say what to do about
 * it while the athlete is still looking at the field.
 */
function parseSplits(raw: string, timeS: number): SplitParse {
  const entry = raw.trim();
  if (!entry) return { ok: true, splits: [] };

  const parts = entry.split(/[,\s]+/).filter(Boolean);
  if (parts.length > 60) {
    return { ok: false, why: `That is ${parts.length} splits — more than a race has laps. Check the entry.` };
  }

  const splits: number[] = [];
  for (const part of parts) {
    const mmss = /^(\d{1,2}):([0-5]\d)(?:\.\d+)?$/.exec(part);
    if (mmss) {
      splits.push(Number(mmss[1]) * 60 + Number(mmss[2]));
      continue;
    }
    const plain = Number(part);
    if (!Number.isFinite(plain) || plain <= 0 || plain > 3600) {
      return {
        ok: false,
        why: `Could not read the split "${part}". Write each lap in seconds (76) or as M:SS (1:16).`,
      };
    }
    splits.push(plain);
  }

  const total = splits.reduce((a, b) => a + b, 0);
  if (Math.abs(total - timeS) > timeS * 0.1) {
    return {
      ok: false,
      why: `Those add up to ${clockTime(Math.round(total))} but you finished in ${clockTime(
        Math.round(timeS)
      )}. Enter each lap on its own, not a running total.`,
    };
  }

  return { ok: true, splits };
}

function parseFinishTime(raw: string): TimeParse {
  const entry = raw.trim();
  if (!entry) {
    return { ok: false, why: "Enter your finishing time, like 18:42." };
  }

  const hours = HOUR_SEC.exec(entry);
  const minutes = hours ? null : MIN_SEC.exec(entry);

  if (!hours && !minutes) {
    if (NO_COLON.test(entry)) {
      return {
        ok: false,
        why: `Put a colon between the minutes and the seconds — 18:42, not 1842. "${entry}" could be either.`,
      };
    }
    if (SHORT_SEC.test(entry)) {
      return {
        ok: false,
        why: `Seconds take two digits, so "${entry}" could mean either. Write 18:05 or 18:50.`,
      };
    }
    if (OVER_SEC.test(entry)) {
      return {
        ok: false,
        why: "Seconds only run 00 to 59, so 18:60 is not a time — that one is 19:00.",
      };
    }
    return {
      ok: false,
      why: "Write the time as minutes and seconds, like 18:42 — or with hours for a long race, like 1:02:33.",
    };
  }

  const timeS = hours
    ? Number(hours[1]) * 3600 + Number(hours[2]) * 60 + Number(hours[3])
    : Number(minutes![1]) * 60 + Number(minutes![2]);

  // Both bounds are the route's, and both are EXCLUSIVE — see the header.
  if (timeS < MIN_TIME_S) {
    return {
      ok: false,
      why: `${clockTime(timeS)} is too short to store. A finishing time has to be longer than 0:30, and 0:30 exactly is refused, so 0:31 is the shortest this takes.`,
    };
  }
  if (timeS > MAX_TIME_S) {
    return {
      ok: false,
      why: `${clockTime(timeS)} is too long to store. A finishing time has to be shorter than 2:00:00, and 2:00:00 exactly is refused, so 1:59:59 is the longest this takes.`,
    };
  }
  return { ok: true, timeS };
}

/** 1122 → "18:42"; 3753 → "1:02:33". One node, mono, never a bare numeral. */
function clockTime(timeS: number): string {
  const h = Math.floor(timeS / 3600);
  const m = Math.floor((timeS % 3600) / 60);
  const s = timeS % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * 1122 → "18 minutes 42 seconds".
 *
 * Non-negotiable #3 in its strongest form: before this row becomes a permanent
 * PR, the number is written out in words, so a mis-parse has nowhere to hide.
 * "18:5" never gets this far, but "5:04.32" does, and this is where the athlete
 * sees that the hundredths are gone.
 */
function spellTime(timeS: number): string {
  const h = Math.floor(timeS / 3600);
  const m = Math.floor((timeS % 3600) / 60);
  const s = timeS % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s > 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/**
 * 3 → "3rd". The ordinal is welded to the numeral, never rendered apart.
 *
 * The same function exists as a local in `(tabs)/races.tsx:63`, which this file
 * may not edit. If a third copy is ever needed, that is when it moves to a
 * shared module rather than now.
 */
function placeLabel(place: number): string {
  const teens = place % 100;
  if (teens >= 11 && teens <= 13) return `${place}th`;
  const last = place % 10;
  const suffix = last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${place}${suffix}`;
}

/**
 * One form row in the website's Panel hierarchy (athlete/tabs.tsx:22): semibold
 * title left, muted note right, control underneath. Same shape as `signup.tsx`'s
 * `Field` — neither file owns a shared component, so both spell it out from the
 * same tokens.
 */
function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{label}</Text>
        {note ? <Text style={styles.panelNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Ruled rows rather than a picker wheel, as in `signup.tsx`: every choice stays
 * readable at arm's length and the selected one is visible without opening
 * anything. The dot is the ember as a SHAPE — `brand` is 2.01:1 and no glyph
 * ever sits on it — and the ring stays drawn when unselected, so the row reads
 * as a choice before one is made.
 */
function Choices<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: readonly { id: T; label: string }[];
  selected: T | null;
  onSelect: (id: T) => void;
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
            onPress={() => onSelect(option.id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={option.label}
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

export function LogResultForm({ onChanged }: { onChanged: () => void }) {
  /**
   * Read only for `athlete.events`. This is the shared `/me` the races screen
   * is already consuming, so no second request is started by asking.
   */
  const { profile } = useProfile();
  const events = profile?.athlete.events?.length
    ? profile.athlete.events
    : [...FALLBACK_EVENTS];

  const [event, setEvent] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [place, setPlace] = useState("");
  /**
   * `RaceFeel | null`, and the only writer is `Choices` over `FEELS`. There is
   * no path from a keyboard to this value, so the route's silent drop to NULL
   * cannot be reached by a typo — see the header.
   */
  const [feel, setFeel] = useState<RaceFeel | null>(null);
  const [splitsEntry, setSplitsEntry] = useState("");
  const [conditions, setConditions] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  /**
   * The day this will be filed under, sent rather than inferred.
   *
   * It used to be pinned to `localDay()`, which meant a Saturday race logged on
   * Monday was filed under Monday — wrong in PR progression and in every chart
   * keyed by date, permanently, since there is no edit path. It now steps
   * backward from today; today is the ceiling, because a result cannot be
   * logged for a race that has not been run.
   */
  const today = localDay();
  const [raceDate, setRaceDate] = useState(today);
  const parsed = parseFinishTime(entry);
  const placeN = place ? Number(place) : null;
  const splits = parsed.ok ? parseSplits(splitsEntry, parsed.timeS) : null;

  function attempt() {
    if (busy) return;

    if (!event) return setProblem("Pick the event you ran.");
    if (!parsed.ok) return setProblem(parsed.why);
    if (placeN !== null && placeN < 1) {
      return setProblem("Finishing places start at 1st. Leave it blank if you would rather not say.");
    }
    // Checked before the request rather than after: the route rejects the same
    // things, but this copy can name the entry the athlete is still looking at.
    const splitParse = parseSplits(splitsEntry, parsed.timeS);
    if (!splitParse.ok) return setProblem(splitParse.why);

    setProblem(null);
    setReceipt(null);
    setBusy(true);
    void (async () => {
      try {
        await logRaceResult({
          event,
          timeS: parsed.timeS,
          date: raceDate,
          // Omitted rather than zeroed when unanswered: the column holds NULL,
          // which is the record of not having said.
          ...(placeN === null ? {} : { place: placeN }),
          ...(feel === null ? {} : { feel }),
          ...(splitParse.splits.length ? { splits: splitParse.splits } : {}),
          ...(conditions.trim() ? { conditions: conditions.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        setReceipt(`Logged ${event} · ${clockTime(parsed.timeS)} · ${dayLabel(raceDate)}`);
        setEntry("");
        setPlace("");
        setFeel(null);
        setSplitsEntry("");
        setConditions("");
        setNotes("");
        setRaceDate(localDay());
        onChanged();
      } catch (err) {
        /*
         * The route appends on every call — there is no upsert and no id — so
         * two taps are two rows in a table nothing can edit. A transport
         * failure (status 0: timeout, or the server never answered) leaves the
         * outcome genuinely unknown, so the athlete is told to look before
         * pressing again rather than nudged to retry.
         */
        if (err instanceof ApiError && err.status === 0) {
          setProblem(
            `${err.message} If it did save, logging again would add a second copy — check your history below before trying again.`
          );
        } else {
          setProblem(err instanceof ApiError ? err.message : "Could not log that result.");
        }
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <Card>
      <View style={styles.panelHead}>
        <Text style={styles.title}>Log a result</Text>
        <Text style={styles.panelNote}>0:31 to 1:59:59</Text>
      </View>
      <Text style={styles.body}>
        This goes into your PR history, which your predictions are built from. It
        cannot be edited or removed afterwards, here or on the website.
      </Text>

      <Row label="Event" note="pick one">
        <Choices
          options={events.map((e) => ({ id: e, label: e }))}
          selected={event}
          onSelect={setEvent}
          disabled={busy}
        />
      </Row>

      <Row label="Finishing time" note="M:SS">
        <TextInput
          style={styles.timeInput}
          value={entry}
          onChangeText={setEntry}
          editable={!busy}
          placeholder="18:42"
          placeholderTextColor={color.muted}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={10}
          accessibilityLabel="Finishing time, minutes and seconds"
        />
      </Row>

      <Row label="Place" note="optional">
        <TextInput
          style={styles.placeInput}
          value={place}
          // Digits only, so the field cannot produce the 0, the negative or the
          // fraction the route would store without comment.
          onChangeText={(next) => setPlace(next.replace(/[^0-9]/g, ""))}
          editable={!busy}
          placeholder="—"
          placeholderTextColor={color.muted}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel="Finishing place"
        />
      </Row>

      <Row label="How it felt" note="optional">
        <Choices
          options={FEELS}
          selected={feel}
          onSelect={setFeel}
          disabled={busy}
        />
      </Row>

      {/*
        The day it was run. Stepped, never typed — the same reasoning
        AddRaceForm's date control is built on: "10/09" is a different day
        either side of the Atlantic and "31/02" is a date a keyboard can produce
        and a database cannot store. Today is the ceiling; a race in the future
        has no result yet.
      */}
      <Row label="Ran on" note="today unless you say otherwise">
        <View style={styles.dateRow}>
          <Pressable
            style={styles.dateStep}
            onPress={() => setRaceDate((d) => localDayOffset(1, parseLocalDay(d)))}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="One day earlier"
          >
            <Text style={styles.dateStepGlyph}>−</Text>
          </Pressable>
          <Text style={styles.dateValue}>{dayLabel(raceDate)}</Text>
          <Pressable
            style={[styles.dateStep, raceDate >= today && styles.dateStepOff]}
            onPress={() => setRaceDate((d) => localDayOffset(-1, parseLocalDay(d)))}
            disabled={busy || raceDate >= today}
            accessibilityRole="button"
            accessibilityLabel="One day later"
            accessibilityState={{ disabled: busy || raceDate >= today }}
          >
            <Text style={raceDate >= today ? styles.dateStepGlyphOff : styles.dateStepGlyph}>
              +
            </Text>
          </Pressable>
        </View>
      </Row>

      <Row label="Splits" note="optional · per lap">
        <TextInput
          style={styles.textInput}
          value={splitsEntry}
          onChangeText={setSplitsEntry}
          editable={!busy}
          placeholder="74, 76, 79  or  1:14 1:16 1:19"
          placeholderTextColor={color.muted}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={400}
          accessibilityLabel="Splits, one per lap"
        />
      </Row>

      <Row label="Conditions" note="optional">
        <TextInput
          style={styles.textInput}
          value={conditions}
          onChangeText={setConditions}
          editable={!busy}
          placeholder="Hot, windy, muddy course"
          placeholderTextColor={color.muted}
          maxLength={120}
          accessibilityLabel="Race conditions"
        />
      </Row>

      <Row label="Notes" note="optional">
        <TextInput
          style={[styles.textInput, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          editable={!busy}
          placeholder="How it went, tactics, anything worth remembering"
          placeholderTextColor={color.muted}
          multiline
          numberOfLines={3}
          maxLength={1000}
          accessibilityLabel="Notes about the race"
        />
      </Row>

      {/*
        What is about to become permanent, in words, before the athlete commits
        to it. Only appears once there is a real row to describe — a half-filled
        preview would be a claim about a result that does not exist yet.
      */}
      {event && parsed.ok ? (
        <View style={styles.preview}>
          <Text style={styles.eyebrow}>Will be stored as</Text>
          <Text style={styles.previewTime}>{clockTime(parsed.timeS)}</Text>
          <Text style={styles.previewProse}>
            {`A ${event} in ${spellTime(parsed.timeS)}, on ${dayLabel(raceDate)}.`}
          </Text>
          <Text style={styles.previewProse}>
            {placeN !== null && placeN >= 1
              ? `You finished ${placeLabel(placeN)}.`
              : "Finishing place: not recorded."}
          </Text>
          <Text style={styles.previewProse}>
            {feel === null
              ? "How it felt: not recorded."
              : `You said it felt ${feel}.`}
          </Text>
          {/* Splits are the one optional field that can be WRONG rather than
              merely absent, so the preview reports the problem where the other
              lines report the value. */}
          <Text style={styles.previewProse}>
            {splits === null
              ? "Splits: not recorded."
              : splits.ok
                ? splits.splits.length
                  ? `${splits.splits.length} splits, ${splits.splits
                      .map((x) => clockTime(Math.round(x)))
                      .join(" · ")}.`
                  : "Splits: not recorded."
                : splits.why}
          </Text>
        </View>
      ) : null}

      <Pressable
        style={styles.action}
        onPress={attempt}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
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
            <Text style={styles.actionLabel}>{busy ? "Logging…" : "Log this result"}</Text>
          </>
        )}
      </Pressable>

      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
      {/* One muted line. Logging a race is not an achievement to celebrate. */}
      {receipt ? (
        <Text style={styles.receipt} accessibilityLiveRegion="polite">
          {receipt}
        </Text>
      ) : null}
    </Card>
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
  title: { ...text.title, color: color.ink },
  panelTitle: { ...text.meta, fontFamily: font.bodySemi, color: color.ink },
  /** The caveat. Always the right-hand side, always muted (5.16:1 on card). */
  panelNote: { ...text.meta, color: color.muted, flexShrink: 1 },
  body: { ...text.base, color: color.ink2, marginTop: space.md },
  eyebrow: { ...text.micro, color: color.muted },

  row: { marginTop: space.xl, gap: space.sm },

  /**
   * Sunken against the white card, the way the empty slot is: the field is a
   * hole to type into. `text.stat` because a finishing time is a numeral, and
   * every numeral in this app is mono and tabular.
   */
  timeInput: {
    ...text.stat,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: target.min,
    alignSelf: "flex-start",
    minWidth: target.min * 3,
  },
  /** Four digits never need the full width, and a short field says so. */
  placeInput: {
    ...text.stat,
    color: color.ink,
    backgroundColor: color.well,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: target.min,
    alignSelf: "flex-start",
    minWidth: target.min * 2,
  },

  /** A plain text field, the same sunken ground the time and place fields use. */
  textInput: {
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
  /** `textAlignVertical` is Android-only and required: without it the caret
      sits centred in the taller box and an empty field looks misdrawn. */
  notesInput: { minHeight: target.min * 2, textAlignVertical: "top" },

  /** The stepped date: value in the middle, one step either side. */
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  dateStep: {
    width: target.min,
    height: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  /** Inert, not absent: the control keeps its place so the row does not jump. */
  dateStepOff: { backgroundColor: color.card, borderColor: color.ruleSoft },
  dateStepGlyph: { ...text.base, color: color.ink },
  dateStepGlyphOff: { ...text.base, color: color.muted },
  dateValue: { ...text.baseSemi, color: color.ink, flex: 1 },

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
    borderRadius: space.sm,
    borderWidth: ruleWidth,
    borderColor: color.ruleStrong,
    backgroundColor: color.card,
  },
  /** FILL, not text: the ember is 2.01:1 and nothing legible sits on it. */
  dotOn: { backgroundColor: color.brand, borderColor: color.brandStrong },
  choiceLabel: { ...text.base, color: color.ink2 },
  choiceLabelOn: { ...text.baseSemi, color: color.ink },

  /** Sunken and ruled off: a statement about the row, not another control. */
  preview: {
    marginTop: space.xl,
    gap: space.xs,
    padding: layout.cardPadding,
    backgroundColor: color.well,
    borderRadius: radius.control,
  },
  previewTime: { ...text.stat, color: color.ink },
  previewProse: { ...text.meta, color: color.ink2 },

  /**
   * The ember signature, on the one thing you tap. The gradient is laid in
   * absolutely over this ground, so `brandStrong` is both the pressed state and
   * the fallback if the gradient ever fails to draw.
   */
  action: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
    borderRadius: radius.control,
    marginTop: space.xl,
    overflow: "hidden",
  },
  actionLabel: { ...text.baseSemi, color: color.ink },

  /** Plain description, not an alarm: no banner, no fill, no warning colour. */
  problem: { ...text.meta, color: color.ink2, marginTop: space.md },
  /** And no celebration either: same weight as any other note on the screen. */
  receipt: { ...text.meta, color: color.muted, marginTop: space.md },
});

export default LogResultForm;
