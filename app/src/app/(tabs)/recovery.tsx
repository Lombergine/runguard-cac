/**
 * Recovery — what the night said, and what the numbers add up to.
 *
 * Mirrors the website's Recovery tab (`website/src/components/athlete/
 * tabs.tsx:545-653`): a status banner, five readings, the sleep chart and stage
 * meter, the observations block, and the tips. Structure, spacing and the
 * Panel hierarchy follow `races.tsx`, which is the closest sibling.
 *
 * FIVE DELIBERATE DIVERGENCES FROM THE WEBSITE. Each is a place where mirroring
 * verbatim would have broken a non-negotiable in ../../../../docs/visual-spec.md.
 *
 *  1. THE BANNER'S GATE. The website prints a verdict and `{readiness}/100`
 *     gated on nothing but `risk.hasActivityHistory` (tabs.tsx:562-574). That
 *     gate is too weak: `readinessScore()` returns **100** for an athlete with
 *     no check-in and no wearable data, so a maximally reassuring figure
 *     computed from nothing gets through the moment a single run syncs. This
 *     screen routes through `readinessState()`, which gates on `todayCheckin`
 *     (non-negotiable #6), and the no-check-in branch is `<Absent/>` — a
 *     component that takes two optional STRINGS and always renders "—". There
 *     is no prop it could be handed a number through, so no later
 *     simplification can reintroduce one. Same shape as `UnknownReadiness` in
 *     `(tabs)/index.tsx`, one step stronger.
 *
 *  2. THE BANNER IS NOT AN ALERT. The website tints the banner's background and
 *     border with the status colour and sets the verdict at text-2xl
 *     extrabold — "Red — under-recovered" as a filled red panel. Non-negotiable
 *     #5: advisory language stays advisory. So: an ordinary white card, the
 *     word in body weight and lowercase, and the colour word ("Green", "Red")
 *     dropped entirely — it is alert vocabulary and it says nothing the word
 *     beside it does not. Colour survives only on the type, through the
 *     `…Text` tokens, never as a fill.
 *
 *  3. NO PER-STAT RED. The website turns three of the five figures amber or red
 *     in place (tabs.tsx:580, 587, 594). Not ported. Colour alone carrying the
 *     meaning has no shape and no label behind it, so it does not survive
 *     greyscale, glare or colour-blindness — the spec's whole status model is
 *     "shape carries the meaning, colour last". The same facts arrive in words
 *     one block down, in the observations and the tips, where they can be read.
 *
 *  4. BODY BATTERY IS GATED ON `hasActivityHistory`. `fitness.freshness` is
 *     never null, so a null check cannot protect it — and its own formula
 *     (`engine.ts:260`) falls back to `ratio = 1` when chronic load is under
 *     25, which lands on a confident-looking **67** for an athlete who has
 *     never run a step. Same failure mode as `weekKm` on the home screen, same
 *     fix: gate on the flag that says whether anything was measured at all.
 *
 *  5. THE OBSERVATIONS COME FROM `insights`, NOT `risk.insights`. The website
 *     renders `p.risk.insights` here, and that array is COACH copy written in
 *     the third person with instructions in it — "above their base", "Watch
 *     closely and avoid stacking hard days" (`website/src/lib/risk.ts:497-625`).
 *     Handing it to an athlete is the same mistake `(tabs)/index.tsx` already
 *     avoided with `prePractice.reason`. `CoreProfile.insights` is the SAME
 *     analysis rewritten in the second person for exactly this surface
 *     (`athleteInsights`, `website/src/lib/athleteView.ts:100`), and it is what
 *     `lib/types.ts` already declares. That is what is rendered.
 *
 * Four smaller ones are documented where they happen: the readings split into
 * two sections (`Readings`), the tips restated out of the imperative
 * (`recoveryTips`), the ember "→" dropped from in front of each tip, and the
 * hard-coded `SpO₂ ≈ 97-98%` footnote replaced with what is actually true.
 *
 * WHAT THIS SCREEN NEVER SHOWS. `risk.zone`, `risk.zoneLabel` and `risk.score`
 * are withheld from athletes on the web portal too (tabs.tsx:47-48) and are not
 * read here.
 *
 * A null reading means NOT RECORDED, never zero — every one of the five goes
 * through `<Tile/>`, whose null case is a dash in `color.unknown`.
 */
import { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Absent } from "../../components/Nothing";
import { Card } from "../../components/Card";
import { EXPLAINERS } from "../../components/InfoDot";
import { Tile } from "../../components/Tile";
import { SleepChart } from "../../components/charts/SleepChart";
import { SleepStages } from "../../components/charts/SleepStages";
import { useProfile } from "../../lib/profileStore";
import { readinessState } from "../../lib/readiness";
import { readinessBand, readinessValue, type ReadinessBand } from "../../lib/readinessVerdict";
import type { Profile } from "../../lib/types";
import { layout, radius, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

/**
 * The website's three bands, in the app's register: lowercase, descriptive, no
 * colour word. `readinessBand` already carries the website's own thresholds
 * (>= 65 / >= 40), so the cut points cannot drift from the portal's.
 */
const BAND_WORD: Record<ReadinessBand, string> = {
  under: "under-recovered",
  partial: "partly recovered",
  recovered: "recovered",
};

/**
 * The verdict lands on a GLYPH, so it takes the text-safe half of each accent
 * pair. `readinessColor()` returns the FILL hexes — `ok` is 3.30:1 on white and
 * `watch` 3.19:1, fine for a bar and under the floor for a word read outdoors.
 * These three measure ≥5.13:1 on `card`. Same map as `(tabs)/index.tsx`.
 */
const BAND_COLOR: Record<ReadinessBand, string> = {
  under: color.unusualText,
  partial: color.watchText,
  recovered: color.okText,
};

/** The 8h figure the engine accumulates `patterns.sleepDebtH` against. */
const SLEEP_TARGET_H = 8;
/** The website's tip threshold (tabs.tsx:554). Hours. */
const LOW_SLEEP_H = 7.5;
/** The website's tip threshold (tabs.tsx:555). Percent off baseline. */
const HRV_SUPPRESSED_PCT = -12;
/** The website's tip threshold (tabs.tsx:556). Hours. */
const SLEEP_DEBT_H = 4;

/** "+3" / "-12" — the sign belongs to the figure, so it stays in one node. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Skeleton heights, derived from the same tokens the real blocks are built
 * from rather than eyeballed, so the layout cannot shift as data lands.
 *
 * A tile is: padding, micro label, gap, the figure, gap, the sub-line, padding.
 */
const MICRO_LINE = text.micro.lineHeight as number;
const META_LINE = text.meta.lineHeight as number;
const STAT_LINE = text.stat.lineHeight as number;
const TILE_H =
  layout.cardPadding * 2 + MICRO_LINE + space.xs + STAT_LINE + space.xs + META_LINE;
/** The banner: padding, eyebrow, gap, the figure row, padding. */
const BANNER_H = layout.cardPadding * 2 + MICRO_LINE + space.md + STAT_LINE;
/** A prose card holding three paragraphs: padding, 3 × body, 2 × gap, padding. */
const PANEL_H = layout.cardPadding * 2 + META_LINE * 3 + space.md * 2;
/** One section heading, at the line height it actually renders at. */
const HEADING_H = text.title.lineHeight as number;

/* ------------------------------------------------------------------ *
 * The status banner
 * ------------------------------------------------------------------ */

/**
 * Readiness once the athlete has actually reported. The figure keeps its "/100"
 * welded on (`readinessValue`), and the band word sits beside it as
 * description: body weight, lowercase, no fill, no shape borrowed from a
 * warning set.
 *
 * This is the ONLY component on this screen that renders a readiness figure,
 * and it can only be reached from the `known: true` arm of `readinessState()`.
 */
function KnownStatus({ value }: { value: number }) {
  const band = readinessBand(value);
  return (
    <Card>
      <Text style={styles.eyebrow}>Today&apos;s recovery status</Text>
      <View style={styles.statusRow}>
        <Text style={styles.statusValue}>{readinessValue(value)}</Text>
        <Text style={[styles.statusWord, { color: BAND_COLOR[band] }]}>
          {BAND_WORD[band]}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Recovery status before there is anything to know.
 *
 * `<Absent/>` takes `label` and `eyebrow` — two optional strings — and always
 * renders "—" in `color.unknown` inside the dashed slot. There is no numeric
 * prop, so this branch is structurally incapable of printing a figure, which is
 * what non-negotiable #6 asks for. Do not replace it with a shared component
 * that also handles the known case.
 */
function UnknownStatus() {
  return (
    <Absent
      eyebrow="Today's recovery status"
      label="Unknown until you check in."
    />
  );
}

/* ------------------------------------------------------------------ *
 * Tips
 * ------------------------------------------------------------------ */

/**
 * The website's five tips (tabs.tsx:553-558), same conditions and same
 * thresholds, REPHRASED.
 *
 * Every one of the website's is written as an instruction — "prioritize 8 hours
 * tonight", "today should be genuinely easy", "Hydrate, sleep, and skip
 * intensity for 48h", "start sipping now". Non-negotiable #5 forbids imperative
 * verbs and says type must not turn a description into an instruction; the
 * project's safety rule adds that RunGuard is a monitoring signal and must
 * never phrase output as diagnosis. So each is restated as an observation about
 * what was measured, in the past or present tense, with the same facts and the
 * same numbers in it. The illness line in particular now says in as many words
 * that it is a signal rather than a finding.
 *
 * The figures are the server's, already rounded, and each keeps its unit welded
 * into the sentence.
 */
function recoveryTips(p: Profile): string[] {
  const r = p.risk.recovery;
  const out: string[] = [];

  if (r.sleepAvg !== null && r.sleepAvg < LOW_SLEEP_H) {
    // The website appends "before your next hard workout" on the same
    // condition — an unmarked Workout day left on this week's plan.
    const workoutAhead = p.plan.days.some(
      (d) => d.type.includes("Workout") && !d.status,
    );
    out.push(
      `Your sleep is averaging ${r.sleepAvg} h a night, under the ${SLEEP_TARGET_H} h your sleep debt is counted against` +
        (workoutAhead
          ? ", and there is a hard workout still unmarked on this week's plan."
          : "."),
    );
  }

  if (r.hrvDeltaPct !== null && r.hrvDeltaPct <= HRV_SUPPRESSED_PCT) {
    out.push(
      `Your HRV is sitting ${Math.abs(r.hrvDeltaPct)}% below your own baseline. That usually goes with a body still carrying stress from recent training, and it comes back fastest across easy days and full nights.`,
    );
  }

  /*
    GATED ON `sleepAvg`, FOR THE REASON THE SLEEP-CONSISTENCY TILE IS — the two
    figures come out of the SAME line of the engine.

    `engine.ts:168` builds `last7Sleep` as `metrics.filter(has sleep).slice(-7)`
    — the last seven metric ROWS carrying a sleep value, drawn from a 400-day
    query with no date filter at all. Both `sleepDebtH` (engine.ts:172) and
    `sleepConsistency` (engine.ts:175) are computed from it, so both inherit the
    same window; `sleepDebtH` is the worse of the two because it needs only ONE
    row to return a number, where consistency needs four.

    Its declared contract says otherwise — `lib/types.ts:319` and the engine's
    own comment at `engine.ts:132` both say "over the last 7 days" — and this
    sentence welds "this week" onto the figure. On the demo athlete on
    2026-08-11 it read 1.3 h, accumulated over the nights of 22–28 July, the
    last seven the watch ever synced. Below the threshold, so no tip printed;
    the same arithmetic over a worse fortnight prints one.

    `recovery.sleepAvg` is the mean of the last seven CALENDAR nights and is
    null when none of them carries sleep, which is exactly the condition under
    which a debt figure is describing some other week. Same gate, same reason,
    same residual: it does not prove all seven rows are inside the window, only
    that the window is not empty. The real fix is a windowed `sleepDebtH` in the
    engine — reported for this stage.
  */
  if (
    r.sleepAvg !== null &&
    p.patterns?.sleepDebtH != null &&
    p.patterns.sleepDebtH > SLEEP_DEBT_H
  ) {
    out.push(
      `You are carrying ${p.patterns.sleepDebtH} h of sleep debt this week. About half of that is what a single early night covers.`,
    );
  }

  if (p.illness) {
    out.push(
      "Your HRV is down and your resting heart rate is up at the same time. That combination is the pattern RunGuard watches for when a body is fighting something off — it is a signal, not a diagnosis, and it is worth mentioning to your coach.",
    );
  }

  // The website's always-on hydration line, same content, no imperative.
  out.push(
    "Fluid taken across the whole day is absorbed better than fluid taken at practice. Before hard days and race days that usually looks like extra water and electrolytes with lunch.",
  );

  return out;
}

/* ------------------------------------------------------------------ *
 * Layout pieces
 * ------------------------------------------------------------------ */

/**
 * The screen header. `stale` adds ONE quiet line when a refetch failed over
 * readings already on the glass; the whole-page failure stays reserved for
 * having nothing at all.
 */
function Header({ stale }: { stale?: boolean }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Overnight</Text>
      <Text style={styles.heading}>Recovery</Text>
      <Text style={styles.note}>
        What your sleep and your heart rate have been saying.
      </Text>
      {stale ? (
        <Text style={styles.note}>
          Could not reach your server just now. These are the readings last
          loaded.
        </Text>
      ) : null}
    </View>
  );
}

/** The Panel hierarchy: title left, caveat right, content below. */
function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.panelHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </View>
  );
}

