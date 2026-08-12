/**
 * Sleep stages — deep, REM and light, averaged over the most recent nights.
 *
 * Ports the website's second Recovery panel (`website/src/components/athlete/
 * tabs.tsx:624-639`) and its `avg()` helper (tabs.tsx:548-552): the last seven
 * entries of `sleep30`, the mean of each stage over the nights that actually
 * carry it, and "—" for a stage with no readings at all.
 *
 * ── This is a METER, not a chart ───────────────────────────────────────────
 * There is no x axis, no domain, no tap target and no readout, so it is built
 * on `WeekProgress`'s idiom (a token track, a fill sized by percentage, the
 * figure written out beside it in text) rather than on `chart/Plot`. The bars
 * are decorative — every one of them restates a number printed on the same
 * row — so they are hidden from assistive tech and each row carries one
 * explicit label instead.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THIS CAN BE ABSENT WHILE THE SLEEP CHART IS FULL
 *
 * `SleepDay`'s three stages are nullable INDEPENDENTLY of `hours`
 * (`lib/types.ts:331-338`): a watch worn without sleep tracking reports how
 * long you slept and nothing about what kind of sleep it was. So all three
 * stages can be null across every night in the window while the 30-night sleep
 * chart beside this one is fully populated.
 *
 * That case renders `<Absent/>` — one dashed slot saying nothing was
 * recorded — and NOT a meter of three empty bars. Three tracks at zero width
 * is a blank reading as a value (non-negotiable #4), and it would read as the
 * worst possible night rather than as no data.
 *
 * A stage that is missing while the other two are present gets the same
 * treatment one row down: a DASHED HOLLOW track and "—" in `color.unknown`,
 * never a zero-width fill. Dashed means "we don't know", everywhere.
 *
 * A stage that genuinely averaged to zero is a fact and still draws: the fill
 * carries `minWidth: ruleWidth`, so it is a solid 1.5px stub in the series
 * fill — exactly what `chart/marks.tsx` does for a measured zero in a bar
 * chart, and the same greyscale distinction (solid/filled versus
 * dashed/hollow).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── One fill for all three ─────────────────────────────────────────────────
 * The website gives each stage its own hex (#3987e5 / #9085e9 / #199e70,
 * tabs.tsx:626). None of the three is a token, and colour is the only thing
 * telling them apart there — no shape, no order, nothing that survives
 * greyscale or a colour-blind reader. Here every row is labelled in words and
 * every bar is `color.series1`, which is the app's one data fill. Nothing is
 * lost: the label and the figure were always what carried the meaning.
 *
 * ── This component renders its own panel head ──────────────────────────────
 * A caller drops it in bare — `<SleepStages sleep30={profile.sleep30} />` —
 * and must not add a heading of its own.
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Absent } from "../Nothing";
import { Card } from "../Card";
import { isAbsent } from "../chart/scales";
import type { SleepDay } from "../../lib/types";
import { radius, ruleWidth, space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/** The website's window: the last seven entries of `sleep30` (tabs.tsx:547). */
const WINDOW_NIGHTS = 7;

/**
 * Hours at which a stage's track is full.
 *
 * The website's is implicit and unnamed — `parseFloat(val) * 22` percent
 * (tabs.tsx:630), i.e. 100% at 4.55 h — so it is written down here instead,
 * rounded to a figure a reader could guess. All three rows share it, which is
 * the whole point of the meter: deep against REM against light, on one scale,
 * comparable by eye. A per-row scale would make 1.5 h of deep sleep and 4.4 h
 * of light sleep draw the same width.
 */
const FULL_H = 5;

/** Track height. `WeekProgress` uses `space.md`; three stacked rows sit finer. */
const TRACK_H = space.sm;
/** Wide enough for "Light" and for "4.4 h" without either column reflowing. */
const LABEL_W = space.xxxl;

type StageKey = "deep" | "rem" | "light";

/** Row labels. "REM" is an initialism and stays capitalised. */
const STAGE_LABEL: Record<StageKey, string> = {
  deep: "Deep",
  rem: "REM",
  light: "Light",
};

/**
 * The website's `avg()`, with its null handling made explicit.
 *
 * A night that recorded `hours` and no stages contributes NOTHING to the mean
 * — it is filtered out, never averaged in as a zero, which would drag every
 * stage down in proportion to how often the athlete forgot to wear the watch.
 * No readings at all returns null, which is the row's unknown state.
 */
