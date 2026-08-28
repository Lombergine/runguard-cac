/**
 * The training year — a year of daily load, weeks as columns.
 *
 * Lifted whole out of the old `(tabs)/calendar.tsx`, which no longer exists: the
 * grid now sits at the foot of Stats, where the website has always kept it
 * (`website/src/components/athlete/tabs.tsx:536`). Everything below — the four
 * cell states, the ramp, the footer, the legend — is that screen's, unchanged in
 * meaning.
 *
 * Secondary by design (visual-spec § Nav): it exists to be scanned, not to
 * compete with the check-in. So: no interaction, no per-cell tap target, no
 * animation. A grid you read.
 *
 * The whole component turns on one question — what does an empty square mean?
 * The payload cannot answer it on its own, so this file answers it explicitly:
 *
 *   ABSENT  we have nothing for that day. Days before the first recorded
 *           activity IN THIS PAYLOAD — not the athlete's first ever, which the
 *           payload does not carry — and the pad days at the start of the first
 *           week column. Dashed, `well` fill — the only dashed object in the app.
 *   NO RUN  the plan scheduled rest and nothing was recorded. Dotted, no fill,
 *           recedes. Only the current plan week can produce this.
 *   ZERO    inside the observed period, nothing was run. Solid rule, `card`
 *           fill — a fact, styled like every other fact.
 *   LOAD    something was run. Solid rule, ember heat ramp.
 *
 * The important half is the first one. `GET /api/mobile/me` builds `calendar`
 * from `dailySeries()`, which emits a slot for EVERY day in the window and
 * fills the empty ones with `load: 0, km: 0`. Rendering those as zeros
 * wholesale would claim we watched an athlete run nothing for the eight months
 * before they connected a watch. The first recorded day is therefore the line
 * between "not recorded" and "recorded, and it was nothing".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SUNRISE: WHY THE RAMP NO LONGER STARTS PALE
 *
 * The old ramp ran `accentSoft → accent`, and its palest rung was safe only
 * because the old ground was a cool grey. On the cream ground it collapses:
 *
 *     well #F4EFE6  vs  accentSoft #FDECC8   1.02:1,  ΔL* 0.7
 *
 * An absent day and the athlete's easiest recorded day became the same object.
 * That is the one failure this grid cannot have, so the ramp was re-anchored
 * rather than merely re-hued: its palest rung is now `brand` itself, and it
 * deepens by mixing toward `ink` (the website's IntensityCalendar does the same
 * thing with a red heat ramp, but it can afford a pale foot because every one
 * of its cells prints its load as a numeral — here the fill IS the datum).
 *
 *     well #F4EFE6  vs  rung 0 #F59E0B      1.88:1,  ΔL* 22.4
 *     rungs step 8.5 / 9.1 / 9.0 / 9.6 ΔL* apart — monotonic in greyscale
 *
 * Nothing in the ramp is a colour of its own: every rung is a mix of `brand`,
 * `emberHot` and `ink`. No glyph is ever placed on one.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Absent, NoRun, Zero } from "./Nothing";
import { dayLabel, localDay, parseLocalDay } from "../lib/dates";
import { formatDistance } from "../lib/units";
import { ruleWidth, space } from "../theme/space";
import { Panel } from "./Panel";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/** One day of `calendar`, which rides along outside the `Profile` slice. */
export type CalendarDay = { date: string; load: number; km: number };

type CellKind = "absent" | "norun" | "zero" | "load";

type Cell = {
  date: string;
  kind: CellKind;
  level: number;
  /** KILOMETRES. Only meaningful when `kind` is "load". */
  km: number;
  /** The engine's daily load. Unitless — a model output, not a measurement. */
  load: number;
};

/* ------------------------------------------------------------------ *
 * Panel — the website's information unit (athlete/tabs.tsx:22): a title on the
 * left, an optional note on the right carrying the caveat, the unit or the
 * reading instruction, then the content. White card, `shadow.card`, one rule.
 *
 * Local, as it was on the screen this came from. This used to claim that being
 * built from tokens meant it "cannot drift from any other panel in the app even
 * though the code is not shared". It had already drifted when the claim was
 * written: the same head is spelled out TWELVE times across the app, in two
 * different title sizes (`text.baseSemi` here and on the charts, `text.meta` +
 * `font.bodySemi` on chat/profile/settings), with the note able to shrink in
 * only three of the twelve. Tokens keep the colours and the spacing honest;
 * they do not keep the structure honest. The copies belong in one
 * `components/Panel.tsx` — a change that crosses eleven other files, so it is
 * not made here.
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * Grid metrics — every number composed from theme/space.
 * ------------------------------------------------------------------ */

