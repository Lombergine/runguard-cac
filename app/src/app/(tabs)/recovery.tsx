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
 * through `<ReadingRow/>`, whose null case is a dash in `color.unknown` over
 * the words "Not recorded".
 */
import { useMemo, useState, type ReactNode } from "react";
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
import { ScreenHeader, useTabHeaderActions } from "../../components/ScreenHeader";
import { Section } from "../../components/Section";
import { EXPLAINERS } from "../../components/InfoDot";
import { Chevron } from "../../components/List";
import { SleepChart } from "../../components/charts/SleepChart";
import { SleepStages } from "../../components/charts/SleepStages";
import { useProfile } from "../../lib/profileStore";
import { fitnessKnown, readinessState } from "../../lib/readiness";
import { readinessBand, readinessValue, type ReadinessBand } from "../../lib/readinessVerdict";
import type { Profile } from "../../lib/types";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { dim, rowPress } from "../../theme/press";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

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
 */
const MICRO_LINE = text.micro.lineHeight as number;
const META_LINE = text.meta.lineHeight as number;
const STAT_LINE = text.stat.lineHeight as number;
const BASE_LINE = text.base.lineHeight as number;
/**
 * A reading row at its floor: `target.row`, the same 52pt grouped-list row the
 * rest of the app uses.
 */
const READING_ROW_H = target.row;
/**
 * A reading row carrying a second line — a delta ("+3 bpm vs base") or the
 * words "Not recorded". Padding, the label, the sub-line, padding, which
 * clears the 52pt floor.
 */
const READING_ROW_SUB_H = space.sm * 2 + BASE_LINE + META_LINE;
/** n rows pooled in one card, with a hairline between each pair. */
function slabH(rows: number[]): number {
  return rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * ruleWidth;
}
/** The banner: padding, eyebrow, gap, the figure row, padding. */
const BANNER_H = layout.cardPadding * 2 + MICRO_LINE + space.md + STAT_LINE;
/** A prose card holding three paragraphs: padding, 3 × body, 2 × gap, padding. */
const PANEL_H = layout.cardPadding * 2 + META_LINE * 3 + space.md * 2;
/**
 * One section label, at the line height it actually renders at.
 *
 * `text.micro`, which is what `Section` sets its label in. It used to be
 * `text.title` (24), from when the sleep blocks drew a 19pt panel title of
 * their own; both are labelled groups now, so nothing on this screen renders
 * at that rank and the skeleton was reserving eight points that never arrive.
 */
const HEADING_H = MICRO_LINE;

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
 * into the sentence — in ONE nested node, set in `styles.figure`. Non-negotiable
 * #3 is not "figures in tiles are mono", it is that a numeral is never in the
 * body face; a figure sitting inside a sentence is the easiest place in the app
 * to break it, because the sentence is a string until someone looks. That is why
 * these are nodes rather than strings: a template literal has nowhere to put a
 * typeface, so the type had to change for the rule to be expressible at all.
 */
