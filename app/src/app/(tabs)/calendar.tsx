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
 *   LOAD    something was run. Solid rule, `accentSoft` → `accent` ramp.
 *
 * The important half is the first one. `GET /api/mobile/me` builds `calendar`
 * from `dailySeries()`, which emits a slot for EVERY day in the window and
 * fills the empty ones with `load: 0, km: 0`. Rendering those as zeros
 * wholesale would claim we watched an athlete run nothing for the eight months
 * before they connected a watch. The first recorded day is therefore the line
 * between "not recorded" and "recorded, and it was nothing".
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
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

/** One day of `calendar`, which rides along outside the `Profile` slice. */
type CalendarDay = { date: string; load: number; km: number };

/** The response carries more than `Profile` declares; this is the extra we read. */
type WithCalendar = Profile & { calendar?: CalendarDay[] };

type CellKind = "absent" | "norun" | "zero" | "load";

type Cell = { date: string; kind: CellKind; level: number };

/* ------------------------------------------------------------------ *
 * Grid metrics — every number composed from theme/space.
 * ------------------------------------------------------------------ */

const CELL = space.lg;
const GAP = space.xs;
const COLUMN = CELL + GAP;
const ROWS = 7;
const GRID_HEIGHT = ROWS * COLUMN - GAP;
/**
 * iOS refuses to draw a dashed or dotted border at radius 0, and absent must
 * stay dashed. The smallest token there is, so cells still read as printed
 * squares rather than dots.
 */
const CELL_RADIUS = ruleWidth;
/** Row labels sit outside the horizontal scroller and must clear "WED". */
const GUTTER = space.xxl;

/* ------------------------------------------------------------------ *
 * The intensity ramp — accentSoft → accent, mixed from the two tokens so no
 * colour is introduced that is not already in the system.
 * ------------------------------------------------------------------ */

function channels(token: string): [number, number, number] {
  const n = parseInt(token.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RAMP: string[] = [0, 1, 2, 3].map((step) => {
  const t = step / 3;
  const from = channels(color.accentSoft);
  const to = channels(color.accent);
  const mixed = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
});

function rampIndex(load: number, max: number): number {
  const ratio = max > 0 ? load / max : 0;
  if (ratio <= 0.25) return 0;
  if (ratio <= 0.5) return 1;
  if (ratio <= 0.75) return 2;
  return 3;
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
  const maxLoad = recorded.reduce((m, e) => (e.load > m ? e.load : m), 0);
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
      level = rampIndex(entry.load, maxLoad);
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
              <View style={styles.skeletonStat} />
              <View style={styles.skeletonStat} />
            </>
          ) : null}
          {grid ? (
            <>
              <Stat label="Distance" value={formatDistance(grid.totalKm, 0)} />
              <Stat
                label="Days run"
                value={`${grid.daysRun} ${grid.daysRun === 1 ? "day" : "days"}`}
              />
            </>
          ) : null}
        </View>

        <View>
          <Text style={styles.eyebrow}>Last 12 months · daily load</Text>

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
        </View>

        <View style={styles.legend}>
          <Text style={styles.eyebrow}>Reading the grid</Text>

          <View>
            <Text style={styles.legendLabel}>Blue cell · a day that was run</Text>
            <View style={styles.rampRow}>
              {RAMP.map((fill, i) => (
                <View
                  key={i}
                  style={[styles.cell, styles.cellLoad, { backgroundColor: fill }]}
                />
              ))}
            </View>
            <Text style={styles.note}>
              Deeper blue is a harder day than a paler one.
            </Text>
          </View>

          <Absent
            eyebrow="Dashed cell"
            label="Nothing recorded for that day."
          />
          <Zero eyebrow="Solid white cell" unit="mi" />
          <NoRun eyebrow="Dotted cell" />
        </View>
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
  stats: { flexDirection: "row", gap: space.xxl, minHeight: space.xxxl },
  skeletonStat: {
    width: space.xxxl * 2,
    height: space.xl,
    borderRadius: radius.control,
    backgroundColor: color.well,
  },
  eyebrow: { ...text.micro, color: color.muted, marginBottom: space.md },
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
  /* The four cell states mirror components/Nothing exactly. */
  cellAbsent: {
    backgroundColor: color.well,
    borderStyle: "dashed",
    borderColor: color.rule,
  },
  cellNoRun: {
    borderStyle: "dotted",
    borderColor: color.ruleSoft,
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

  legend: { gap: space.md },
  legendLabel: { ...text.meta, color: color.ink2, marginBottom: space.sm },
  rampRow: { flexDirection: "row", gap: GAP },
});
