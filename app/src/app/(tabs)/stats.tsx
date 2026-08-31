/**
 * Stats — the athlete's own numbers, in the design study's order.
 *
 * The design draws this screen as four sections: a 2×2 tile grid with no
 * eyebrow, the week in heart-rate zones, the body scan, and the training year.
 * Those four ship here in that order. The PR table and the five charts sit
 * BETWEEN the third and the fourth rather than being dropped: the design's mock
 * simply has no PRs and no series behind it, and `docs/design-port.md` opens by
 * saying the design's appearance is authoritative but "its mock data, its fake
 * API calls and its backend are not". Deleting a year of an athlete's real
 * numbers because a mockup did not carry them is not a port.
 *
 * THREE THINGS THIS SCREEN IS CAREFUL ABOUT
 *
 * 1. EVERY TILE IS INCAPABLE OF PRINTING A NUMBER IT DOES NOT HAVE. The four
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
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { BodyScan } from "../../components/BodyScan";
import { EXPLAINERS } from "../../components/InfoDot";
import { Absent } from "../../components/Nothing";
import { PrTable } from "../../components/PrTable";
import { TabScreen } from "../../components/TabScreen";
import { Section } from "../../components/Section";
import { Tile } from "../../components/Tile";
import { YEAR_GRID_HEIGHT, YearGrid } from "../../components/YearGrid";
import { AcwrChart } from "../../components/charts/AcwrChart";
import { FitnessChart } from "../../components/charts/FitnessChart";
import { LoadChart } from "../../components/charts/LoadChart";
import { PaceChart } from "../../components/charts/PaceChart";
import { WeeklyKmChart } from "../../components/charts/WeeklyKmChart";
import { useProfile } from "../../lib/profileStore";
import { fitnessKnown } from "../../lib/readiness";
import type { Badge, Profile, ZoneMinutes } from "../../lib/types";
import { formatDistance } from "../../lib/units";
import { layout, radius, space, target } from "../../theme/space";
import { Card } from "../../components/Card";
import { dim } from "../../theme/press";
import { color, emberRamp, emberRampDark } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

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
const ZONES = ["z1", "z2", "z3", "z4", "z5"] as const;

/**
 * The longest streak, out of the 7-day-streak badge.
 *
 * THIS IS THE ONE FRAGILE READ ON THE SCREEN and it is fragile at the source,
 * not here: the server ships the streak only as English inside a badge caption
 * — `detail: \`Longest streak: ${bestStreak} days\`` (engine.ts:656) — so both
 * surfaces have to take a sentence apart to get the number back out.
 *
 * So: match the DIGITS rather than the prose around them, and treat anything
 * that does not match — a missing badge, a reworded caption, a payload without
 * `badges` — as not recorded. A streak we cannot read is unknown; it is never
 * zero, because "you have never trained two days running" is a claim about the
 * athlete and this is only a claim about a string.
 *
 * The real fix is a numeric field on the payload; if one lands, delete this.
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

/**
 * The screen's own chrome now lives in `ScreenHeader` above the scroller — the
 * design's pinned title and subtitle, which no longer scrolls away. What is
 * left here is the one line that is not chrome: a stale-data notice, which
 * belongs with the numbers it is qualifying rather than in a header that is
 * always on screen.
 *
 * The eyebrow ("Your numbers") went with it. The design puts no eyebrow above a
 * screen title, and it was naming the same thing the title does.
 */
function Header({ stale }: { stale?: boolean }) {
  if (!stale) return null;
  return (
    <View style={styles.header}>
      <Text style={styles.note}>
        Could not reach your server just now. These are the numbers last loaded.
      </Text>
    </View>
  );
}

/**
 * Time in each heart-rate zone over the last seven days.
 *
 * The bar wears the SAME five-rung ember ramp as the training year at the foot
 * of this screen (`theme/tokens`) rather than the website's five separate hues.
 * Two five-step encodings of "how hard" on one screen would be two visual
 * languages for one idea, the ramp is monotonic in greyscale where
 * blue→green→amber→orange→red is not, and the status tokens stay where they
 * belong: on verdicts, never on chrome.
 *
 * The ramp is picked with `useColorScheme()` for the same reason `YearGrid`
 * picks it that way: these are plain flex views, not SVG paint, so unlike the
 * charts they can follow the system appearance — and if only one of the two
 * surfaces did, the screen would band the same idea two different ways in dark
 * mode.
 *
 * A zone at zero minutes is a measured zero and prints `0 min`. The whole
 * section only goes Absent when there is nothing at all — no `load` leg, or no
 * heart-rate minutes recorded all week, which is what a week of runs synced
 * without a strap looks like.
 */
