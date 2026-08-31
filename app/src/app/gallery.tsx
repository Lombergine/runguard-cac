/**
 * /gallery — a dev-only specimen sheet.
 *
 * Every shared primitive in every state, labelled, so the system can be
 * verified by eye: the three kinds of nothing side by side, all four status
 * shapes, the advisory in each flag, cards, grouped lists, stats, run cards,
 * the receipt, both chat surfaces, the body map, and the type scale with its
 * role names.
 *
 * The greyscale test lives here too, and it now has its own section at the top:
 * the three kinds of nothing and all four status shapes, adjacent, each
 * captioned with the cue that is supposed to survive desaturation. Screenshot
 * that one block, drop the saturation, and the whole honesty contract can be
 * checked at a glance without the source open. It sits on the page's cream
 * ground rather than inside a white panel on purpose — Zero's fill is `card`,
 * so on a white panel it would lose a cue it is meant to be tested on.
 *
 * Structure follows the website's Panel: a semibold title on the left, the
 * caveat or reading instruction as a muted note on the right, then the content.
 *
 * DEV ONLY, AND ENFORCED. This is a live route under src/app/, so a release
 * build can reach it by URL; expo-router has no dev-only route mechanism, so
 * the component itself renders nothing outside development.
 */
import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { Absent, Zero, NoRun } from "../components/Nothing";
import { ChartAbsent, Plot } from "../components/chart/Plot";
import {
  AbsentMarks,
  Band,
  Bars,
  LinePath,
  RefLine,
} from "../components/chart/marks";
import { ChartPoint, zeroBasedDomain } from "../components/chart/scales";
/* Stage 2.1 — volume and pace. */
import { PaceChart } from "../components/charts/PaceChart";
import { WeeklyKmChart } from "../components/charts/WeeklyKmChart";
import { sleepSeries, ACWR_BAND, ACWR_DANGER, SLEEP_TARGET_H } from "../lib/chartData";
import { localDayOffset } from "../lib/dates";
import { StatusDot } from "../components/StatusDot";
import { Advisory } from "../components/Advisory";
import { BodyMap } from "../components/BodyMap";
import { Card } from "../components/Card";
import { ChatBubble, bubbleText } from "../components/ChatBubble";
import { CheckInReceipt } from "../components/CheckInReceipt";
import { List, ListRow } from "../components/List";
import { RunCard } from "../components/RunCard";
import { SafetyNotice } from "../components/SafetyNotice";
import { Stat } from "../components/Stat";
/* Stage 3.6 — see the "InfoDot" specimens at the foot of the sheet. */
import { EXPLAINERS } from "../components/InfoDot";
import { Tile } from "../components/Tile";
import { SleepChart } from "../components/charts/SleepChart";
import { SleepStages } from "../components/charts/SleepStages";
import { ChatMessage, Fitness, Flag, MentalDay, PrPoint, RecentRun, SleepDay } from "../lib/types";
/* Stage 2.4 — see the "Energy & motivation" and "Fitness score" specimens at
   the foot of the Chart primitives section. */
import { FitnessChart } from "../components/charts/FitnessChart";
import { MentalChart } from "../components/charts/MentalChart";
/* Stage 2.5 — see the "PR progression" specimens at the foot of the Chart
   primitives section, and the PR_* fixtures at the foot of the file. */
import { PrChart } from "../components/charts/PrChart";
/* Stage 2.3 — see the "Workload ratio & training load" specimens at the foot of
   the Chart primitives section, and the LOAD_* fixtures at the foot of the
   file. */
import { AcwrChart } from "../components/charts/AcwrChart";
import { LoadChart } from "../components/charts/LoadChart";
import type { DailyPoint } from "../lib/types";
import { color } from "../theme/tokens";
import { font, tabular, text, TextRole } from "../theme/type";
import { layout, radius, space } from "../theme/space";

const FLAGS: Flag[] = ["clear", "watch", "unusual", "unknown"];

/**
 * The cue each status shape is supposed to keep once the colour is gone. These
 * are the captions in the greyscale row, so the screenshot names its own test.
 */
const DOT_CUE: Record<Flag, string> = {
  clear: "filled disc",
  watch: "half filled",
  unusual: "split, two quadrants",
  unknown: "dashed ring",
};

/**
 * Fixed specimen runs. `date` is only the payload's day key — every card takes
 * its visible date pre-formatted through `dateLabel`, same as in the log.
 */
const PLAIN_RUN: RecentRun = {
  id: 1,
  date: "2025-10-14",
  km: 6.8,
  durationS: 2292,
  spike: null,
};

const SPIKED_RUN: RecentRun = {
  id: 2,
  date: "2025-10-12",
  km: 19.3,
  durationS: 6420,
  spike: { km: 19.3, longestKm: 15.9, pctAbove: 21.4, level: "large" },
};

/** No duration, so there is no pace to compute — the third column goes Absent. */
const PACELESS_RUN: RecentRun = {
  id: 3,
  date: "2025-10-11",
  km: 5.2,
  durationS: 0,
  spike: null,
};

const ATHLETE_MESSAGE: ChatMessage = {
  role: "user",
  text: "Calves were tight on the second mile today.",
  safety: false,
};

const COACH_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Noted. Yesterday's pace was quicker than your usual easy run, so tightness on the follow-up is a common pattern.",
  safety: false,
};

/** Flagged, so `bubbleText` returns null and the routing below cannot bubble it. */
const SAFETY_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "This sounds like something to talk through with a person, not an app. Your coach and the school counsellor can both help, and 988 is available any time.",
  safety: true,
};

const REASONS: Record<Flag, string> = {
  clear: "Sleep, soreness and pace were all in your usual range.",
  watch: "You reported worse sleep than on your last three check-ins.",
  unusual: "Yesterday's pace was quicker than your usual easy run.",
  unknown: "No check-in yet today, so there is nothing to compare against.",
};

/* ------------------------------------------------------------------ *
 * Chart specimens
 *
 * The two cases the chart primitives exist to get right, side by side:
 * a MEASURED ZERO adjacent to an UNKNOWN in a bar chart, and a line with a
 * two-day hole in it. Both are constructed rather than fetched, because the
 * point is the pair of states, not the data.
 * ------------------------------------------------------------------ */

/** Wed is a measured zero; Thu, right beside it, is unknown. */
const BAR_SPECIMEN: ChartPoint[] = [
  { label: "Mon 6 Oct", value: 6.2 },
  { label: "Tue 7 Oct", value: 8.1 },
  { label: "Wed 8 Oct", value: 0 },
  { label: "Thu 9 Oct", value: null },
  { label: "Fri 10 Oct", value: 4.4 },
  { label: "Sat 11 Oct", value: 11.3 },
  { label: "Sun 12 Oct", value: 0 },
  { label: "Mon 13 Oct", value: 5 },
];

