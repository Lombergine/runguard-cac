/**
 * The training calendar — a year of daily load, weeks as columns.
 *
 * Secondary by design (visual-spec § Nav): it exists to be scanned, not to
 * compete with the check-in. So: no interaction, no per-cell tap target, no
 * animation. A grid you read.
 *
 * The whole screen turns on one question — what does an empty square mean? The
 * payload cannot answer it on its own, so this file answers it explicitly:
 *
 *   ABSENT  we have nothing for that day. Days before the athlete's first
 *           recorded activity, and the pad days at the start of the first week
 *           column. Dashed, `well` fill — the only dashed object in the app.
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
 * That is the one failure this screen cannot have, so the ramp was re-anchored
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
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Absent, NoRun, Zero } from "../../components/Nothing";
import { Stat } from "../../components/Stat";
import { getProfile } from "../../lib/api";
import { dayLabel, localDay, parseLocalDay } from "../../lib/dates";
import { formatDistance } from "../../lib/units";
import type { Profile } from "../../lib/types";
import { layout, radius, ruleWidth, space } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/** One day of `calendar`, which rides along outside the `Profile` slice. */
type CalendarDay = { date: string; load: number; km: number };

/** The response carries more than `Profile` declares; this is the extra we read. */
type WithCalendar = Profile & { calendar?: CalendarDay[] };

type CellKind = "absent" | "norun" | "zero" | "load";

type Cell = { date: string; kind: CellKind; level: number };

/* ------------------------------------------------------------------ *
 * Panel — the website's information unit (athlete/tabs.tsx:22): a title on the
 * left, an optional note on the right carrying the caveat, the unit or the
 * reading instruction, then the content. White card, `shadow.card`, one rule.
 *
 * Local to this screen because components/ is not this pass's to change; the
 * shadow comes from the token, so it cannot drift from any other panel.
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
const GRID_HEIGHT = ROWS * COLUMN - GAP;
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

const RAMP: string[] = Array.from({ length: RUNGS }, (_, step) => {
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
    column[row] = { date: iso, kind, level };

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

export default function CalendarScreen() {
  const [profile, setProfile] = useState<WithCalendar | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const grid = useMemo(() => {
    if (!profile) return null;
    const rest = new Set(
      profile.plan.days.filter((d) => d.type === "Rest").map((d) => d.date),
    );
    return buildGrid(profile.calendar ?? [], rest);
  }, [profile]);

  if (failed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Text style={styles.failed}>Your calendar could not be loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.page}>
        {/*
          The row keeps its height in every state, so nothing below it moves.
          A pending figure is a grey bar, never an em dash: "—" means "not
          recorded" everywhere in this app and must not stand in for "loading".
        */}
        <View style={styles.stats}>
          {!profile ? (
            <>
              <View style={styles.tile}>
                <View style={styles.skeletonStat} />
              </View>
              <View style={styles.tile}>
                <View style={styles.skeletonStat} />
              </View>
            </>
          ) : null}
          {grid ? (
            <>
              <View style={styles.tile}>
                <Stat label="Distance" value={formatDistance(grid.totalKm, 0)} />
              </View>
              <View style={styles.tile}>
                <Stat
                  label="Days run"
                  value={`${grid.daysRun} ${grid.daysRun === 1 ? "day" : "days"}`}
                />
              </View>
            </>
          ) : null}
        </View>

        <Panel title="Last 12 months" note="daily load · hotter is harder">
          {/* Reserves the grid's exact height so nothing shifts as data lands. */}
          {!profile ? <View style={styles.skeleton} /> : null}

          {profile && !grid ? (
            <Absent label="No training recorded in the last 12 months." />
          ) : null}

          {grid ? (
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
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`Training grid. ${grid.daysRun} days run in the last 12 months, ${formatDistance(grid.totalKm, 0)} total. Nothing recorded before ${dayLabel(grid.firstRecorded)}.`}
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
                      <View key={i} style={styles.column}>
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
                                  backgroundColor: RAMP[cell.level],
                                },
                              ]}
                            />
                          ),
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          ) : null}

          {grid ? (
            <Text style={styles.note}>
              Nothing recorded before {dayLabel(grid.firstRecorded)}.
            </Text>
          ) : null}
        </Panel>

        <Panel title="Reading the grid" note="dashed means not recorded">
          <View style={styles.legend}>
            <View>
              <Text style={styles.legendLabel}>Ember cell · a day that was run</Text>
              <View style={styles.rampRow}>
                {RAMP.map((fill, i) => (
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
    gap: layout.section,
  },

  /* Panels and tiles carry the same elevation — a shadow is depth here, never
     emphasis, so no card on this screen is louder than another. */
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  panelHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.md,
  },
  panelTitle: { ...text.baseSemi, color: color.ink },
  /* muted on `card` is 5.16:1 — the note is small and often the only caveat. */
  panelNote: { ...text.meta, color: color.muted },

  stats: { flexDirection: "row", gap: space.md },
  tile: {
    flex: 1,
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  /* 48 = the micro label's 16 line-box + space.xs + the stat's 28, so a tile is
     exactly as tall before the figure lands as after. */
  skeletonStat: {
    height: space.xxxl,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },

  failed: { ...text.base, color: color.ink2 },
  note: { ...text.meta, color: color.muted, marginTop: space.md },

  skeleton: {
    height: GRID_HEIGHT,
    borderRadius: CELL_RADIUS,
    backgroundColor: color.well,
  },

  gridRow: { flexDirection: "row" },
  gutter: { width: GUTTER },
  monthSpacer: { height: CELL, marginBottom: GAP },
  rowLabelCell: { height: CELL, marginBottom: GAP, justifyContent: "center" },
  rowLabel: { ...text.micro, color: color.muted },

  monthRow: { height: CELL, marginBottom: GAP },
  monthLabel: { ...text.micro, color: color.muted, position: "absolute" },

  grid: { flexDirection: "row", height: GRID_HEIGHT },
  column: { width: CELL, marginRight: GAP },

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

  legend: { gap: space.lg },
  legendLabel: { ...text.meta, color: color.ink2, marginBottom: space.sm },
  rampRow: { flexDirection: "row", gap: GAP },
});
