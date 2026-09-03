/**
 * Stats — the athlete's own numbers, in the website's order
 * (`website/src/components/athlete/tabs.tsx:428-541`): the body scan, five
 * headline tiles, the week's heart-rate zones, PRs against predicted times, the
 * charts, and the training year.
 *
 * THREE THINGS THIS SCREEN IS CAREFUL ABOUT
 *
 * 1. EVERY TILE IS INCAPABLE OF PRINTING A NUMBER IT DOES NOT HAVE. The five
 *    figures are model outputs and rolling windows, not measurements — a
 *    fitness score with no synced running behind it is the model talking to
 *    itself (`lib/types.ts:258`), and a VO₂max is null until a wearable reports
 *    one. Each value below is `string | null`, and null goes to `<Tile>`'s dash
 *    in `color.unknown` with "Not recorded" under it. Nothing on this screen
 *    substitutes a zero for an absence.
 *
 * 2. NOTHING HERE RANKS THE ATHLETE. `risk.zone`, `risk.zoneLabel` and
 *    `risk.score` are deliberately not surfaced (the website does not show them
 *    either — `tabs.tsx:47-48`), and the peer percentiles that used to sit on
 *    this tab were removed at the source (`website/src/lib/profile.ts:269-271`)
 *    because ranking teenagers against each other on volume and predicted times
 *    is social-comparison pressure in a sport that already carries elevated
 *    disordered-eating risk. Do not reintroduce either.
 *
 * 3. THE NUMBERS ARE READABLE WITHOUT A POINTER. The website exposes each
 *    HR-zone segment's minutes only through a native `title` attribute, which
 *    is a hover affordance and simply does not exist on a phone. Here every
 *    zone prints its own minutes in the legend, welded to its unit, whether or
 *    not anything is ever tapped.
 */
import { useMemo } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BodyScan } from "../../components/BodyScan";
import { Press } from "../../components/Press";
import { EXPLAINERS } from "../../components/InfoDot";
import { Absent } from "../../components/Nothing";
import { PrTable } from "../../components/PrTable";
import { HrZones } from "../../components/HrZones";
import { Tile } from "../../components/Tile";
import { YEAR_GRID_HEIGHT, YearGrid } from "../../components/YearGrid";
import { AcwrChart } from "../../components/charts/AcwrChart";
import { FitnessChart } from "../../components/charts/FitnessChart";
import { LoadChart } from "../../components/charts/LoadChart";
import { PaceChart } from "../../components/charts/PaceChart";
import { WeeklyKmChart } from "../../components/charts/WeeklyKmChart";
import { useProfile } from "../../lib/profileStore";
import { fitnessKnown } from "../../lib/readiness";
import type { Badge, Profile } from "../../lib/types";
import { formatDistance } from "../../lib/units";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/**
 * This screen reads `Profile` directly.
 *
 * It was originally written against a local `WithStats` widening, because
 * `Profile` did not yet declare `calendar`, `prs`, `predictions`, `badges` or
 * `fitness.trend`. They are all declared now, and `lib/types.ts` opens by saying
 * why that matters: shapes redefined locally are what stop independently-built
 * pieces recombining. Every one of those legs is still OPTIONAL there, so each
 * read below must face the possibility that the payload did not carry it.
 */

/** The five zone keys, in order. */

/**
 * The longest streak, out of the 7-day-streak badge.
 *
 * THIS IS THE ONE FRAGILE READ ON THE SCREEN and it is fragile at the source,
 * not here: the server ships the streak only as English inside a badge caption
 * — `detail: \`Longest streak: ${bestStreak} days\`` (engine.ts:656) — so both
 * surfaces have to take a sentence apart to get the number back out. The
 * website does it with `.replace("Longest streak: ", "")`, which means a
 * one-word edit to that caption silently turns its tile into the whole
 * sentence rendered as a value.
 *
 * So: match the DIGITS rather than the prose around them, and treat anything
 * that does not match — a missing badge, a reworded caption, a payload without
 * `badges` — as not recorded. A streak we cannot read is unknown; it is never
 * zero, because "you have never trained two days running" is a claim about the
 * athlete and this is only a claim about a string.
 *
 * The real fix is a numeric field on the payload. See the report for this
 * stage; if one lands, delete this function and read it.
 */