/**
 * A two-day hole at indices 3–4, and a LONE reading at index 2 with a hole on
 * either side — the case a polyline cannot draw, which is why runs of one
 * become a dot.
 */
const LINE_SPECIMEN: ChartPoint[] = [
  { label: "Mon 6 Oct", value: 1.05 },
  { label: "Tue 7 Oct", value: null },
  { label: "Wed 8 Oct", value: 0.94 },
  { label: "Thu 9 Oct", value: null },
  { label: "Fri 10 Oct", value: null },
  { label: "Sat 11 Oct", value: 1.22 },
  { label: "Sun 12 Oct", value: 1.36 },
  { label: "Mon 13 Oct", value: 1.48 },
  { label: "Tue 14 Oct", value: 1.62 },
  { label: "Wed 15 Oct", value: 1.44 },
];

/**
 * Six nights out of thirty, sparse exactly as the payload is — no rows at all
 * for the other twenty-four. Run through the real `sleepSeries`, so this
 * specimen is also the test that prep densifies and that a night nobody
 * measured stays null instead of becoming a floor-height zero bar.
 */
const SPARSE_SLEEP: SleepDay[] = [
  { date: localDayOffset(27), hours: 7.4, deep: null, rem: null, light: null },
  { date: localDayOffset(26), hours: 6.1, deep: null, rem: null, light: null },
  { date: localDayOffset(25), hours: 8.3, deep: null, rem: null, light: null },
  { date: localDayOffset(4), hours: 5.2, deep: null, rem: null, light: null },
  { date: localDayOffset(3), hours: 7.9, deep: null, rem: null, light: null },
  { date: localDayOffset(1), hours: 6.8, deep: null, rem: null, light: null },
];

/* ------------------------------------------------------------------ *
 * Volume and pace specimens (Stage 2.1)
 *
 * Twelve weekly buckets, exactly as the server ships them: `week` ALREADY
 * FORMATTED ("Mar 3") with no ISO date beside it, and `pace` in SECONDS PER
 * KILOMETRE. Nothing here re-derives a date, and nothing here converts a pace —
 * `lib/chartData` does both.
 *
 * Apr 21 is the week worth looking at, and it is deliberately the same week in
 * both series: 0 km is a MEASURED ZERO and draws a solid stub on the mileage
 * baseline, while the pace for that week is genuinely UNKNOWN — you cannot
 * average a pace over no distance — so it draws the dashed hollow mark and the
 * line breaks around it. One week, two different kinds of nothing, adjacent.
 * ------------------------------------------------------------------ */

const SPECIMEN_WEEKS: { week: string; km: number }[] = [
  { week: "Mar 3", km: 42.3 },
  { week: "Mar 10", km: 45.1 },
  { week: "Mar 17", km: 48.6 },
  { week: "Mar 24", km: 30.2 },
  { week: "Mar 31", km: 52.4 },
  { week: "Apr 7", km: 55.8 },
  { week: "Apr 14", km: 58.1 },
  { week: "Apr 21", km: 0 },
  { week: "Apr 28", km: 44.7 },
  { week: "May 5", km: 61.2 },
  { week: "May 12", km: 2.4 },
  { week: "May 19", km: 63.5 },
];

/**
 * Nulls at Apr 21 (nothing run at all) and May 12 (2.4 km of jogging, none of
 * it in a run long enough for the server to average a pace from).
 */
const SPECIMEN_PACE: { week: string; pace: number | null }[] = [
  { week: "Mar 3", pace: 352 },
  { week: "Mar 10", pace: 348 },
  { week: "Mar 17", pace: 344 },
  { week: "Mar 24", pace: 351 },
  { week: "Mar 31", pace: 340 },
  { week: "Apr 7", pace: 336 },
  { week: "Apr 14", pace: 333 },
  { week: "Apr 21", pace: null },
  { week: "Apr 28", pace: 330 },
  { week: "May 5", pace: 327 },
  { week: "May 12", pace: null },
  { week: "May 19", pace: 322 },
];

/** Two paced weeks out of twelve — under `MIN_PACE_WEEKS`, so the panel is Absent. */
const THIN_PACE: { week: string; pace: number | null }[] = SPECIMEN_PACE.map((w) =>
  w.week === "May 5" || w.week === "May 19" ? w : { week: w.week, pace: null },
);

/* ------------------------------------------------------------------ *
 * Stage 2.2 — sleep. Fixtures for the two components in components/charts/.
 * Self-contained: nothing above or below reads these.
 * ------------------------------------------------------------------ */

/**
 * Seven recorded nights across a fortnight, built to carry every state the
 * sleep panels have to keep apart:
 *
 *   · six ordinary nights with hours AND stages
 *   · ONE GENUINE ZERO (`hours: 0`, stages 0) — the watch was worn and logged
 *     no sleep. A fact, and it must draw as a solid stub on the baseline.
 *   · FIVE ADJACENT UNRECORDED NIGHTS (offsets 8 → 4 are simply not in the
 *     array) — the run the website's `hours ?? 0` would have drawn as five
 *     bars at the floor of the axis, i.e. five nights of "you barely slept".
 *   · one night with hours and NO STAGES — it belongs in the chart and must
 *     not be averaged into the meter as a zero.
 */
const SLEEP_NIGHTS: SleepDay[] = [
  { date: localDayOffset(13), hours: 7.4, deep: 1.5, rem: 1.8, light: 4.1 },
  { date: localDayOffset(12), hours: 6.2, deep: 1.1, rem: 1.4, light: 3.7 },
  { date: localDayOffset(11), hours: 8.4, deep: 1.9, rem: 2.2, light: 4.3 },
  { date: localDayOffset(9), hours: 0, deep: 0, rem: 0, light: 0 },
  { date: localDayOffset(3), hours: 7.1, deep: 1.4, rem: 1.9, light: 3.8 },
  { date: localDayOffset(2), hours: 6.8, deep: null, rem: null, light: null },
  { date: localDayOffset(1), hours: 7.9, deep: 1.6, rem: 2.0, light: 4.3 },
];

/** A watch worn without sleep tracking: hours all week, no stages at all. */
const SLEEP_NO_STAGES: SleepDay[] = SLEEP_NIGHTS.map((n) => ({
  ...n,
  deep: null,
  rem: null,
  light: null,
}));

/** Deep and light tracked, REM never — one dashed row beside two real ones. */
const SLEEP_NO_REM: SleepDay[] = SLEEP_NIGHTS.map((n) => ({ ...n, rem: null }));