function stageAvg(nights: SleepDay[], key: StageKey): number | null {
  const v = nights
    .map((n) => n[key])
    .filter((x): x is number => !isAbsent(x));
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export type SleepStagesProps = {
  /**
   * The last 30 metric ROWS, oldest first — **not** the last 30 nights, and not
   * sparse. `lib/types.ts:622-628` is explicit: `sleepTrend` is
   * `metrics.slice(-30)`, so the rows are however many consecutive RECORDED
   * nights it took to reach 30, and the newest one is the last night recorded,
   * NOT last night. Measured 2026-08-11: 2026-06-29 → 2026-07-28, i.e. the
   * newest row was a fortnight old.
   *
   * That matters here more than anywhere else in the app, because this
   * component windows by `slice(-7)` — the last seven ENTRIES — and has no date
   * test anywhere in it. Its note therefore quotes a count and calls the nights
   * "recent" on the strength of this array's ordering alone. The type doc's
   * standing instruction is "never label a chart of this 'last 30 nights'; read
   * the dates off the entries", and this component does not read them. See the
   * audit note in the header. Optional on `Profile`.
   */
  sleep30?: SleepDay[];
};

function Head({ note }: { note?: string }) {
  return (
    <View style={styles.head}>
      <Text style={styles.title}>Sleep stages</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/** One stage: the word, the meter, the figure with its unit welded on. */
function StageRow({
  label,
  hours,
  first,
}: {
  label: string;
  /** Null means the watch recorded no such reading — never zero. */
  hours: number | null;
  first: boolean;
}) {
  const known = hours !== null;
  return (
    <View
      style={first ? styles.row : styles.rowNext}
      accessible
      accessibilityLabel={
        known
          ? `${label} sleep, ${hours.toFixed(1)} hours on average`
          : `${label} sleep, not recorded`
      }
    >
      <Text style={styles.rowLabel}>{label}</Text>

      <View
        style={known ? styles.track : styles.trackAbsent}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {known ? (
          <View
            style={[
              styles.fill,
              { width: `${Math.min(100, (hours / FULL_H) * 100)}%` },
            ]}
          />
        ) : null}
      </View>

      {/* One node, unit welded on. The unknown arm prints the app's dash in
          `color.unknown` and no unit, because there is no figure to carry
          one. */}
      <Text style={known ? styles.value : styles.valueAbsent}>
        {known ? `${hours.toFixed(1)} h` : "—"}
      </Text>
    </View>
  );
}

export function SleepStages({ sleep30 }: SleepStagesProps) {
  const nights = useMemo(
    () => (sleep30 ?? []).slice(-WINDOW_NIGHTS),
    [sleep30],
  );
  const stages = useMemo(
    () => ({
      deep: stageAvg(nights, "deep"),
      rem: stageAvg(nights, "rem"),
      light: stageAvg(nights, "light"),
    }),
    [nights],
  );

  const keys: StageKey[] = ["deep", "rem", "light"];
  const known = keys.filter((k) => stages[k] !== null);
  /**
   * Nights in the window that carried at least one stage. NOT `nights.length`:
   * an entry can exist with everything null (the payload ships a row for a
   * night the watch logged nothing), and counting those would inflate the
   * figure the note is quoting.
   */
  const contributing = nights.filter(
    (n) => !isAbsent(n.deep) || !isAbsent(n.rem) || !isAbsent(n.light),
  ).length;

  // Nothing to meter. See the header: three empty tracks would read as the
  // worst night on record rather than as no record at all.
  if (known.length === 0) {
    return (
      <View style={styles.section}>
        <Head />
        <Absent
          label={
            // The two are genuinely different facts, so they get different
            // sentences: nothing synced at all, versus a watch that timed the
            // night without breaking it down.
            nights.some((n) => !isAbsent(n.hours))
              ? "Your watch recorded how long you slept, but not which stages."
              : "No sleep synced yet, so there are no stages to average."
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Not "7-day average", which is what the website's panel title claims:
          the window is the last seven ENTRIES of a SPARSE array, so on a patchy
          month it spans well over a week and can hold fewer than seven nights
          with stages in it. The note quotes what was actually averaged. It is a
          count, not a date — no date is derived here (non-negotiable #2). */}
      <Head
        note={`averaged over ${contributing} recent ${
          contributing === 1 ? "night" : "nights"
        }`}
      />
      <Card>
        {keys.map((k, i) => (
          <StageRow
            key={k}
            label={STAGE_LABEL[k]}
            hours={stages[k]}
            first={i === 0}
          />
        ))}
      </Card>
      {known.length < keys.length ? (
        <Text style={styles.legend}>
          A dashed track is a stage your watch did not record — not a stage you
          did not get.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** `recovery.tsx`'s `styles.section`. */
  section: { gap: space.md },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted, flexShrink: 1 },

  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  rowNext: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
  },
  rowLabel: { ...text.meta, color: color.ink2, width: LABEL_W },

  track: {
    flex: 1,
    height: TRACK_H,
    backgroundColor: color.surface3,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  /**
   * The unknown track. Dashed, hollow, no fill — the same three cues `Absent`
   * and the charts' absence mark use, so it is recognisably the same object.
   * A dashed border needs a non-zero radius to render on iOS (see
   * `Nothing.tsx`), which `radius.control` supplies.
   */
  trackAbsent: {
    flex: 1,
    height: TRACK_H,
    borderWidth: ruleWidth,
    borderStyle: "dashed",
    borderColor: color.rule,
    borderRadius: radius.control,
  },
  /**
   * `minWidth` is the measured-zero stub: a stage that really averaged 0.0 h
   * still draws a solid 1.5px mark in the series fill, so a fact never
   * disappears into the track and becomes indistinguishable from an unknown.
   */
  fill: {
    height: "100%",
    minWidth: ruleWidth,
    borderRadius: radius.control,
    backgroundColor: color.series1,
  },

  /** Mono and tabular, so the three figures line up as a column. */
  value: {
    ...text.meta,
    ...tabular,
    fontFamily: font.mono,
    color: color.ink,
    width: LABEL_W,
    textAlign: "right",
  },
  valueAbsent: {
    ...text.meta,
    ...tabular,
    fontFamily: font.mono,
    color: color.unknown,
    width: LABEL_W,
    textAlign: "right",
  },

  legend: { ...text.meta, color: color.muted },
});

export default SleepStages;