/**
 * One step up from the old 16px cell. At 16px a 1.5px dotted rule renders as
 * three or four dots a side and a rest day was indistinguishable from an empty
 * one at arm's length; 24px gives the dashed/dotted distinction room to exist.
 */
const CELL = space.xl;
const GAP = space.xs;
const COLUMN = CELL + GAP;
const ROWS = 7;

/**
 * The drawn height of the grid itself, exported so a screen can reserve exactly
 * this much while `/me` is still in flight. A skeleton that guesses is a layout
 * shift, and the athlete may tap before the data settles.
 */
export const YEAR_GRID_HEIGHT = ROWS * COLUMN - GAP;

/**
 * iOS refuses to draw a dashed or dotted border at radius 0, and absent must
 * stay dashed. `space.xs` is the smallest step on the scale — the same softened
 * square the website's cells use, still obviously a printed square.
 */
const CELL_RADIUS = space.xs;
/** Row labels sit outside the horizontal scroller and must clear "WED". */
const GUTTER = space.xxl;

/* ------------------------------------------------------------------ *
 * The intensity ramp — five rungs, `brand` deepening toward `ink`, mixed from
 * tokens so no colour is introduced that is not already in the system. Five
 * because that is what the website's IntensityCalendar uses, and the two
 * surfaces should band an athlete's year identically.
 * ------------------------------------------------------------------ */

type Channels = [number, number, number];

function channels(token: string): Channels {
  const n = parseInt(token.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(from: Channels, to: Channels, t: number): Channels {
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * t)) as Channels;
}

const RUNGS = 5;
/** The palest rung — see the header note on why it is not paler than this. */
const RAMP_LOW = channels(color.brand);
/** The hottest rung: emberHot carried down into ink. */
const RAMP_HIGH = mix(channels(color.emberHot), channels(color.ink), 0.55);

/**
 * Five rungs, palest first. EXPORTED for the HR-zone bar on the Stats screen,
 * which sits a few hundred pixels above this grid and encodes the same idea —
 * five steps of intensity, hotter is harder. Two different five-step encodings
 * on one screen would be two visual languages for one concept; sharing this one
 * also means the zone bar inherits the ramp's greyscale monotonicity, so it
 * survives colour-blindness and glare exactly as the grid does.
 */
export const EMBER_RAMP: string[] = Array.from({ length: RUNGS }, (_, step) => {
  const [r, g, b] = mix(RAMP_LOW, RAMP_HIGH, step / (RUNGS - 1));
  return `rgb(${r}, ${g}, ${b})`;
});

/**
 * The website's thresholds (IntensityCalendar `level()`), against the athlete's
 * own 95th percentile so one outlier week cannot flatten the year.
 *
 * Its `load < 10 → rest` shortcut is deliberately NOT adopted: here a recorded
 * day is a recorded day, and demoting a short run to "rest" would make the grid
 * lie about what happened.
 */
function rampIndex(load: number, p95: number): number {
  const x = load / Math.max(p95, 1);
  if (x < 0.3) return 0;
  if (x < 0.55) return 1;
  if (x < 0.75) return 2;
  if (x < 0.95) return 3;
  return 4;
}

/** "2026-10-14" → "Oct". The month vocabulary stays owned by lib/dates. */
function monthOf(iso: string): string {
  return dayLabel(iso).split(" ")[2];
}

/** "2026-10-14" → "Tue". Same reason. */
function weekdayOf(iso: string): string {
  return dayLabel(iso).split(" ")[0];
}