/**
 * The scale, one row per `TextRole`.
 *
 * `spec` is a separate field from `use` because it is nothing but figures —
 * sizes, weights, tracking — and a figure is mono and tabular even a word deep
 * in a caption (non-negotiable #3). The two are rendered back into the single
 * line they used to be, so the row reads exactly as it did; only the numerals
 * change face.
 *
 * Every role in `theme/type.ts` is listed, including the three that arrived
 * after this block was first written. This is the only place the scale can be
 * seen whole, and a specimen sheet that quietly omits a third of it is worse
 * than no specimen at all.
 *
 * The SAMPLES stay in their own role's face, numerals and all — "Tue 14 Oct"
 * in the body face is the specimen of `meta`, not a figure being rendered
 * wrong. Wrapping those would destroy the thing the row exists to show.
 */
const TYPE_SCALE: { role: TextRole; sample: string; spec: string; use: string }[] = [
  { role: "micro", sample: "Distance", spec: "11.5 mono, +0.12em", use: "micro-labels" },
  { role: "meta", sample: "Tue 14 Oct · before practice", spec: "14 body", use: "secondary metadata" },
  { role: "base", sample: "The app describes. It does not instruct.", spec: "16.5 body", use: "base" },
  { role: "baseSemi", sample: "Checked in 6:12am", spec: "16.5 body 600", use: "emphasis, controls" },
  { role: "title", sample: "Yesterday's run", spec: "19 display", use: "card titles" },
  { role: "stat", sample: "8:51 /mi", spec: "22 mono", use: "inline stats" },
  { role: "statLarge", sample: "72", spec: "28 mono", use: "the one figure a screen is about" },
  { role: "display", sample: "You're all set.", spec: "28 display 800", use: "a screen that is one sentence" },
  { role: "largeTitle", sample: "Recovery", spec: "34 display 700, +0.4", use: "the nav large title — chrome, never set on a Text" },
  { role: "prompt", sample: "How's your energy?", spec: "34 display 800", use: "the check-in prompt" },
];

/**
 * The route. It renders the sheet in development and NOTHING otherwise: the
 * file stays (it is the only visual test of the three-kinds-of-nothing
 * contract) but a shipped build has no specimen sheet behind a deep link.
 *
 * The sheet is a separate component so the guard sits ahead of every hook.
 */
export default function Gallery() {
  if (!__DEV__) return null;
  return <SpecimenSheet />;
}