function HrZones({ zones }: { zones: ZoneMinutes | undefined }) {
  const ramp = useColorScheme() === "dark" ? emberRampDark : emberRamp;

  // Rounded once, here, and summed from the rounded parts — so the total in
  // the note is always exactly the five figures in the legend added up.
  const minutes = ZONES.map((z) => Math.round(zones?.[z] ?? 0));
  const total = minutes.reduce((s, m) => s + m, 0);

  return (
    <Section
      /* The design's eyebrow, whole: "Time in HR zones · last 7 days". It is a
         label ABOVE the card, not a title inside it — the two heading ranks
         Section and Panel exist to keep apart. */
      label="Time in HR zones · last 7 days"
      /* The total is a figure sitting in prose. It changes FACE, not colour —
         mono and tabular inside the note's own body text, with the unit welded
         into the same node. */
      note={total > 0 ? <Text style={styles.figure}>{`${total} min`}</Text> : undefined}
      style={styles.section}
    >
      <Card style={styles.zoneCard}>
        {zones === undefined || total === 0 ? (
          <Absent label="No heart-rate minutes recorded this week." />
        ) : (
          <>
            <View
              style={styles.zoneBar}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Time in heart-rate zones, last 7 days. ${ZONES.map(
                (z, i) => `${z.toUpperCase()} ${minutes[i]} minutes`,
              ).join(", ")}. ${total} minutes total.`}
            >
              {/* Five segments, contiguous — no gap between them. A zone with
                  no minutes takes `flex: 0` and so takes no width at all,
                  rather than being drawn as a sliver of a load that did not
                  happen. */}
              {ZONES.map((z, i) => (
                <View key={z} style={{ flex: minutes[i], backgroundColor: ramp[i] }} />
              ))}
            </View>

            {/* The legend IS the readout. Every zone prints its own minutes,
                welded, because the website's hover title has no phone. */}
            <View style={styles.legend}>
              {ZONES.map((z, i) => (
                <View key={z} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: ramp[i] }]} />
                  <Text style={styles.legendValue}>
                    {`${z.toUpperCase()} · ${minutes[i]} min`}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.note}>
              <Text style={styles.figure}>Z1</Text> is your easiest running,{" "}
              <Text style={styles.figure}>Z5</Text> your hardest. Runs synced
              without heart rate are not counted here.
            </Text>
          </>
        )}
      </Card>
    </Section>
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
      <TabScreen
        title="Stats"
        subtitle="Fitness, load and the year behind them"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        <Card>
            <Text style={styles.failed}>
              {"Your stats could not be loaded. The RunGuard server could not be reached."}
            </Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your stats again"
              style={({ pressed }) => [styles.retry, dim(pressed)]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
        </Card>
      </TabScreen>
    );
  }

  // Loading. Grey blocks at the height the real thing will occupy — never "—",
  // which means "not recorded" everywhere in this app and must not stand in
  // for "not here yet".
  if (profile === null) {
    return (
      <TabScreen
        title="Stats"
        subtitle="Fitness, load and the year behind them"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
          <View style={styles.sections}>
            {/* The 2×2 grid, both rows. */}
            <View style={styles.tileGrid}>
              <View style={styles.tileRow}>
                <View style={[styles.skeleton, styles.skeletonTile]} />
                <View style={[styles.skeleton, styles.skeletonTile]} />
              </View>
              <View style={styles.tileRow}>
                <View style={[styles.skeleton, styles.skeletonTile]} />
                <View style={[styles.skeleton, styles.skeletonTile]} />
              </View>
            </View>
            <View style={[styles.skeleton, styles.skeletonPanel]} />
            {/* The body scan. Its drawn height is the component's own; when
                components/BodyScan exports one, reserve from that constant
                rather than from this block. */}
            <View style={[styles.skeleton, styles.skeletonScan]} />
            <View style={[styles.skeleton, styles.skeletonPanel]} />
            <View style={[styles.skeleton, styles.skeletonYear]} />
          </View>
      </TabScreen>
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
    <TabScreen
      title="Stats"
      subtitle="Fitness, load and the year behind them"
      /* Pull to refetch. Nothing below dims while it runs: a figure that
         fades reads as a figure losing confidence, which it is not. */
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
        <Header stale={failed} />

        <View style={styles.sections}>
          {/*
            1. The four headline figures, 2×2 and DELIBERATELY WITHOUT AN
            EYEBROW — the design opens the screen on the numbers themselves,
            and a label over them would only repeat the screen title.

            Each carries the website's explainer on an `info` dot beside its
            label (`tabs.tsx:448`, `:454`, `:460`, `:466`). The copy is in
            `components/InfoDot`'s `EXPLAINERS`, not inline here, so the two
            surfaces can be diffed in one pass.

            Explicit rows rather than a wrapping grid: `Tile` is `flex: 1`, so a
            row of two is two equal columns that finish at the same height —
            which a `flexBasis` wrap does not guarantee once one label wraps.
          */}
          <View style={styles.tileGrid}>
            <View style={styles.tileRow}>
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
            <View style={styles.tileRow}>
              <Tile
                label="Week TRIMP"
                info={EXPLAINERS.weekTrimp}
                value={profile.load ? `${profile.load.weekTrimp} TRIMP` : null}
                sub="training impulse, last 7 days"
              />
              <Tile
                /* The design names this tile "7-day distance", not "7-day mi".
                   The unit is already welded to the value, so spelling it in
                   the label too said it twice. */
                label="7-day distance"
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
          </View>

          {/* 2. Heart-rate zones. */}
          <HrZones zones={profile.load?.weekZones} />

          {/* 3. Body scan — open injuries and today's reported soreness. It
                 draws its own head ("Body scan" · "N areas flagged"), which is
                 the design's eyebrow one rank down and inside the card. See the
                 report: giving it a Section label here would print the same
                 words twice and would mean counting the flagged areas a second
                 time, in a second place, from the same two lists. */}
          <BodyScan
            injuries={profile.injuries ?? []}
            soreness={profile.todaySoreness}
          />

          {/*
            PRs against what the model thinks you would run today.

            UNCONDITIONAL. There used to be a fallback Panel here for the empty
            case, and it was worse than nothing twice over: `PrTable` already
            renders its own <Absent/> ("No events on record.") when `prs` is
            empty, so the branch duplicated a state its own child owns — and the
            two panels did not carry the same note, so the caveat an athlete
            read about their PRs depended on whether they had any. One component
            renders this section in both states, so it cannot say two things.
          */}
          <PrTable prs={prs} predictions={predictions} />

          {/*
            THE CHARTS. Each owns its own Panel — do not wrap them.

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

          {/* 4. The training year. Like the body scan it carries its own head
                 ("Your training year"), so it takes no Section label here.
                 
                 The streak sits with it rather than in the tile grid above:
                 the design's grid is 2×2 and a fifth tile leaves a hole in the
                 last row, which reads as a tile that failed to load. Beside a
                 year of days is also where a run of consecutive days means
                 something. */}
          <YearGrid days={profile.calendar ?? []} restDays={restDays} />
          <Tile
            label="Longest streak"
            info={EXPLAINERS.longestStreak}
            /* Read out of a badge caption — see longestStreak(). Gated on
               history so an unread caption renders "not recorded" rather than
               a zero the athlete never earned. */
            value={hasHistory ? longestStreak(profile.badges) : null}
          />
        </View>
    </TabScreen>
  );
}

/**
 * A tile's exact drawn height: 16 padding + 16 label + 4 + 28 value + 4 + 20
 * sub + 16 padding. Composed from the space scale so the skeleton cannot drift
 * from the tile — 48·2 + 8.
 */
const TILE_HEIGHT = space.xxxl * 2 + space.sm;

const styles = StyleSheet.create({
  sections: { gap: layout.section },
  section: { gap: space.md },

  header: { marginBottom: layout.section },
  note: { ...text.meta, color: color.muted, marginTop: space.sm },
  /**
   * A numeral inside a sentence. FACE ONLY — no size, no colour — so it
   * inherits the line it sits in and the sentence keeps one voice while the
   * figure inside it stays mono and tabular (non-negotiable #3).
   */
  figure: { ...tabular, fontFamily: font.mono },

  failed: { ...text.base, color: color.ink2 },
  /** Ember FILL with an ink glyph on it — `brand` is 2.01:1 and takes no word. */
  retry: {
    marginTop: space.xl,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },

  /** Two rows of two. `Tile` is `flex: 1`, so each row is 1fr 1fr. */
  tileGrid: { gap: space.md },
  tileRow: { flexDirection: "row", gap: space.md },

  /* ── HR zones ─────────────────────────────────────────────────────── */
  /** The card's own `gap`, the way `Panel` spaces its children. */
  zoneCard: { gap: space.md },
  zoneBar: {
    flexDirection: "row",
    height: space.xl,
    /* `radius.chip` — space.ts names this bar as one of its two callers. */
    borderRadius: radius.chip,
    borderCurve: "continuous",
    /*
     * The unfilled remainder is the iOS neutral fill, so a short week reads as
     * a short bar rather than as a full one at low intensity. `fill` rather
     * than `well`: this is an inert track under a control-like bar, which is
     * exactly what that token is for, and it is the one the design uses.
     */
    backgroundColor: color.fill,
    overflow: "hidden",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: {
    width: space.md,
    height: space.md,
    borderRadius: radius.mark,
    borderCurve: "continuous",
  },
  /** Mono at metadata size: it carries a numeral, and every numeral is mono. */
  legendValue: {
    ...text.meta,
    ...tabular,
    fontFamily: font.mono,
    color: color.ink2,
  },

  /* ── Skeletons. Grey blocks at final height, never a dash. ─────────── */
  skeleton: {
    backgroundColor: color.well,
    borderRadius: radius.card,
    borderCurve: "continuous",
  },
  skeletonScan: { height: space.xxxl * 4 },
  /** Half a row, less the gap — the same geometry the tile grid draws. */
  skeletonTile: { flex: 1, height: TILE_HEIGHT },
  skeletonPanel: { height: space.xxxl * 3 },
  /** The grid's exact drawn height plus the panel's title row and padding. */
  skeletonYear: {
    height:
      YEAR_GRID_HEIGHT + layout.cardPadding * 2 + space.xxl + space.md,
  },
});