/**
 * The five readings (tabs.tsx:576-609), in TWO sections rather than the
 * website's single five-up grid.
 *
 * WHY SPLIT. Three of the five are measurements a watch took; the other two are
 * 0–100 figures the engine computed from them. `lib/types.ts` is explicit that
 * `fitness.freshness` is "a model output, not a measurement", and the website
 * files all five under one grid with no note at all — which quietly claims the
 * scores were measured too. The split is the cheapest honest fix: each heading
 * says what its own figures are, and no tile has to apologise for itself in its
 * sub-line.
 *
 * It also lands the tiles 1+2 and 2 with no empty cell. Five tiles two-up
 * leaves a hole in the last row, and a hole reads as a tile that failed to
 * load — the one thing a blank must never do in this app (see the note on
 * `RecoveryGrid` in `(tabs)/index.tsx`). Nothing is invented to fill a slot and
 * no slot is left open.
 *
 * `sub` carries deltas only. `<Tile/>` sets that line in mono because it is
 * meant to hold a figure; prose there would be prose in a numeral's typeface.
 *
 * THE EXPLAINERS ARE A DISCLOSURE, NOT A CAPTION — a decision this file left
 * open. The website's five `info=` sentences run to about forty words each
 * (tabs.tsx:581-608), which is five paragraphs of prose competing with five
 * figures if they are printed in place. They would also have to sit somewhere,
 * and the only slot a tile has is `sub`, which is set in mono for deltas. So
 * each one hides behind the circled "i" beside its label and opens on a tap:
 * the numbers keep the screen, and the explanation is one tap away for the
 * reader who wants it. `components/InfoDot` has the mechanics and the copy;
 * `EXPLAINERS.sleep7d` carries the only string that is not the website's
 * verbatim, and says why.
 */