function SpecimenSheet() {
  // Live, so the map's fill and its 48pt hit areas can be checked by thumb.
  const [soreParts, setSoreParts] = useState<string[]>(["calf"]);
  /**
   * Every pressable row in the grouped-list block feeds this counter, so no row
   * on the sheet is a control that does nothing — the failure `List` exists to
   * make impossible would be an odd thing for its own specimen to commit.
   */
  const [taps, setTaps] = useState(0);
  const countTap = () => setTaps((n) => n + 1);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.pageTitle}>Specimen sheet</Text>
        {/* The ember, once, doing the energy work. 135° as on the web. */}
        <LinearGradient
          colors={color.ember}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emberRule}
        />
        <Text style={styles.pageNote}>
          Shared primitives in every state. Not a product screen.
        </Text>

        {/* ----------------------------------------------------------
         * The one block to screenshot. Everything the honesty contract
         * rests on, adjacent, with its surviving cue written under it.
         * -------------------------------------------------------- */}
        <Section
          title="Greyscale check"
          note="Desaturate this block — every cell must still read apart"
        />
        <Text style={styles.note}>
          Colour is the last cue, never the only one. Dashed means “we don’t
          know” and nothing else does; zero is a fact and looks like every other
          fact; rest recedes.
        </Text>
        <View style={styles.trio}>
          <View style={styles.trioCell}>
            <Absent />
            <Caption>Absent — dashed rule, sunken fill</Caption>
          </View>
          <View style={styles.trioCell}>
            <Zero unit="mi" />
            <Caption>Zero — solid rule, card fill</Caption>
          </View>
          <View style={styles.trioCell}>
            <NoRun />
            <Caption>No run — dotted rule, no fill</Caption>
          </View>
        </View>
        <View style={styles.dotRow}>
          {FLAGS.map((flag) => (
            <View key={flag} style={styles.dotCell}>
              <StatusDot flag={flag} size={28} />
              <Caption center>{`${flag} — ${DOT_CUE[flag]}`}</Caption>
            </View>
          ))}
        </View>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Three kinds of nothing"
          note="Three components, never one with a variant prop"
        />
        <Specimen label="Absent — with eyebrow, default label">
          <Absent eyebrow="Readiness" />
        </Specimen>
        <Specimen label="Absent — custom label">
          <Absent eyebrow="Sleep" label="No check-in yet" />
        </Specimen>
        <Specimen label="Zero — with eyebrow, unit welded">
          <Zero eyebrow="Distance" unit="mi" />
        </Specimen>
        <Specimen label="NoRun — with eyebrow, default label">
          <NoRun eyebrow="Tue 14 Oct" />
        </Specimen>
        <Specimen label="NoRun — custom label">
          <NoRun eyebrow="Wed 15 Oct" label="No run. Nothing scheduled." />
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="StatusDot" note="Shape first, colour last" />
        <Specimen
          label={
            <>
              At the default <Text style={styles.figure}>12px</Text>, inline size
            </>
          }
        >
          <View style={styles.dotInline}>
            {FLAGS.map((flag) => (
              <StatusDot key={flag} flag={flag} />
            ))}
          </View>
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Advisory"
          note="Body weight, lowercase — description, not instruction"
        />
        {FLAGS.map((flag) => (
          <Specimen key={flag} label={`flag="${flag}"`}>
            <Advisory flag={flag} reason={REASONS[flag]} />
          </Specimen>
        ))}

        {/* ---------------------------------------------------------- */}
        <Section title="Card" note="White on the warm ground" />
        <Specimen label="padded (default)">
          <Card>
            <Text style={styles.cardTitle}>Yesterday’s run</Text>
            <Text style={styles.cardBody}>
              Any elevation is shadow.card — never a hand-rolled one, and never
              used to make one card louder than its neighbour.
            </Text>
          </Card>
        </Specimen>
        <Specimen label="padded={false}">
          <Card padded={false}>
            <Text style={styles.cardFlush}>
              Flush content — the card supplies no padding.
            </Text>
          </Card>
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Grouped list"
          note="A row with no onPress is a plain View"
        />
        <Text style={styles.note}>
          iOS pools rows into one slab and lets the corner radius do the
          grouping, where a web page draws a bordered box per row. Two things
          are on test and neither is the colour. The chevron is a promise that a
          screen is underneath, so it is gated on `onPress`: the inert row below
          has no chevron, no press flash and no accessibility role, because
          there is nothing under it. And the press is a FLASH of `press` across
          the row’s full width, never a dim — a row is a surface, and dimming a
          surface dims its own content.
        </Text>
        <Specimen label="With a header — a link row, a row that acts in place, an inert row">
          <List header="Account">
            <ListRow title="Profile" detail="Aria N." onPress={countTap} chevron />
            <ListRow
              title="Press flash"
              detail={<Text style={styles.figure}>{taps} taps</Text>}
              sub="Acts in place, so it wears no chevron"
              onPress={countTap}
            />
            <ListRow
              title="Team"
              detail="Riverside XC"
              sub="Ask your coach to change this"
              isLast
            />
          </List>
        </Specimen>
        <Specimen label="No header — one unlabelled group, and its only row is also its last">
          <List>
            <ListRow title="Sign out" onPress={countTap} isLast />
          </List>
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="Stat" note="mono, tabular figures" />
        <Text style={styles.note}>
          Distance / Time / Pace, always in that order. Values arrive
          pre-formatted with the unit welded on.
        </Text>
        <Specimen label="The run-card stat row">
          <Card>
            <View style={styles.statRow}>
              <Stat label="Distance" value="4.2 mi" />
              <Stat label="Time" value="38:12" />
              <Stat label="Pace" value="8:51 /mi" />
            </View>
          </Card>
        </Specimen>
        <Specimen label="Tabular figures line up across rows">
          <Card>
            <View style={styles.statRow}>
              <Stat label="Distance" value="11.0 mi" />
              <Stat label="Time" value="1:34:02" />
              <Stat label="Pace" value="8:33 /mi" />
            </View>
          </Card>
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="RunCard" note="Dates arrive pre-formatted, never derived" />
        <Text style={styles.note}>
          A row, not a card: distance then time then pace on one mono line, the
          date and the team&apos;s word beneath it. The surface and the
          separators belong to the list that holds it, so each specimen below
          supplies its own single-row slab. Nothing here is coloured, so the
          greyscale copy should be identical.
        </Text>
        <Specimen label="Ordinary run — figures lead, date and session beneath">
          <RunSlab>
            <RunCard run={PLAIN_RUN} dateLabel="Tue 14 Oct" sessionLabel="Easy run" />
          </RunSlab>
        </Specimen>
        <Specimen label="Spiked run — advisory inline, split dot, no banner or modal">
          <RunSlab>
            <RunCard run={SPIKED_RUN} dateLabel="Sun 12 Oct" sessionLabel="Long run" />
          </RunSlab>
        </Specimen>
        <Specimen label="No pace — a dash in its place, never '0:00 /mi'">
          <RunSlab>
            <RunCard run={PACELESS_RUN} dateLabel="Sat 11 Oct" />
          </RunSlab>
        </Specimen>
        <Specimen label="No session type — the second line is the date alone">
          <RunSlab>
            <RunCard run={PLAIN_RUN} dateLabel="Tue 14 Oct" />
          </RunSlab>
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="CheckInReceipt" note="There is no success screen" />
        <Text style={styles.note}>
          What the check-in card collapses into. One line, mono, time and day
          welded together. There is no success screen.
        </Text>
        <Specimen label="After a completed check-in">
          <CheckInReceipt label="Checked in 6:12am · Tue 14 Oct" />
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="Chat" note="A safety reply can never reach a bubble" />
        <Text style={styles.note}>
          Side and geometry separate the speakers, not hue: the athlete’s bubble
          is right-aligned and unruled, the coach’s is left and held by a rule.
          The safety notice has no bubble geometry at all — no radius, no side,
          one heavy left rule; it is full-bleed in the thread and only inset
          here by the page. In greyscale the three stay unmistakable.
        </Text>
        <Specimen
          label={
            <>
              Athlete — right, accent fill,{" "}
              <Text style={styles.figure}>12px</Text> radius
            </>
          }
        >
          <ChatRow message={ATHLETE_MESSAGE} />
        </Specimen>
        <Specimen label="Coach — left, well fill and a rule">
          <ChatRow message={COACH_MESSAGE} />
        </Specimen>
        <Specimen label="Safety intercept — routed away from the bubble by bubbleText()">
          <ChatRow message={SAFETY_MESSAGE} />
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="BodyMap" note="Track colour, never the ember" />
        <Text style={styles.note}>
          Tappable. Selection is a filled patch inside an outline, so it survives
          desaturation; the fill is track, not accent, because this is the
          athlete describing their body rather than actuating the system. Hit
          areas are <Text style={styles.figure}>48pt</Text> even where the
          drawing is a few points wide.
        </Text>
        <Specimen label="Calf selected — tap to check the targets and the fill">
          <BodyMap
            selected={soreParts}
            onToggle={(partKey) =>
              setSoreParts((prev) =>
                prev.includes(partKey)
                  ? prev.filter((k) => k !== partKey)
                  : [...prev, partKey],
              )
            }
          />
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Chart primitives"
          note="Tap a column — the readout names the day"
        />
        <Text style={styles.note}>
          One frame, one height, one interaction for all eight charts. Inside a
          series there are only TWO kinds of nothing, not three: a day with no
          run arrives as a measured zero, and which days were scheduled off is
          not knowable across thirty days. Zero is solid, filled and short on
          the baseline; absent is dashed, hollow and{" "}
          <Text style={styles.figure}>12px</Text> tall. Desaturate and they are
          still two different objects.
        </Text>

        <Specimen label="Bars — a measured zero (Wed) next to an unknown (Thu)">
          <Card>
            <Plot
              data={BAR_SPECIMEN}
              domain={zeroBasedDomain(BAR_SPECIMEN.map((p) => p.value ?? 0))}
              unitLabel="MI"
              readout={(i) =>
                BAR_SPECIMEN[i].value === null
                  ? "Not recorded"
                  : `${BAR_SPECIMEN[i].value} mi`
              }
              accessibilityLabel="Eight days of distance. Two days at zero miles, one day not recorded."
            >
              {(frame) => (
                <>
                  <Bars frame={frame} data={BAR_SPECIMEN} />
                  <AbsentMarks frame={frame} data={BAR_SPECIMEN} />
                </>
              )}
            </Plot>
          </Card>
        </Specimen>

        <Specimen label="Line — a two-day hole, a lone reading, a band and a reference line">
          <Card>
            <Plot
              data={LINE_SPECIMEN}
              domain={[0, 2.2]}
              ticks={[0.5, 0.8, 1.3, 1.5, 2]}
              tickFormat={(v) => v.toFixed(1)}
              unitLabel="RATIO"
              readout={(i) =>
                LINE_SPECIMEN[i].value === null
                  ? "Not recorded"
                  : `${LINE_SPECIMEN[i].value?.toFixed(2)} workload ratio`
              }
              accessibilityLabel="Ten days of workload ratio. Three days not recorded."
            >
              {(frame) => (
                <>
                  <Band frame={frame} from={ACWR_BAND[0]} to={ACWR_BAND[1]} />
                  <RefLine
                    frame={frame}
                    value={ACWR_DANGER}
                    stroke={color.unusual}
                  />
                  <LinePath frame={frame} data={LINE_SPECIMEN} />
                  <AbsentMarks frame={frame} data={LINE_SPECIMEN} />
                </>
              )}
            </Plot>
          </Card>
        </Specimen>

        <Specimen label="sleepSeries — six recorded nights out of thirty, densified">
          <Card>
            <SleepSpecimen />
          </Card>
        </Specimen>

        <Specimen label="Not enough data — the ordinary Absent, at the plot's height">
          <Card>
            <ChartAbsent label="Not enough training history yet — sync more data or give it a couple of weeks." />
          </Card>
        </Specimen>

        {/* ----------------------------------------------------------
         * Volume and pace (Stage 2.1). Self-contained: these four
         * specimens and the four constants above them are the whole
         * block, so the charts appended here by other stages neither
         * depend on it nor are depended on by it.
         * -------------------------------------------------------- */}
        <Section
          title="Weekly mileage & pace"
          note="Pace runs upside down — up = faster"
        />
        <Text style={styles.note}>
          Both panels draw themselves, note and all. The pace axis is INVERTED
          so improvement climbs, which is the one place in the app where reading
          the picture the obvious way gives you the opposite of the truth — so
          the caption is welded to the panel rather than left to a legend. The
          null week is the point of the third specimen: no qualifying run is not
          a slow run, so the line breaks and the week gets the dashed mark
          instead of being quietly closed up.
        </Text>

        <Specimen label="WeeklyKmChart — twelve weeks, zero-based bars">
          <WeeklyKmChart weeks={SPECIMEN_WEEKS} />
        </Specimen>

        <Specimen label="WeeklyKmChart — weeks={undefined}, the leg the payload omitted">
          <WeeklyKmChart />
        </Specimen>

        <Specimen
          label={
            <>
              PaceChart — two weeks with no qualifying run (
              <Text style={styles.figure}>Apr 21</Text>,{" "}
              <Text style={styles.figure}>May 12</Text>)
            </>
          }
        >
          <PaceChart paceSeason={SPECIMEN_PACE} />
        </Specimen>

        <Specimen label="PaceChart — only two paced weeks, under the three-week floor">
          <PaceChart paceSeason={THIN_PACE} />
        </Specimen>

        {/* ----------------------------------------------------------
         * Sleep (Stage 2.2). Self-contained: these five specimens and the
         * three SLEEP_* constants above them are the whole block.
         * -------------------------------------------------------- */}
        <Section
          title="Sleep & sleep stages"
          note="A missing night is never a short night"
        />
        <Text style={styles.note}>
          The riskiest pair in the app. The website coerces an unrecorded night
          to zero (`charts.tsx:343`), so a week the watch sat in a drawer draws
          as a week of no sleep. Here the run of five adjacent nights in the
          middle of the chart is dashed and hollow, the one night that really
          logged zero is a solid stub in the bar fill, and tapping either says
          which it was: &quot;Not recorded&quot; against &quot;
          <Text style={styles.figure}>0.0 h</Text>&quot;. The meter has the same
          split one level down — a stage the watch never tracked is a dashed
          track, not an empty one.
        </Text>

        <Specimen label="SleepChart — a genuine zero, then five adjacent unrecorded nights">
          <SleepChart sleep30={SLEEP_NIGHTS} />
        </Specimen>

        <Specimen label="SleepChart — sleep30={undefined}, the optional field absent">
          <SleepChart />
        </Specimen>

        <Specimen label="SleepStages — the zero night averages in; the stageless night does not">
          <SleepStages sleep30={SLEEP_NIGHTS} />
        </Specimen>

        <Specimen label="SleepStages — REM never tracked: one dashed row, two real ones">
          <SleepStages sleep30={SLEEP_NO_REM} />
        </Specimen>

        <Specimen label="SleepStages — hours all week, no stages at all: Absent, not three empty bars">
          <SleepStages sleep30={SLEEP_NO_STAGES} />
        </Specimen>

        {/* ── Stage 2.4 · MentalChart / FitnessChart ───────────────────
         * The website draws the energy and motivation lines with
         * `connectNulls` (charts.tsx:422), which joins straight across every
         * day nobody checked in. These two specimens are the visual proof that
         * this app does not: watch the lines stop at the holes, and watch a day
         * with only one half recorded keep its point AND get a dashed mark.
         * -------------------------------------------------------- */}
        <Specimen
          label={
            <>
              MentalChart — <Text style={styles.figure}>8</Text> check-ins in{" "}
              <Text style={styles.figure}>30 days</Text>, a{" "}
              <Text style={styles.figure}>14-day</Text> hole, and days with only
              one half recorded
            </>
          }
        >
          <MentalChart mental30={HALF_ANSWERED_MENTAL} />
        </Specimen>

        <Specimen label="MentalChart — mental30={undefined}: the not-enough-data state, at the plot's height">
          <MentalChart />
        </Specimen>

        <Specimen
          label={
            <>
              FitnessChart — a model output on a fixed{" "}
              <Text style={styles.figure}>0–100</Text> axis: no trend arrow, no
              badge, no colour verdict
            </>
          }
        >
          <FitnessChart weekly={SEASON_FITNESS} />
        </Specimen>

        <Specimen label="FitnessChart — two weeks only: under the three-week threshold, so nothing is drawn">
          <FitnessChart weekly={SEASON_FITNESS.slice(0, 2)} />
        </Specimen>

        {/* ── Stage 2.5 · PrChart ──────────────────────────────────────
         * Self-contained: these three specimens and the two PR_* constants
         * at the foot of the file are the whole block.
         *
         * The one chart in the set whose x axis is real dates and whose y
         * axis is upside down, and the one that is several charts. Both
         * decisions are visible here: the XC 5K block draws (five PRs), the
         * Mile and 5K blocks list instead, and the note above the drawn one
         * says both that faster is higher and that the spacing is not by
         * date. Compare the XC 5K dates — two PRs a week apart, then one
         * five months later — against the evenly spaced dots.
         * -------------------------------------------------------- */}
        <Section
          title="PR progression"
          note="Upside down again — and every step is a step down the clock"
        />
        <Text style={styles.note}>
          One block per event, in one card. The website draws a panel per event
          in a two-column grid; stacked on a phone that is four{" "}
          <Text style={styles.figure}>~250pt</Text> panels, three of which hold
          a single dot, so an event under three PRs is listed rather than drawn. Nothing is lost — every PR the payload
          carries is on screen with its explicit local day either way. The step
          is `stepAfter`, not a slope: a PR HOLDS until it is beaten, and a
          diagonal would draw the athlete improving through months in which
          nothing was measured.
        </Text>

        <Specimen label="PrChart — five PRs unevenly spread (chart), two (list), one (list)">
          <PrChart progression={PR_PROGRESSION} />
        </Specimen>

        <Specimen label="PrChart — progression={undefined}: the not-enough-data state, at the plot's height">
          <PrChart />
        </Specimen>

        <Specimen label="PrChart — an event key with an empty list: Absent, naming the event">
          <PrChart progression={PR_EMPTY_EVENT} />
        </Specimen>

        {/* ── Stage 2.3 · AcwrChart / LoadChart ────────────────────────
         * Self-contained: these four specimens and the two LOAD_* constants
         * at the foot of the file are the whole block. Both charts are fed the
         * SAME thirty days, because on a real payload they are — they are two
         * readings of one `risk.series`, and seeing them stacked is the point:
         * the ratio chart is the load chart's two lines divided by each other.
         * -------------------------------------------------------- */}
        <Section
          title="Workload ratio & training load"
          note="The one number the product is about, and the numbers under it"
        />
        <Text style={styles.note}>
          The word &quot;ACWR&quot; appears nowhere on either panel; the
          website&apos;s own tooltip calls it &quot;Workload ratio&quot; and so
          does this. Neither chart wears a status colour: `ok` / `watch` /
          `unusual` are verdicts, and a band is a region of an axis, not a
          judgement about a fifteen-year-old — so the safe zone is a neutral
          wash and the <Text style={styles.figure}>1.5</Text> rule is `muted`,
          with the words underneath doing the interpreting. The load panel is
          where the zero rule bites hardest: seven of these thirty days are rest
          days that really logged zero and draw as solid stubs on the baseline,
          while the two days missing from the payload draw dashed and break all
          three series.
        </Text>

        <Specimen
          label={
            <>
              AcwrChart — nineteen days inside the band, four below it, three
              over the <Text style={styles.figure}>1.5</Text> rule
            </>
          }
        >
          <AcwrChart series={LOAD_SERIES} />
        </Specimen>

        <Specimen label="AcwrChart — series={undefined}: the workload-ratio wording of Absent, at the plot's height">
          <AcwrChart />
        </Specimen>

        <Specimen label="LoadChart — seven measured zeros, two absent days, and the two averages crossing">
          <LoadChart series={LOAD_SERIES} />
        </Specimen>

        <Specimen label="LoadChart — a week of running under the five-day floor: nothing is drawn">
          <LoadChart series={THIN_LOAD_SERIES} />
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="Type scale" note="If it is a number, it is mono" />
        {TYPE_SCALE.map((step) => (
          <View key={step.role} style={styles.typeRow}>
            <Text style={styles.typeRole}>{step.role}</Text>
            <Text style={styles.typeUse}>
              <Text style={styles.figure}>{step.spec}</Text> — {step.use}
            </Text>
            <Text style={[text[step.role], styles.typeSample]}>
              {step.sample}
            </Text>
          </View>
        ))}

        {/* ----------------------------------------------------------
          * STAGE 3.6 — INFODOT. Appended block, self-contained.
          * -------------------------------------------------------- */}
        <Section
          title="InfoDot"
          note="Tap a dot · tap anywhere to close"
        />
        <Text style={styles.note}>
          The explainers a stat tile can carry, ported from the website&apos;s
          `info=` props. Two things are on test here and neither shows in a
          screenshot. First, the dot is drawn at{" "}
          <Text style={styles.figure}>16px</Text> but its tap target is the full{" "}
          <Text style={styles.figure}>48px</Text> — added as `hitSlop`, so the
          label row is exactly as tall as the tile below it with no dot at all.
          Second, the panel is placed from the dot&apos;s window coordinates
          inside a `Modal` and clamped to the screen, so the RIGHT-HAND tile of
          the pair opens a panel that is left-aligned with the page rather than
          one that runs off the edge — which is the case worth actually tapping. While a panel is open its
          invisible full-bleed overlay is the only thing that can be touched, so
          a second dot cannot open over the first: that, and not a store, is
          what makes only one open at a time.
        </Text>

        <Specimen label="Tile with info — the pair, so the right-hand panel's clamp can be tapped">
          <View style={styles.infoDotRow}>
            <Tile
              label="Week TRIMP"
              value="284 TRIMP"
              sub="training impulse, last 7 days"
              info={EXPLAINERS.weekTrimp}
            />
            <Tile
              label="Sleep consistency"
              value="71/100"
              info={EXPLAINERS.sleepConsistency}
            />
          </View>
        </Specimen>

        <Specimen label="Tile with info, value absent — the explainer survives the dash">
          <View style={styles.infoDotRow}>
            <Tile label="VO₂max" value={null} info={EXPLAINERS.vo2max} />
            <Tile label="Fitness score" value={null} info={EXPLAINERS.fitnessScore} />
          </View>
        </Specimen>

        <Specimen label="Tile without info — unchanged, and the reference for the label row's height">
          <View style={styles.infoDotRow}>
            <Tile label="Week TRIMP" value="284 TRIMP" sub="training impulse, last 7 days" />
            <Tile label="Sleep consistency" value="71/100" />
          </View>
        </Specimen>

        <View style={styles.tail} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ *
 * Gallery-local scaffolding. Not part of the design system.
 * ------------------------------------------------------------------ */