function longestStreak(badges: Badge[] | undefined): string | null {
  const detail = badges?.find((b) => b.id === "streak7")?.detail;
  const match = detail?.match(/(\d+)\s*days?/);
  if (!match) return null;
  const n = Number(match[1]);
  // Welded: the noun is part of the figure, never a numeral with "days" set
  // somewhere else in the tile.
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/* ------------------------------------------------------------------ *
 * Panel — the website's information unit (athlete/tabs.tsx:22): title left, an
 * optional note right carrying the caveat or the unit, then the content.
 *
 * Local to this screen, as it is on every screen that has one: components/ is
 * not this pass's to add to. Every value comes from a token, so the panels
 * cannot drift apart even though the code is not shared.
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

/**
 * The screen header. `stale` adds ONE quiet line when a refetch failed over
 * numbers already on the glass; the whole-page failure stays reserved for
 * having nothing at all.
 */
function Header({ stale }: { stale?: boolean }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Your numbers</Text>
      <Text style={styles.heading}>Stats</Text>
      <Text style={styles.note}>
        Fitness, load and heart rate — and the year behind them.
      </Text>
      {stale ? (
        <Text style={styles.note}>
          Could not reach your server just now. These are the numbers last
          loaded.
        </Text>
      ) : null}
    </View>
  );
}