function recoveryTips(p: Profile): ReactNode[] {
  const r = p.risk.recovery;
  const out: ReactNode[] = [];

  if (r.sleepAvg !== null && r.sleepAvg < LOW_SLEEP_H) {
    // The website appends "before your next hard workout" on the same
    // condition — an unmarked Workout day left on this week's plan.
    const workoutAhead = p.plan.days.some(
      (d) => d.type.includes("Workout") && !d.status,
    );
    out.push(
      <>
        {"Your sleep is averaging "}
        <Text style={styles.figure}>{`${r.sleepAvg} h`}</Text>
        {" a night, under the "}
        <Text style={styles.figure}>{`${SLEEP_TARGET_H} h`}</Text>
        {" your sleep debt is counted against"}
        {workoutAhead
          ? ", and there is a hard workout still unmarked on this week's plan."
          : "."}
      </>,
    );
  }

  if (r.hrvDeltaPct !== null && r.hrvDeltaPct <= HRV_SUPPRESSED_PCT) {
    out.push(
      <>
        {"Your HRV is sitting "}
        <Text style={styles.figure}>{`${Math.abs(r.hrvDeltaPct)}%`}</Text>
        {" below your own baseline. That usually goes with a body still carrying stress from recent training, and it comes back fastest across easy days and full nights."}
      </>,
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
      <>
        {"You are carrying "}
        <Text style={styles.figure}>{`${p.patterns.sleepDebtH} h`}</Text>
        {" of sleep debt this week. About half of that is what a single early night covers."}
      </>,
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
/**
 * The screen's own chrome now lives in `ScreenHeader` above the scroller — the
 * design's pinned title and subtitle. What is left here is the one line that
 * is not chrome: a stale-data notice, which belongs with the readings it is
 * qualifying rather than in a header that is always on screen.
 *
 * The eyebrow ("Overnight") went with it. The design puts no eyebrow above a
 * screen title, and it was naming the same thing the title does.
 */
function Header({ stale }: { stale?: boolean }) {
  if (!stale) return null;
  return (
    <View style={styles.header}>
      {stale ? (
        <Text style={styles.note}>
          Could not reach your server just now. These are the readings last
          loaded.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One reading, and — one tap away — what it is and where it came from.
 *
 * THE DESIGN'S ROW, NOT THE WEBSITE'S TILE. The readings were a two-up grid of
 * `<Tile/>`, each with a circled "i" beside its label that opened the explainer
 * in a modal. The design draws them as grouped-list rows with a disclosure
 * chevron, and the explanation unfolds in place underneath. The copy is
 * unchanged — the same five `EXPLAINERS` strings, which are the website's own
 * `info=` sentences and are NOT retyped here — only the surface it arrives on.
 *
 * The row is better than the dot for the reason `Tile`'s own note documents at
 * length: the dot cost the label 20pt of width, so "BODY BATTERY" and "SLEEP
 * CONSISTENCY" wrapped to two lines at the 360pt floor. A row has the whole
 * width and a target the size of the row rather than of a 16pt circle.
 *
 * ABSENT IS STILL A DASH, NOT A DASHED BOX. `Tile` settled this and the reason
 * survives the shape change: three unrecorded readings drawn as three dashed
 * rectangles made absence the loudest thing on the screen, and the spec asks
 * for absence to be *distinguishable*, not *prominent*. So a missing reading is
 * "—" in `color.unknown` where the figure would be, with the words "Not
 * recorded" beneath it — never a zero, never a blank, and never a number.
 *
 * NO ANIMATION ON THE CHEVRON. The design rotates it 90°; it does so here too,
 * as a state, not as a transition. § "Quality floor" asks for reduced motion to
 * be respected and an explainer that has to be read gains nothing from arriving
 * slowly — the same call `InfoDot` made for the panel it opens.
 */
function ReadingRow({
  label,
  value,
  sub,
  info,
  isLast = false,
}: {
  /** The design's wording. Sentence case — `text.base`, not the micro rank. */
  label: string;
  /**
   * Pre-formatted WITH its unit welded on ("7.2 h", "48 ms", "67/100").
   * `null` means the reading was never recorded — never a stand-in numeral.
   */
  value: string | null;
  /** A delta ("+3 bpm vs base"). Mono, because it is a figure. */
  sub?: string;
  /** One of `EXPLAINERS`. The copy lives in `components/InfoDot`. */
  info: string;
  /** Last row in the card: suppresses the separator. Caller-set, as `List`. */
  isLast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const absent = value === null;
  const subLine = absent ? "Not recorded" : sub;
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        /* The website's form (InfoDot.tsx:35), with the reading read out first
           so the announcement is the row and not just the question. */
        accessibilityLabel={`${label}, ${
          absent ? "not recorded" : value
        }. What is ${label}?`}
        /* The spec's `aria-expanded` on disclosures, in its RN spelling. */
        accessibilityState={{ expanded: open }}
        /* A row is a SURFACE, so it flashes a fill across its full width
           rather than dimming its own content. See theme/press. */
        style={({ pressed }) => [styles.readingRow, rowPress({ pressed })]}
      >
        <View style={styles.readingBody}>
          <Text style={styles.readingLabel}>{label}</Text>
          {subLine ? <Text style={styles.readingSub}>{subLine}</Text> : null}
        </View>
        <Text style={absent ? styles.readingValueAbsent : styles.readingValue}>
          {absent ? "—" : value}
        </Text>
        <View style={open ? styles.chevronOpen : styles.chevron}>
          <Chevron />
        </View>
      </Pressable>
      {open ? <Text style={styles.readingInfo}>{info}</Text> : null}
      {isLast ? null : <View style={styles.separator} pointerEvents="none" />}
    </View>
  );
}

/**
 * The five readings (tabs.tsx:576-609), in TWO groups rather than the
 * website's single five-up grid — and rather than the design's single list.
 *
 * WHY SPLIT. Three of the five are measurements a watch took; the other two are
 * 0–100 figures the engine computed from them. `lib/types.ts` is explicit that
 * `fitness.freshness` is "a model output, not a measurement", and the website
 * files all five under one grid with no note at all — which quietly claims the
 * scores were measured too. The design does the same, under a group headed
 * "Measured overnight"; pooling them there would put that claim in the heading
 * itself. The split is the cheapest honest fix: each heading says what its own
 * figures are, and no row has to apologise for itself in its sub-line. It is
 * also what the design's own footnote promises — "what it is and *where it came
 * from*" — and a reader should not have to open a row to learn that much.
 *
 * `sub` carries deltas only, set in mono because it holds a figure; prose there
 * would be prose in a numeral's typeface.
 */
function Readings({ profile }: { profile: Profile }) {
  const r = profile.risk.recovery;
  return (
    <>
      <Section label="Measured overnight" note="from your wearable" style={styles.section}>
        <Card padded={false} style={styles.readings}>
          <ReadingRow
            label="Sleep · 7d"
            info={EXPLAINERS.sleep7d}
            value={r.sleepAvg !== null ? `${r.sleepAvg} h` : null}
          />
          <ReadingRow
            label="HRV"
            info={EXPLAINERS.hrv}
            value={r.hrv !== null ? `${r.hrv} ms` : null}
            sub={
              r.hrvDeltaPct !== null
                ? `${signed(r.hrvDeltaPct)}% vs base`
                : undefined
            }
          />
          <ReadingRow
            label="Resting HR"
            info={EXPLAINERS.restingHr}
            value={r.restingHr !== null ? `${r.restingHr} bpm` : null}
            sub={
              r.restingHrDelta !== null
                ? `${signed(r.restingHrDelta)} bpm vs base`
                : undefined
            }
            isLast
          />
        </Card>
      </Section>

      <Section
        label="Worked out, not measured"
        note={
          <>
            <Text style={styles.figure}>0–100</Text>
            {", worked out rather than measured"}
          </>
        }
        style={styles.section}
      >
        <Card padded={false} style={styles.readings}>
          {/*
            `freshness` is always a number, so `hasActivityHistory` is the
            guard — see divergence 4 in the header. With nothing synced this
            figure is 67 computed from an empty series.
          */}
          <ReadingRow
            label="Body battery"
            info={EXPLAINERS.bodyBattery}
            value={
              /*
                `fitnessKnown`, NOT `hasActivityHistory`.

                lib/readiness.ts documents why at length: hasActivityHistory is
                `activities.length > 0` over a 400-day window, so for anyone who
                has ever run once it is permanently true and never goes false
                again. Meanwhile `computeFitness` falls back to a bare score
                whenever no week holds enough running — which is exactly the
                athlete this gate is supposed to catch. `fitness.weekly` is
                empty precisely when there was nothing to compute from, so it is
                the honest test for anything derived from `fitness`, and
                freshness is.
              */
              fitnessKnown(profile) && profile.fitness
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
          <ReadingRow
            label="Sleep consistency"
            info={EXPLAINERS.sleepConsistency}
            value={
              profile.risk.recovery.sleepAvg != null &&
              profile.patterns?.sleepConsistency != null
                ? `${profile.patterns.sleepConsistency}/100`
                : null
            }
            isLast
          />
        </Card>
        {/*
          The design's footnote, under the readings it describes. It sits under
          the SECOND group because it is true of both: every one of the five
          rows opens, and the sentence would be half a promise under the first
          group alone.
        */}
        <Text style={styles.footnote}>
          Tap a reading for what it is and where it came from.
        </Text>
      </Section>
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
  const actions = useTabHeaderActions();
  const failed = state === "failed";

  const tips = useMemo(() => (profile ? recoveryTips(profile) : []), [profile]);

  // Only with nothing on screen. A failed refetch over loaded readings keeps
  // them; they were true when they were fetched.
  if (failed && !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader
          title="Recovery"
          subtitle="What your sleep and heart rate said"
          actions={actions}
        />
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
              style={({ pressed }) => [styles.retry, dim(pressed)]}
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
        <ScreenHeader
          title="Recovery"
          subtitle="What your sleep and heart rate said"
          actions={actions}
        />
        <View style={styles.page}>
          <Header />
          {/* Grey bars at the exact final height, never a "—": a pending value
              is a fact about the network, and a dash would claim it is a fact
              about the athlete. */}
          <View style={styles.sections}>
            <View style={[styles.skeleton, { height: BANNER_H }]} />

            {/* Three rows pooled in one card. Sleep · 7d carries no delta, so
                it stands at the row floor; HRV and Resting HR both carry one
                and stand a line taller. */}
            <View style={styles.section}>
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View
                style={[
                  styles.skeleton,
                  {
                    height: slabH([
                      READING_ROW_H,
                      READING_ROW_SUB_H,
                      READING_ROW_SUB_H,
                    ]),
                  },
                ]}
              />
            </View>

            <View style={styles.section}>
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View
                style={[
                  styles.skeleton,
                  { height: slabH([READING_ROW_H, READING_ROW_H]) },
                ]}
              />
              {/* The footnote under the group, so it does not appear late. */}
              <View style={[styles.skeleton, styles.skeletonFootnote]} />
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

          {/* 3. Sleep. Both components own their own `Section` — label, note
                 and caption — so they are dropped in bare and must not be
                 wrapped in a second one. */}
          <SleepChart sleep30={profile.sleep30} />
          <SleepStages sleep30={profile.sleep30} />

          {/* 4. The observations. Server-composed prose, rendered as prose:
                 no marker, no colour, no weight — see divergence 5. */}
          <Section label="What your data is showing" style={styles.section}>
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
          </Section>

          {/* 5. The tips. The website prefixes each with an ember "→"
                 (tabs.tsx:646); an arrow pointing at a sentence is what turns a
                 description into a directive, so the marker here is the same
                 neutral dot `races.tsx` uses for pacing lines — a shape, in a
                 fill token, with no word sitting on it. */}
          <Section label="Recovery tips" note="based on today's data" style={styles.section}>
            <Card padded={false}>
              {tips.map((tip, i) => (
                <View key={i}>
                  {/* BETWEEN rows only, and inset from the left so it starts
                      under the row's own text — `List.separator`'s geometry.
                      A rule above the first row or below the last would read
                      as a clipped row, which is the design's own bug (see
                      docs/design-port.md, structure 6). */}
                  {i > 0 ? (
                    <View style={styles.separator} pointerEvents="none" />
                  ) : null}
                  <View style={styles.tipRow}>
                    <View style={styles.tipMarkCol}>
                      <View style={styles.tipMark} />
                    </View>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </Section>

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
  note: { ...text.meta, color: color.muted, marginTop: space.xs },

  statusRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
  eyebrow: { ...text.micro, color: color.muted },
  statusValue: { ...text.stat, color: color.ink },
  /** Body weight, lowercase, sentence register. Never display weight. */
  statusWord: { ...text.base },

  /**
   * The readings card. `overflow` is load-bearing: without it a row's press
   * flash paints square corners over the card's rounded ones, which is the
   * single most obvious tell that a grouped list was hand-rolled. Same reason
   * `List.slab` carries it.
   */
  readings: { overflow: "hidden" },
  /**
   * `minHeight`, not `height`: `target.row` (52) is the floor, and a row with
   * a delta line or Dynamic Type turned up grows past it rather than clipping.
   */
  readingRow: {
    minHeight: target.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  /** Takes the slack, so the figure and the chevron stay pinned right. */
  readingBody: { flex: 1 },
  readingLabel: { ...text.base, color: color.ink },
  /** Mono: the sub-line holds a delta, and every numeral here is mono. */
  readingSub: { ...text.statInline, color: color.muted },
  /** 16.5 mono — a figure at body rank, level with the label beside it. */
  readingValue: { ...text.statBase, color: color.ink },
  /** Same size and position as a real reading, so the column stays aligned. */
  readingValueAbsent: { ...text.statBase, color: color.unknown },
  /** Points at the row. Rotates a quarter turn once the row is open. */
  chevron: { justifyContent: "center" },
  chevronOpen: { justifyContent: "center", transform: [{ rotate: "90deg" }] },
  /**
   * The explanation, unfolded. Prose in the body face at the size every other
   * explanatory line in the app is set at — the design's 13.5px sans has no
   * rank here, and `text.meta` is what `InfoDot`'s own panel already uses, so
   * the two surfaces that carry these five strings read identically.
   *
   * Indented to the row's text column and given the row's own horizontal
   * padding, so it reads as belonging to the row above rather than as a new
   * one.
   */
  readingInfo: {
    ...text.meta,
    color: color.ink2,
    paddingHorizontal: layout.cardPadding,
    paddingBottom: layout.cardPadding,
  },
  /**
   * BETWEEN rows only, inset from the left so it starts under the row's own
   * text — the way iOS draws a list, and `List.separator`'s geometry.
   */
  separator: {
    height: ruleWidth,
    marginLeft: layout.cardPadding,
    backgroundColor: color.ruleSoft,
  },

  prose: { ...text.meta, color: color.ink2 },
  proseNext: { ...text.meta, color: color.ink2, marginTop: space.md },

  tipRow: {
    flexDirection: "row",
    gap: space.sm,
    padding: layout.cardPadding,
  },
  /** Centres the marker on the first line without hardcoding an offset. */
  tipMarkCol: { height: META_LINE, justifyContent: "center" },
  tipMark: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.brand,
  },
  tipText: { ...text.meta, color: color.ink2, flexShrink: 1 },
  /**
   * A numeral nested in prose. Contributes ONLY the mono face and tabular
   * figures — size and colour are inherited from whichever line it sits in, so
   * the same span works in a tip (`meta`/`ink2`) and in a section note
   * (`meta`/`muted`) without either knowing about the other. Same shape as
   * `WeekProgress.noteFigure`.
   */
  figure: { fontFamily: font.mono, ...tabular },

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
    borderCurve: "continuous",
    backgroundColor: color.brand,
  },
  retryLabel: { ...text.baseSemi, color: color.ink },

  skeleton: {
    borderRadius: radius.card,
    // The squircle iOS itself draws. A skeleton reserves the exact shape as
    // well as the exact height, or the corners change as data lands.
    borderCurve: "continuous",
    backgroundColor: color.well,
  },
  /** Half width, so the reserved heading reads as a heading, not as a card. */
  skeletonHeading: { height: HEADING_H, width: "50%" },
  /** One line of muted prose under a group. */
  skeletonFootnote: { height: META_LINE, width: "75%" },
});