/**
 * The website's Panel header: semibold title on the left, the caveat or the
 * reading instruction as a muted note on the right, baseline-aligned.
 */
function Section({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </View>
  );
}

function Caption({
  children,
  center,
}: {
  children: string;
  center?: boolean;
}) {
  return (
    <Text style={[styles.caption, center && styles.captionCenter]}>
      {children}
    </Text>
  );
}

/**
 * `label` is a NODE rather than a string, for the same reason `PanelProps.note`
 * is one: a caption here routinely carries a figure ("12px radius", "0–100
 * axis"), and every numeral in this app is mono and tabular a word deep in
 * prose. Callers pass a nested `Text style={styles.figure}` for those.
 */
/**
 * The grouped surface a `RunCard` row sits on.
 *
 * `RunCard` stopped drawing its own card when it became a list row — the log
 * is one slab with the corners at its ends, so the surface belongs to whatever
 * holds the rows. On this sheet each specimen is one row, so it rounds both.
 */
function RunSlab({ children }: { children: React.ReactNode }) {
  return <View style={styles.runSlab}>{children}</View>;
}

function Specimen({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.specimen}>
      <Text style={styles.specimenLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * Sleep, straight out of `lib/chartData`. The prep decides the domain, the
 * ticks, the unit and the readout, so the specimen is one `<Plot>` and two
 * marks — which is the whole argument for the primitive set.
 *
 * Six nights of data and twenty-four dashed marks. On the website those
 * twenty-four would be zero-height bars at the axis (`charts.tsx:343`), which
 * is a fortnight of "we don't know" drawn as "you slept nothing".
 */
function SleepSpecimen() {
  const s = sleepSeries(SPARSE_SLEEP);
  if (!s.enough) return <ChartAbsent label={s.absentLabel} />;
  return (
    <Plot
      data={s.points}
      domain={s.domain}
      ticks={s.ticks}
      tickFormat={s.tickFormat}
      unitLabel={s.unitLabel}
      readout={s.readout}
      accessibilityLabel="Thirty nights of sleep. Six recorded, twenty-four not recorded."
    >
      {(frame) => (
        <>
          <RefLine frame={frame} value={SLEEP_TARGET_H} />
          <Bars frame={frame} data={s.points} />
          <AbsentMarks frame={frame} data={s.points} />
        </>
      )}
    </Plot>
  );
}

/**
 * The routing every chat caller has to do, shown rather than described:
 * `bubbleText` mints the branded string a bubble needs and returns null for a
 * flagged message, so the safety branch is the only place that text can go.
 * There is no argument this file could construct that would bubble it.
 */
function ChatRow({ message }: { message: ChatMessage }) {
  const body = bubbleText(message);
  if (body === null) return <SafetyNotice text={message.text} />;
  return <ChatBubble role={message.role} text={body} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: { paddingHorizontal: layout.page, paddingBottom: space.xxxl },

  pageTitle: { ...text.title, color: color.ink, marginTop: space.xl },
  /** The ember signature. A shape, so it takes the fill stops. */
  emberRule: {
    height: space.xs,
    borderRadius: radius.card,
    // The squircle, on every radius that is not a `pill` (space.ts). At 4pt
    // tall RN clamps this corner to 2 and the curve is invisible — it is here
    // so the rule holds without exception, not for what it does at this size.
    borderCurve: "continuous",
    marginTop: space.sm,
    width: space.xxxl * 2,
  },
  pageNote: { ...text.meta, color: color.muted, marginTop: space.sm },

  section: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: layout.section,
    marginBottom: space.sm,
  },
  // A glyph, so it takes brandText — 4.88:1 on `bg`, where the `brand` fill it
  // replaces would be 2.03:1.
  sectionTitle: {
    ...text.meta,
    fontFamily: font.bodySemi,
    color: color.brandText,
  },
  sectionNote: { ...text.micro, color: color.muted, flexShrink: 1 },
  note: { ...text.meta, color: color.ink2, marginBottom: space.md },
  /**
   * One row's worth of the grouped surface `RunCard` now expects around it.
   * Both corners, because a specimen is a list of one — in `(tabs)/runs.tsx`
   * only the first and last rows round, and the rows between are square.
   */
  runSlab: { backgroundColor: color.card, borderRadius: radius.card },

  specimen: { marginTop: space.lg },
  specimenLabel: { ...text.meta, color: color.muted, marginBottom: space.sm },

  /**
   * A figure inside one of the sheet's own captions or notes. Nested in the
   * surrounding `Text`, so it inherits that size and colour and changes only
   * the face — the rule has no prose exemption: if it is a number, it is mono
   * and tabular. Code identifiers in backticks (`hitSlop`, `charts.tsx:343`)
   * are deliberately NOT wrapped: they are names, not measurements, and one of
   * them going mono while its neighbours stayed body-face would read as drift.
   */
  figure: { fontFamily: font.mono, ...tabular },

  caption: { ...text.meta, color: color.muted, marginTop: space.sm },
  captionCenter: { textAlign: "center" },

  trio: { flexDirection: "row", gap: space.sm },
  trioCell: { flex: 1 },

  dotRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.xl,
  },
  dotCell: { flex: 1, alignItems: "center" },
  dotInline: { flexDirection: "row", alignItems: "center", gap: space.lg },

  cardTitle: { ...text.title, color: color.ink },
  cardBody: { ...text.base, color: color.ink2, marginTop: space.xs },
  cardFlush: { ...text.base, color: color.ink2 },

  statRow: { flexDirection: "row", justifyContent: "space-between" },

  typeRow: { marginTop: space.lg },
  typeRole: { ...text.micro, color: color.muted },
  typeUse: { ...text.meta, color: color.muted },
  typeSample: { color: color.ink, marginTop: space.xs },

  /** Stage 3.6 — the two-up geometry the stat tiles actually ship in. */
  infoDotRow: { flexDirection: "row", gap: space.md },
  tail: { height: space.xl },
});