/** The Monday on or before `iso`. Local-calendar arithmetic only. */
function mondayOnOrBefore(iso: string): Date {
  const d = parseLocalDay(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** "18 days", welded — never a bare count with the noun rendered beside it. */
function daysLabel(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

type Grid = {
  /** Week columns, oldest first. `null` is a day after today — not drawn. */
  columns: (Cell | null)[][];
  /** Column index → month word, only where the month turns over. */
  monthMarks: { column: number; label: string }[];
  /** Row index → weekday word, for the three labelled rows. */
  rowLabels: (string | null)[];
  firstRecorded: string;
  totalKm: number;
  daysRun: number;
};

function buildGrid(entries: CalendarDay[], restDays: Set<string>): Grid | null {
  const recorded = entries.filter((e) => e.load > 0 || e.km > 0);
  if (recorded.length === 0) return null;

  const byDate = new Map(entries.map((e) => [e.date, e]));
  const firstRecorded = recorded.reduce(
    (min, e) => (e.date < min ? e.date : min),
    recorded[0].date,
  );
  const loads = recorded.map((e) => e.load).sort((a, b) => a - b);
  const p95 = loads[Math.min(loads.length - 1, Math.floor(loads.length * 0.95))];
  const totalKm = recorded.reduce((sum, e) => sum + e.km, 0);

  const today = localDay();
  const cursor = mondayOnOrBefore(entries[0].date);

  const columns: (Cell | null)[][] = [];
  const monthMarks: { column: number; label: string }[] = [];
  const rowLabels: (string | null)[] = [];
  let previousMonth: string | null = null;

  for (let iso = localDay(cursor); iso <= today; iso = localDay(cursor)) {
    const row = (cursor.getDay() + 6) % 7;
    if (row === 0) columns.push(new Array<Cell | null>(ROWS).fill(null));
    const column = columns[columns.length - 1];

    const entry = byDate.get(iso);
    let kind: CellKind;
    let level = 0;
    if (!entry || iso < firstRecorded) {
      kind = "absent";
    } else if (entry.load > 0 || entry.km > 0) {
      kind = "load";
      level = rampIndex(entry.load, p95);
    } else if (restDays.has(iso)) {
      kind = "norun";
    } else {
      kind = "zero";
    }
    column[row] = { date: iso, kind, level, km: entry?.km ?? 0, load: entry?.load ?? 0 };

    // Labels are read off real dates rather than derived, so a grid that is
    // one column short is still labelled correctly.
    if (rowLabels[row] === undefined) rowLabels[row] = weekdayOf(iso);
    const month = monthOf(iso);
    if (row === 0 && month !== previousMonth) {
      monthMarks.push({ column: columns.length - 1, label: month });
      previousMonth = month;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    columns,
    monthMarks,
    // Every other row, so the labels never collide at 11.5px.
    rowLabels: rowLabels.map((w, i) => (i % 2 === 0 ? w ?? null : null)),
    firstRecorded,
    totalKm,
    daysRun: recorded.length,
  };
}

/**
 * `days` is `/me`'s `calendar` (366 slots, one per day). `restDays` is the set
 * of ISO days the current plan scheduled as rest — the only thing that can turn
 * an unrecorded day inside the observed period into NO RUN rather than ZERO.
 *
 * THE ONE INTERACTION, and why it is shaped this way. The website prints each
 * day's load inside its cell and reveals the detail on HOVER — which means that
 * on a phone the detail is not merely collapsed, it is unreachable. So a tap is
 * the only way this grid can say as much as the website's does.
 *
 * The target is a COLUMN, not a cell. A cell is 24px, half the minimum target,
 * and 366 targets that are all too small to hit is worse than none; a column is
 * a 24 × 190 strip, and the day within it comes from where in that strip the
 * thumb landed. Horizontal precision is still one week — so the readout NAMES
 * THE EXPLICIT LOCAL DAY (non-negotiable #2), and a mis-hit is visible and
 * correctable rather than silently wrong.
 *
 * `Pressable` cancels on move, so the taps do not fight the horizontal
 * ScrollView and no scroll-offset arithmetic is needed: `locationY` is relative
 * to the column that was pressed, whatever the scroll position. Neither
 * scroller can perturb it — only `pageX/pageY` carry scroll offset, and this
 * reads `locationY`.
 *
 * `pointerEvents="box-only"` IS LOAD-BEARING, not tidiness. `locationY` is
 * measured against the touch TARGET, and the target is the deepest view that
 * hit-tests, not the view whose handler runs — iOS takes `uiTouch.view` and
 * walks up to the nearest Fabric view (`RCTSurfaceTouchHandler.mm:59,79-90`),
 * Android subtracts the target view's origin (`TouchesHelper.kt:61-64`).
 * Without this prop the seven cell `View`s are all valid targets, so a tap
 * landing on a cell — 24 of every 28px, i.e. six sevenths of the column —
 * reported a `locationY` inside that 24px CELL, and `locationY / COLUMN` was
 * then 0 for every one of them. The grid answered every tap with Monday of the
 * pressed week: tap Thursday's ember square, read Monday's sentence, with
 * Monday's date printed as if it were the day you touched. Only a tap in a 4px
 * gap between cells landed on the column and mapped correctly.
 *
 * `box-only` makes the column itself the target and its children none
 * (`RCTViewComponentView.mm:779-780`, `TouchTargetHelper.kt:351-352`), which is
 * what the arithmetic below has always assumed. Nothing else changes: the cells
 * are inert `View`s with no handlers of their own.
 *
 * This is the same interaction the charts settled on (`components/chart/Plot`) —
 * tap to select, one persistent readout beneath, pre-filled so the first read is
 * free. One answer to "how do I read a value", not two. Note `Plot` puts its
 * `Pressable` above the drawing as an empty `absoluteFill` overlay with no
 * children, so it is the target by construction; this grid nests its targets
 * inside the pressable and needs the prop to get the same guarantee.
 *
 * What has NOT changed: no animation, no per-cell chrome, no tooltip, and the
 * grid is still one accessibility node with one sentence.
 */
/**
 * The website's five load words (`IntensityCalendar.tsx:34`), kept verbatim so
 * an athlete reading both surfaces hears the same vocabulary.
 */
const LEVEL_WORD = ["Recovery", "Easy", "Moderate", "Hard", "Max effort"] as const;

/**
 * What one day says. FOUR different sentences, because the grid draws four
 * different facts and non-negotiable #4 exists to stop them collapsing:
 *
 *   absent  we have nothing for this day
 *   norun   the plan scheduled a rest day
 *   zero    a day inside the recorded period with no run on it
 *   load    a run, with its distance and the model's load figure
 *
 * The website has one hover string for all of these and no touch equivalent at
 * all, so on a phone the detail is currently unreachable rather than merely
 * collapsed.
 *
 * `load` is deliberately NOT dressed as a measurement: it is a model output with
 * no unit, and the sentence says so rather than printing a bare number that
 * looks like one.
 *
 * THE ABSENT SENTENCE CLAIMS NOTHING ABOUT WHY. It used to end "This is before
 * your first synced run", which is the same false claim the footnote below
 * carried until an audit removed it, for the same reason: `firstRecorded` is
 * the earliest RECORDED day inside a fixed 366-day payload window, so a dashed
 * cell means only that this window has nothing for that day — the athlete may
 * well have been running, and on the dev roster all 14 athletes have activities
 * older than the window. A dashed cell can also be a pad day at the head of the
 * first column, or a day the payload simply does not carry, neither of which is
 * "before your first run" either. So the sentence says what is true of all
 * three: nothing recorded. The footnote already tells the reader where the
 * window starts, which is the part the grid actually knows.
 */
function readoutFor(cell: Cell): string {
  const day = dayLabel(cell.date);
  switch (cell.kind) {
    case "absent":
      // The same words as the legend's <Absent/> swatch, so the tapped cell and
      // the key that explains it cannot describe the same square differently.
      return `${day} — nothing recorded for this day.`;
    case "norun":
      return `${day} — rest day, no run scheduled.`;
    case "zero":
      return `${day} — no run recorded.`;
    default:
      return `${day} — ${formatDistance(cell.km)} · ${LEVEL_WORD[cell.level]} (load ${Math.round(cell.load)})`;
  }
}

export function YearGrid({
  days,
  restDays,
}: {
  days: CalendarDay[];
  restDays: Set<string>;
}) {
  const grid = useMemo(() => buildGrid(days, restDays), [days, restDays]);

  /**
   * Pre-filled with the most recent day that has a run on it, as the charts
   * pre-fill with their latest point: tappability is undiscoverable, so the
   * first read has to be free.
   */
  const latest = useMemo(() => {
    if (!grid) return null;
    for (let c = grid.columns.length - 1; c >= 0; c--) {
      for (let r = ROWS - 1; r >= 0; r--) {
        const cell = grid.columns[c][r];
        if (cell && cell.kind === "load") return cell;
      }
    }
    return null;
  }, [grid]);

  const [picked, setPicked] = useState<Cell | null>(null);
  const shown = picked ?? latest;

  return (
    <>
      <Panel title="Your training year" note="daily load · hotter is harder">
        {grid === null ? (
          <Absent label="No training recorded in the last 12 months." />
        ) : (
          <>
            <View style={styles.gridRow}>
              <View style={styles.gutter}>
                <View style={styles.monthSpacer} />
                {grid.rowLabels.map((label, row) => (
                  <View key={row} style={styles.rowLabelCell}>
                    {label ? <Text style={styles.rowLabel}>{label}</Text> : null}
                  </View>
                ))}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {/* One image with one sentence, not 366 unlabelled squares: a
                    screen reader walking cell by cell would read nothing but
                    "view" 366 times, and the shape of the year is the datum. */}
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`Training grid. ${daysLabel(grid.daysRun)} run in the last 12 months, ${formatDistance(grid.totalKm, 0)} total. This grid starts at ${dayLabel(grid.firstRecorded)}; anything earlier is outside it.`}
                >
                  <View style={styles.monthRow}>
                    {grid.monthMarks.map((mark) => (
                      <Text
                        key={mark.column}
                        style={[styles.monthLabel, { left: mark.column * COLUMN }]}
                      >
                        {mark.label}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.grid}>
                    {grid.columns.map((column, i) => (
                      <Pressable
                        key={i}
                        style={styles.column}
                        /* The column must BE the touch target — see the header.
                           Without this the cells are the targets and every tap
                           on one resolves to row 0. */
                        pointerEvents="box-only"
                        /*
                         * Half the gap on each side, so the 4pt channel between
                         * columns stops being a dead zone: every x in the grid
                         * now belongs to exactly one column.
                         *
                         * HALF, not more. `target.min` is 48 and a column is 24
                         * wide on a 28pt pitch, so a target that actually
                         * reached 48 would have to overlap its neighbours by
                         * 20pt — and an overlapping hitSlop does not widen a
                         * target, it makes the winner ambiguous and sends taps
                         * to the wrong day. 48 is unreachable at this pitch by
                         * construction; 366 cells in one screen is the reason
                         * the header calls this a deliberate tradeoff. What is
                         * fixable is the gap, and this fixes it.
                         */
                        hitSlop={{ left: GAP / 2, right: GAP / 2 }}
                        // The row is derived from where in the column the thumb
                        // landed; each row is CELL + GAP tall.
                        onPress={(e) => {
                          const row = Math.floor(e.nativeEvent.locationY / COLUMN);
                          const cell = column[Math.max(0, Math.min(ROWS - 1, row))];
                          if (cell) setPicked(cell);
                        }}
                      >
                        {column.map((cell, row) =>
                          cell === null ? (
                            <View key={row} style={styles.future} />
                          ) : (
                            <View
                              key={row}
                              style={[
                                styles.cell,
                                cell.kind === "absent" && styles.cellAbsent,
                                cell.kind === "norun" && styles.cellNoRun,
                                cell.kind === "zero" && styles.cellZero,
                                cell.kind === "load" && styles.cellLoad,
                                cell.kind === "load" && {
                                  backgroundColor: EMBER_RAMP[cell.level],
                                },
                                // The selected day. A ring, not a fill: the fill
                                // is the datum and overwriting it would hide the
                                // thing being read.
                                picked?.date === cell.date && styles.cellPicked,
                              ]}
                            />
                          ),
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>

            {/*
              The readout. One line, below the grid, always present — the
              website's equivalent appears only on hover and so does not exist
              on a phone at all.
            */}
            {shown ? (
              <Text style={styles.readout} accessibilityLiveRegion="polite">
                {readoutFor(shown)}
              </Text>
            ) : null}

            {/* The two figures the old calendar screen carried in tiles above
                the grid. They are facts about the year, so they stay with the
                year — as a caption, not as tiles, because the tiles at the top
                of Stats are the athlete's headline numbers and these are not. */}
            <Text style={styles.note}>
              {`${daysLabel(grid.daysRun)} run · ${formatDistance(grid.totalKm, 0)} in the last 12 months.`}
            </Text>
            <Text style={styles.footnote}>
              {/*
                NOT "Nothing recorded before …", which is what this said and
                which is FALSE for every athlete on the roster: `firstRecorded`
                is the earliest day in the PAYLOAD, and the payload is a fixed
                366-day window ending today (`dailySeries(acts, 366)`) — nothing
                to do with when the athlete started. An audit checked the dev
                database: all 14 of 14 athletes have runs older than that window,
                161 activities in total, the oldest 378 days ago. The grid was
                stating as fact something it has no way to know.

                It knows where its own window starts, so that is what it says.
                The true answer needs an earliest-activity field on the payload,
                which `CoreProfile` does not carry.
              */}
              This grid starts at {dayLabel(grid.firstRecorded)}. Anything
              earlier is outside it.
            </Text>
          </>
        )}
      </Panel>

      <Panel title="Reading the grid" note="dashed means not recorded">
        <View style={styles.legend}>
          <View>
            <Text style={styles.legendLabel}>Ember cell · a day that was run</Text>
            <View style={styles.rampRow}>
              {EMBER_RAMP.map((fill, i) => (
                <View
                  key={i}
                  style={[styles.cell, styles.cellLoad, { backgroundColor: fill }]}
                />
              ))}
            </View>
            <Text style={styles.note}>
              Deeper ember is a harder day than a paler one. Even the palest
              ember cell is a day that was run.
            </Text>
          </View>

          <Absent eyebrow="Dashed cell" label="Nothing recorded for that day." />
          <Zero eyebrow="Solid white cell" unit="mi" />
          <NoRun eyebrow="Dotted cell" />
        </View>
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({

  gridRow: { flexDirection: "row" },
  gutter: { width: GUTTER },
  monthSpacer: { height: CELL, marginBottom: GAP },
  rowLabelCell: { height: CELL, marginBottom: GAP, justifyContent: "center" },
  rowLabel: { ...text.micro, color: color.muted },

  monthRow: { height: CELL, marginBottom: GAP },
  monthLabel: { ...text.micro, color: color.muted, position: "absolute" },

  grid: { flexDirection: "row", height: YEAR_GRID_HEIGHT },
  column: { width: CELL, marginRight: GAP },
  /**
   * The selected day. `ink` at the app's own rule weight, drawn INSIDE the cell
   * so the column keeps its width and the grid does not reflow on a tap. Chosen
   * over a colour change because every colour in this grid already means
   * something.
   */
  cellPicked: { borderWidth: ruleWidth, borderColor: color.ink },
  /** The tapped day's sentence. Body voice, muted — it reports, it does not rate. */
  readout: { ...text.meta, color: color.ink2, marginTop: space.md },

  /** A day that has not happened yet. Drawn as nothing at all — see the note. */
  future: { height: CELL, marginBottom: GAP },

  cell: {
    height: CELL,
    width: CELL,
    marginBottom: GAP,
    borderWidth: ruleWidth,
    borderRadius: CELL_RADIUS,
  },
  /* The four cell states carry the same meanings as components/Nothing, with
     one deliberate deviation: at cell size a `ruleSoft` dotted border is a
     7:1-lighter ghost that vanishes in glare, so a rest day is dotted in
     `ruleStrong` instead. Dotted still means rest, dashed still means absent —
     only the weight of the dots changed, so that a rest day cannot be mistaken
     for a day that has not happened yet. */
  cellAbsent: {
    backgroundColor: color.well,
    borderStyle: "dashed",
    borderColor: color.rule,
  },
  cellNoRun: {
    borderStyle: "dotted",
    borderColor: color.ruleStrong,
  },
  cellZero: {
    backgroundColor: color.card,
    borderStyle: "solid",
    borderColor: color.rule,
  },
  cellLoad: {
    borderStyle: "solid",
    borderColor: color.rule,
  },

  note: { ...text.meta, color: color.muted, marginTop: space.md },
  /** The absent line sits tighter under the caption it qualifies. */
  footnote: { ...text.meta, color: color.muted, marginTop: space.xs },

  legend: { gap: space.lg },
  legendLabel: { ...text.meta, color: color.ink2, marginBottom: space.sm },
  rampRow: { flexDirection: "row", gap: GAP },
});

export default YearGrid;