function Readings({ profile }: { profile: Profile }) {
  const r = profile.risk.recovery;
  return (
    <>
      <View style={styles.section}>
        <SectionHeading title="Measured overnight" note="from your wearable" />
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Tile
              label="Sleep · 7d avg"
              info={EXPLAINERS.sleep7d}
              value={r.sleepAvg !== null ? `${r.sleepAvg} h` : null}
            />
          </View>
          <View style={styles.gridRow}>
            <Tile
              label="HRV"
              info={EXPLAINERS.hrv}
              value={r.hrv !== null ? `${r.hrv} ms` : null}
              sub={
                r.hrvDeltaPct !== null
                  ? `${signed(r.hrvDeltaPct)}% vs base`
                  : undefined
              }
            />
            <Tile
              label="Resting HR"
              info={EXPLAINERS.restingHr}
              value={r.restingHr !== null ? `${r.restingHr} bpm` : null}
              sub={
                r.restingHrDelta !== null
                  ? `${signed(r.restingHrDelta)} bpm vs base`
                  : undefined
              }
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading
          title="Scored from those"
          note="0–100, worked out rather than measured"
        />
        <View style={styles.gridRow}>
          {/*
            `freshness` is always a number, so `hasActivityHistory` is the
            guard — see divergence 4 in the header. With nothing synced this
            figure is 67 computed from an empty series.
          */}
          <Tile
            label="Body battery"
            info={EXPLAINERS.bodyBattery}
            value={
              profile.risk.hasActivityHistory && profile.fitness
                ? `${profile.fitness.freshness}/100`
                : null
            }
          />
          {/*
            GATED ON `sleepAvg`, NOT ON ITS OWN NULLNESS.

            `patterns.sleepConsistency` is scored from the last seven nights that
            HAVE data, with no window — while `recovery.sleepAvg` is the mean of
            the last seven CALENDAR nights. When a watch stops syncing the two
            come apart, and observed on the simulator on 2026-08-11 they read:

                SLEEP · 7D AVG        —  Not recorded
                SLEEP CONSISTENCY     82/100

            side by side, both describing the same nights. The 82 was computed
            from nights ending 2026-07-28, a fortnight stale, and this tile's own
            explainer says "the swing across the last 7 nights" — which was not
            true of it. A stale number presented as a current one is the same
            failure as a blank presented as a healthy one.

            So: if there is no sleep in the current window, consistency over that
            window is unknown, whatever the engine still remembers.
          */}
          <Tile
            label="Sleep consistency"
            info={EXPLAINERS.sleepConsistency}
            value={
              profile.risk.recovery.sleepAvg != null &&
              profile.patterns?.sleepConsistency != null
                ? `${profile.patterns.sleepConsistency}/100`
                : null
            }
          />
        </View>
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export default function RecoveryScreen() {
  // The shared `/me`, and with it the single 401 path — a revoked token ends
  // the session from inside the store. There is deliberately no catch here.
  const { profile, state, refreshing, refresh } = useProfile();
  const failed = state === "failed";

  const tips = useMemo(() => (profile ? recoveryTips(profile) : []), [profile]);

  // Only with nothing on screen. A failed refetch over loaded readings keeps
  // them; they were true when they were fetched.
  if (failed && !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Header />
          <Card>
            <Text style={styles.failed}>
              Your recovery data could not be loaded.
            </Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your recovery data again"
              style={styles.retry}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.page}>
          <Header />
          {/* Grey bars at the exact final height, never a "—": a pending value
              is a fact about the network, and a dash would claim it is a fact
              about the athlete. */}
          <View style={styles.sections}>
            <View style={[styles.skeleton, { height: BANNER_H }]} />

            <View style={styles.section}>
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View style={styles.grid}>
                <View style={styles.gridRow}>
                  <View style={[styles.skeleton, styles.skeletonTile]} />
                </View>
                <View style={styles.gridRow}>
                  <View style={[styles.skeleton, styles.skeletonTile]} />
                  <View style={[styles.skeleton, styles.skeletonTile]} />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View style={styles.gridRow}>
                <View style={[styles.skeleton, styles.skeletonTile]} />
                <View style={[styles.skeleton, styles.skeletonTile]} />
              </View>
            </View>

            <View style={styles.section}>
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View style={[styles.skeleton, { height: PANEL_H }]} />
            </View>

            <View style={styles.section}>
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View style={[styles.skeleton, { height: PANEL_H }]} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const readiness = readinessState(profile);
  const insights = profile.insights ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        <Header stale={failed} />

        <View style={styles.sections}>
          {/* 1. Status. Two components, one per arm — the unknown one takes no
                 number and so cannot print one. */}
          {readiness.known ? (
            <KnownStatus value={readiness.value} />
          ) : (
            <UnknownStatus />
          )}

          {/* 2. The five readings, in two sections — see Readings. */}
          <Readings profile={profile} />

          {/* 3. Sleep. Both components own their own panel head — do not
                 wrap them in a SectionHeading or the title doubles. */}
          <View style={styles.section}>
            <SleepChart sleep30={profile.sleep30} />
          </View>
          <View style={styles.section}>
            <SleepStages sleep30={profile.sleep30} />
          </View>

          {/* 4. The observations. Server-composed prose, rendered as prose:
                 no marker, no colour, no weight — see divergence 5. */}
          <View style={styles.section}>
            <SectionHeading title="What your data is showing" />
            {insights.length === 0 ? (
              <Absent label="No observations yet." />
            ) : (
              <Card>
                {insights.map((line, i) => (
                  <Text key={i} style={i > 0 ? styles.proseNext : styles.prose}>
                    {line}
                  </Text>
                ))}
              </Card>
            )}
          </View>

          {/* 5. The tips. The website prefixes each with an ember "→"
                 (tabs.tsx:646); an arrow pointing at a sentence is what turns a
                 description into a directive, so the marker here is the same
                 neutral dot `races.tsx` uses for pacing lines — a shape, in a
                 fill token, with no word sitting on it. */}
          <View style={styles.section}>
            <SectionHeading title="Recovery tips" note="based on today's data" />
            <Card>
              {tips.map((tip, i) => (
                <View key={i} style={i > 0 ? styles.tipRowNext : styles.tipRow}>
                  <View style={styles.tipMarkCol}>
                    <View style={styles.tipMark} />
                  </View>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </Card>
          </View>

          {/*
            6. The website's footnote reads `SpO₂ ≈ 97-98%` (tabs.tsx:636) — a
            hard-coded vital sign, printed whenever `sleep30` is non-empty and
            true of nobody in particular. It is not ported. The columns exist in
            the database (`health_metrics.spo2`, `.wrist_temp`), but neither
            reaches the phone: `sleepTrend()` (`website/src/lib/engine.ts:710`)
            projects each night down to `{date, hours, deep, rem, light}`, and
            `/api/mobile/me` sends nothing else carrying them. So the line says
            what is true — that they are not on this screen — rather than
            printing a number the app was never given.
          */}
          <Text style={styles.footnote}>
            Overnight SpO₂ and wrist temperature are not sent to this app, so
            they are not shown here.
          </Text>
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
  },
  sections: { gap: layout.section },
  section: { gap: space.md },

  header: { marginBottom: layout.section },
  eyebrow: { ...text.micro, color: color.muted },
  heading: { ...text.title, color: color.ink, marginTop: space.xs },
  note: { ...text.meta, color: color.muted, marginTop: space.xs },

  /** Title left, muted note right — the website's Panel head (tabs.tsx:22). */
  panelHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
  },
  sectionTitle: { ...text.title, color: color.ink },
  sectionNote: { ...text.meta, color: color.muted, flexShrink: 1 },

  statusRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
  statusValue: { ...text.stat, color: color.ink },
  /** Body weight, lowercase, sentence register. Never display weight. */
  statusWord: { ...text.base },

  grid: { gap: space.md },
  // Explicit rows rather than a wrapping grid: `flex: 1` on each tile keeps a
  // pair the same width and the same height at 360px. A row with one tile in it
  // is the full-width tile.
  gridRow: { flexDirection: "row", gap: space.md },

  prose: { ...text.meta, color: color.ink2 },
  proseNext: { ...text.meta, color: color.ink2, marginTop: space.md },

  tipRow: { flexDirection: "row", gap: space.sm },
  tipRowNext: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  /** Centres the marker on the first line without hardcoding an offset. */
  tipMarkCol: { height: META_LINE, justifyContent: "center" },
  tipMark: {
    width: space.sm,
    height: space.sm,
    borderRadius: space.xs,
    backgroundColor: color.brand,
  },
  tipText: { ...text.meta, color: color.ink2, flexShrink: 1 },

  footnote: { ...text.meta, color: color.muted },

  failed: { ...text.base, color: color.ink2 },
  /** Ember fill, ink glyph — `brand` is a fill token, so no word sits on it. */
  retry: {
    marginTop: space.xl,
    alignSelf: "flex-start",
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },

  skeleton: { borderRadius: radius.card, backgroundColor: color.well },
  skeletonTile: { flex: 1, height: TILE_H },
  /** Half width, so the reserved heading reads as a heading, not as a card. */
  skeletonHeading: { height: HEADING_H, width: "50%" },
});