/* ------------------------------------------------------------------ *
 * Stage 2.4 specimen data — MentalChart / FitnessChart
 *
 * Appended at the foot of the file rather than beside the other specimen
 * constants so this block is self-contained and does not sit in anyone else's
 * diff. `const` at module scope is fine down here: the JSX above only reads
 * these at render time, long after the module has evaluated.
 * ------------------------------------------------------------------ */

/**
 * Eight check-ins across thirty days — which is roughly what `mental30`
 * actually looks like — chosen to exercise every case the chart has to get
 * right at once:
 *
 *   · 26/25/24 days ago   three days running, so energy draws a real polyline
 *   · 25 days ago         ENERGY WITH NO MOTIVATION. The two fields are
 *                         independently nullable, so this day keeps its energy
 *                         point and still gets a dashed baseline mark for the
 *                         half that is missing.
 *   · 23–10 days ago      A FOURTEEN-DAY HOLE. Both lines must stop dead at it.
 *                         The website would draw one straight segment across
 *                         the whole fortnight.
 *   · 9 days ago          the mirror case: motivation with no energy.
 *   · 7–4 days ago        a second, shorter hole.
 *   · 3/2/1 days ago      motivation is a lone dot at day 3 and day 1 with a
 *                         gap between, so both of `LinePath`'s branches — the
 *                         polyline and the run-of-one dot — are on screen.
 *
 * `stress` is the server's own derived boolean and is not plotted.
 */