export default function StatsScreen() {
  // Shared `/me`, and with it the single 401 path: a revoked token ends the
  // session from inside the store (lib/profileStore), never from a screen.
  const { profile: shared, state, refreshing, refresh } = useProfile();
  const profile: Profile | null = shared;
  const failed = state === "failed";

  /**
   * Rest days from the current plan week — the only thing that can turn an
   * unrecorded day inside the observed period into NO RUN rather than ZERO.
   * Memoised because it is a Set: a fresh one every render would rebuild the
   * whole 366-day grid on every render.
   */
  const restDays = useMemo(
    () =>
      new Set(
        (profile?.plan.days ?? [])
          .filter((d) => d.type === "Rest")
          .map((d) => d.date),
      ),
    [profile],
  );

  // Only with nothing on screen. A failed refetch over loaded numbers keeps
  // them: they were true when they were fetched, and a transport failure is a
  // fact about the network, not about the athlete.
  if (failed && profile === null) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Header />
          <View style={styles.panel}>
            <Text style={styles.failed}>
              {"Your stats could not be loaded. The RunGuard server could not be reached."}
            </Text>
            <Press
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your stats again"
              style={styles.retry}
              pressedStyle={styles.retryPressed}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Press>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Loading. Grey blocks at the height the real thing will occupy — never "—",
  // which means "not recorded" everywhere in this app and must not stand in
  // for "not here yet".
  if (profile === null) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.page}>
          <Header />
          <View style={styles.sections}>
            {/* The body scan. Its drawn height is the component's own; when
                components/BodyScan exports one, reserve from that constant
                rather than from this block. */}
            <View style={[styles.skeleton, styles.skeletonScan]} />
            <View style={styles.tileGrid}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={[styles.skeleton, styles.skeletonTile]} />
              ))}
            </View>
            <View style={[styles.skeleton, styles.skeletonPanel]} />
            <View style={[styles.skeleton, styles.skeletonPanel]} />
            <View style={[styles.skeleton, styles.skeletonYear]} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const fitness = profile.fitness;
  // `fitnessKnown`, not `hasActivityHistory` — see lib/readiness.ts. The
  // latter never goes false, so it cannot tell a real score from the model's
  // `score = 50` fallback.
  const hasHistory = fitnessKnown(profile);
  const prs = profile.prs ?? [];
  const predictions = profile.predictions ?? {};

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        /* Pull to refetch. Nothing below dims while it runs: a figure that
           fades reads as a figure losing confidence, which it is not. */
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        <Header stale={failed} />

        <View style={styles.sections}>
          {/* 1. Body scan — open injuries and today's reported soreness. */}
          <BodyScan
            injuries={profile.injuries ?? []}
            soreness={profile.todaySoreness}
          />

          {/*
            2. The five headline figures.

            Each carries the website's explainer on an `info` dot beside its
            label (`tabs.tsx:448`, `:454`, `:460`, `:466`, `:471`). The copy is
            in `components/InfoDot`'s `EXPLAINERS`, not inline here, so the two
            surfaces can be diffed in one pass. Nothing in this grid moved to
            make room: the dot is drawn at the micro line height, so the label
            row is the height it always was.
          */}
          <View style={styles.tileGrid}>
            {/* `Tile` is `flex: 1` and takes no style prop, so the two-up
                geometry lives in these wrappers: without a flex BASIS all five
                would share one row. */}
            <View style={styles.tileCell}>
              <Tile
                label="Fitness score"
                info={EXPLAINERS.fitnessScore}
                /* 0–100 MODEL OUTPUT, not a measurement, and worthless
                   without synced running behind it — so with no activity
                   history it is unknown rather than low. The scale is welded
                   on: a bare "64" could be anything. */
                value={hasHistory && fitness ? `${fitness.score} / 100` : null}
                sub={
                  hasHistory && fitness
                    ? `${fitness.trend ?? "trend not recorded"} · ${fitness.tier} tier`
                    : undefined
                }
              />
            </View>
            <View style={styles.tileCell}>
              <Tile
                label="VO₂max"
                info={EXPLAINERS.vo2max}
                /* null means no wearable ever reported one (`types.ts:266`).
                   Absent, never 0 — a zero here would be a claim about the
                   athlete's heart. */
                value={
                  fitness && fitness.vo2max !== null
                    ? `${fitness.vo2max} ml/kg/min`
                    : null
                }
                sub="Apple Cardio Fitness"
              />
            </View>
            <View style={styles.tileCell}>
              <Tile
                label="Week TRIMP"
                info={EXPLAINERS.weekTrimp}
                value={profile.load ? `${profile.load.weekTrimp} TRIMP` : null}
                sub="training impulse, last 7 days"
              />
            </View>
            <View style={styles.tileCell}>
              <Tile
                label="7-day mi"
                info={EXPLAINERS.sevenDayMi}
                /* A rolling window, not since Monday.

                   `weekKm` is always a real number, so the guard is
                   `hasActivityHistory`, not the value — the same guard
                   `(tabs)/index.tsx:593` already puts on this exact figure,
                   and the one `(tabs)/recovery.tsx` cites as precedent. This
                   screen was the one place the figure went out ungated: with
                   nothing ever synced it read "0 mi · target 42.3 mi", which
                   is a blank wearing the clothes of a measured fact.

                   Past the gate, "0 mi" stays a measured zero and keeps the
                   solid, un-dashed treatment — a week the athlete really did
                   not run is a fact, not an absence. */
                value={hasHistory ? formatDistance(profile.risk.weekKm) : null}
                sub={
                  profile.weeklyTargetKm !== undefined
                    ? `target ${formatDistance(profile.weeklyTargetKm)}`
                    : "rolling 7 days"
                }
              />
            </View>
            <View style={styles.tileCell}>
              <Tile
                label="Longest streak"
                info={EXPLAINERS.longestStreak}
                /* Read out of a badge caption — see longestStreak().

                   Gated as well, because the parse cannot tell the two zeros
                   apart. `computeBadges` (engine.ts:636-643, 656) always ships
                   four badges, and with no synced running the caption is the
                   well-formed sentence "Longest streak: 0 days" — which the
                   digit match reads perfectly and turns into "0 days". That is
                   the claim "you have never trained two days running" made
                   about an athlete nothing is known about, which the note on
                   longestStreak() says this tile must never make. Past the
                   gate a real 0 stays a 0: no runs in 120 days is a fact. */
                value={hasHistory ? longestStreak(profile.badges) : null}
                sub="in a row · last 120 days"
              />
            </View>
          </View>

          {/* 3. Heart-rate zones. */}
          <HrZones zones={profile.load?.weekZones} />

          {/* 4. PRs against what the model thinks you would run today. */}
          {prs.length > 0 ? (
            <PrTable prs={prs} predictions={predictions} />
          ) : (
            <Panel title="PRs & predicted times" note="no races logged yet">
              <Absent label="No personal records recorded yet." />
            </Panel>
          )}

          {/*
            5. THE CHARTS. Each owns its own Panel — do not wrap them.

            `risk.series` for the last two, NOT the top-level `series`: /me trims
            that copy to `{date, load, km, acwr}`, and a row missing `acute`
            arrives holding `undefined` while `DailyPoint` insists it is a
            number. chartData coalesces and marks.tsx treats it as absent, so the
            failure is now contained — but the right series is still this one.
          */}
          <WeeklyKmChart weeks={profile.weeks} />
          <PaceChart paceSeason={profile.paceSeason} />
          {/*
            The fitness chart carries the SAME gate as the fitness tile above.
            `fitness.score` is a model output, and with no synced running behind
            it the model is talking to itself — a confident line drawn from
            nothing is the failure this app keeps finding in its own engine
            (`readiness` scoring 100, `freshness` scoring 67). The chart's props
            are the weekly series alone, so it cannot apply the gate itself;
            it has to be applied here, at the call site.
          */}
          {fitnessKnown(profile) ? (
            <FitnessChart weekly={profile.fitness?.weekly} />
          ) : null}
          <AcwrChart series={profile.risk.series} />
          <LoadChart series={profile.risk.series} />

          {/* 6. The training year. */}
          <YearGrid days={profile.calendar ?? []} restDays={restDays} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A tile's exact drawn height: 16 padding + 16 label + 4 + 28 value + 4 + 20
 * sub + 16 padding. Composed from the space scale so the skeleton cannot drift
 * from the tile — 48·2 + 8.
 */
const TILE_HEIGHT = space.xxxl * 2 + space.sm;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  sections: { gap: layout.section },

  header: { marginBottom: layout.section },
  eyebrow: { ...text.micro, color: color.muted },
  heading: { ...text.prompt, color: color.ink, marginTop: space.xs },
  note: { ...text.meta, color: color.muted, marginTop: space.sm },

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
  panelNote: { ...text.meta, color: color.muted },

  failed: { ...text.base, color: color.ink2 },
  /** Ember FILL with an ink glyph on it — `brand` is 2.01:1 and takes no word. */
  retry: {
    marginTop: space.xl,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    backgroundColor: color.brand,
  },
  retryPressed: { backgroundColor: color.press },
  retryLabel: { ...text.baseSemi, color: color.ink },

  /** Two columns; the fifth tile takes the last row on its own, as on the web. */
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
  },
  /**
   * 47%, not 50%: two of these plus the 12px gap have to fit inside 320pt of
   * content at the 360pt floor, and 47% leaves the margin to do it. `flexGrow`
   * then lets a pair fill the row, and the odd fifth tile take a row alone.
   */
  tileCell: { flexBasis: "47%", flexGrow: 1 },

  /* ── HR zones ─────────────────────────────────────────────────────── */

  /* ── Skeletons. Grey blocks at final height, never a dash. ─────────── */
  skeleton: { backgroundColor: color.well, borderRadius: radius.card },
  skeletonScan: { height: space.xxxl * 4 },
  skeletonTile: {
    // Matches the tile grid's own two-up geometry: half the row, less the gap.
    flexBasis: "47%",
    flexGrow: 1,
    height: TILE_HEIGHT,
  },
  skeletonPanel: { height: space.xxxl * 3 },
  /** The grid's exact drawn height plus the panel's title row and padding. */
  skeletonYear: {
    height:
      YEAR_GRID_HEIGHT + layout.cardPadding * 2 + space.xxl + space.md,
  },
});