const HALF_ANSWERED_MENTAL: MentalDay[] = [
  { date: localDayOffset(26), energy: 6, motivation: 7, stress: false },
  { date: localDayOffset(25), energy: 7, motivation: null, stress: false },
  { date: localDayOffset(24), energy: 5, motivation: 6, stress: true },
  { date: localDayOffset(9), energy: null, motivation: 8, stress: false },
  { date: localDayOffset(8), energy: 8, motivation: 8, stress: false },
  { date: localDayOffset(3), energy: 4, motivation: 3, stress: true },
  { date: localDayOffset(2), energy: 6, motivation: null, stress: false },
  { date: localDayOffset(1), energy: 7, motivation: 6, stress: false },
];

/**
 * A season of weekly fitness scores.
 *
 * `week` is a PRE-FORMATTED server string ("Mar 3" —
 * website/src/lib/profile.ts:276) with no ISO date beside it, so the app has
 * nothing to re-derive; `chartData` wraps it as "Week of Mar 3". These are
 * spelled the way the server spells them so the specimen tests the real thing.
 *
 * Deliberately undramatic: the fixed 0–100 axis is the point. Rescaled to this
 * data, twelve points of drift would look like a mountain range.
 */
const SEASON_FITNESS: Fitness["weekly"] = [
  { week: "Mar 3", score: 54 },
  { week: "Mar 10", score: 57 },
  { week: "Mar 17", score: 56 },
  { week: "Mar 24", score: 61 },
  { week: "Mar 31", score: 63 },
  { week: "Apr 7", score: 60 },
  { week: "Apr 14", score: 65 },
  { week: "Apr 21", score: 66 },
];

/* ------------------------------------------------------------------ *
 * Stage 2.5 — PR progression fixtures
 * ------------------------------------------------------------------ */

/**
 * Three events at the three counts the roster actually produces. Of the 56
 * athlete-event pairs in the seeded team, 34 hold ONE PR and 15 hold two, which
 * is the whole argument for listing under three rather than drawing.
 *
 * XC 5K is the uneven one on purpose: 6 and 13 September are a week apart, then
 * 11 October, then nothing until 21 March and 30 May. Evenly spaced dots do not
 * say that, so the block's note says it in words and every dot names its own
 * day when tapped.
 *
 * Times are SECONDS, exactly as `PrPoint` carries them, and every list is
 * improvements only and oldest first — the contract `buildProfile` guarantees
 * (website/src/lib/profile.ts:284).
 */
const PR_PROGRESSION: Record<string, PrPoint[]> = {
  "Mile": [
    { date: "2026-01-17", timeS: 296 },
    { date: "2026-04-11", timeS: 289 },
  ],
  "5K": [{ date: "2026-05-30", timeS: 1064 }],
  "XC 5K": [
    { date: "2025-09-06", timeS: 1182 },
    { date: "2025-09-13", timeS: 1174 },
    { date: "2025-10-11", timeS: 1151 },
    { date: "2026-03-21", timeS: 1128 },
    { date: "2026-05-30", timeS: 1109 },
  ],
};

/**
 * An event the payload names but has no PRs for. `buildProfile` never emits
 * this (it only adds a key when `prog.length`), so this specimen exists to
 * prove the branch renders the app's dashed Absent with the event named, rather
 * than an empty panel that could be read as a clean sheet.
 */
const PR_EMPTY_EVENT: Record<string, PrPoint[]> = { "800m": [] };

/* ------------------------------------------------------------------ *
 * Stage 2.3 — workload ratio / training load fixtures
 *
 * ONE series feeds both charts, because on a real payload one series feeds
 * both: `AcwrChart` and `LoadChart` are two readings of `profile.risk.series`,
 * and the ratio is literally the load chart's two lines divided by each other.
 * ------------------------------------------------------------------ */

/**
 * Daily loads for the last thirty local days, oldest first.
 *
 * `null` means the day is ABSENT FROM THE PAYLOAD ENTIRELY — not a zero. That
 * distinction is the whole reason this fixture is written as a sparse array and
 * then built rather than typed out: `0` below becomes a real `DailyPoint` with
 * `load: 0` (a rest day the athlete recorded, drawn as a solid stub), and
 * `null` becomes no row at all (drawn dashed, with every line broken across
 * it). Seven zeros and two holes.
 *
 * The shape is a steady month and then a hard block: twenty-two ordinary days
 * that keep the ratio between 0.72 and 1.15, then eight days with only one rest
 * in them, which walks it up through 1.3 and over 1.5. That is the picture the
 * band exists to make legible, and it is the only way to see the 1.5 rule
 * crossed without inventing a number no runner would produce.
 */
const LOAD_DAILY: (number | null)[] = [
  0, 75, 60, 0, 85, 70, 55,
  0, 80, 65, 70, null, 60, 0,
  75, 0, 85, 70, 90, 0, 80,
  110, null, 130, 145, 150, 160, 155, 170, 0,
];

/** Four running days in a week — under `MIN_LOAD_DAYS`, so nothing is drawn. */
const THIN_DAILY: (number | null)[] = [0, 70, 0, 65, 80, 0, 55];

/**
 * Turn daily loads into the `DailyPoint[]` the payload ships.
 *
 * `acute` and `chronic` are computed with the SAME exponentially weighted
 * moving averages the server uses (`website/src/lib/risk.ts:157` — λ = 2/(n+1)
 * over 7 and 28 days, and `acwr` null until chronic clears 25), so this fixture
 * cannot show the two lines in a relationship the real engine would never
 * produce. The seeds stand in for the ninety days of history before the window:
 * `risk.series` is 120 days long and the charts draw its last thirty, so a
 * fixture seeded at zero would spend two weeks with no ratio at all for a
 * reason that is an artefact of the fixture rather than of the athlete.
 */
function buildDailySeries(
  loads: (number | null)[],
  seedAcute = 70,
  seedChronic = 70,
): DailyPoint[] {
  const la = 2 / (7 + 1);
  const lc = 2 / (28 + 1);
  let acute = seedAcute;
  let chronic = seedChronic;
  const out: DailyPoint[] = [];
  loads.forEach((load, i) => {
    // Omitted from the payload: no row, so no EWMA step either.
    if (load === null) return;
    acute = load * la + acute * (1 - la);
    chronic = load * lc + chronic * (1 - lc);
    out.push({
      date: localDayOffset(loads.length - 1 - i),
      load,
      // KILOMETRES, as the payload carries them — every chart that shows a
      // distance converts through lib/units. Neither of these two does.
      km: load / 11,
      minutes: load / 6,
      acute,
      chronic,
      acwr: chronic > 25 ? acute / chronic : null,
    });
  });
  return out;
}

const LOAD_SERIES: DailyPoint[] = buildDailySeries(LOAD_DAILY);
/** Seeded low as well as short: a genuinely new athlete, not a taper. */
const THIN_LOAD_SERIES: DailyPoint[] = buildDailySeries(THIN_DAILY, 0, 0);
