/**
 * /gallery — a dev-only specimen sheet.
 *
 * Every shared primitive in every state, labelled, so the system can be
 * verified by eye: the three kinds of nothing side by side, all four status
 * shapes, the advisory in each flag, cards, stats, run cards, the receipt, both
 * chat surfaces, the body map, and the type scale with its role names.
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
import { StatusDot } from "../components/StatusDot";
import { Advisory } from "../components/Advisory";
import { BodyMap } from "../components/BodyMap";
import { Card } from "../components/Card";
import { ChatBubble, bubbleText } from "../components/ChatBubble";
import { CheckInReceipt } from "../components/CheckInReceipt";
import { RunCard } from "../components/RunCard";
import { SafetyNotice } from "../components/SafetyNotice";
import { Stat } from "../components/Stat";
import { ChatMessage, Flag, RecentRun } from "../lib/types";
import { color } from "../theme/tokens";
import { font, text, TextRole } from "../theme/type";
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

const TYPE_SCALE: { role: TextRole; sample: string; use: string }[] = [
  { role: "micro", sample: "Distance", use: "11.5 mono, +0.12em — micro-labels" },
  { role: "meta", sample: "Tue 14 Oct · before practice", use: "14 body — secondary metadata" },
  { role: "base", sample: "The app describes. It does not instruct.", use: "16.5 body — base" },
  { role: "baseSemi", sample: "Checked in 6:12am", use: "16.5 body 600 — emphasis, controls" },
  { role: "title", sample: "Yesterday's run", use: "19 display — card titles" },
  { role: "stat", sample: "8:51 /mi", use: "22 mono — inline stats" },
  { role: "prompt", sample: "How did you sleep?", use: "34 display 800 — the check-in prompt" },
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
          Colour is the last cue, never the only one. Dashed means "we don't
          know" and nothing else does; zero is a fact and looks like every other
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
        <Specimen label="At the default 12px, inline size">
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
            <Text style={styles.cardTitle}>Yesterday's run</Text>
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
          Distance / Time / Pace, always that order, right of the route glyph.
          Nothing here is coloured, so the greyscale copy should be identical.
        </Text>
        <Specimen label="Ordinary run — eyebrow carries the date and the team's word">
          <RunCard run={PLAIN_RUN} dateLabel="Tue 14 Oct" sessionLabel="Easy run" />
        </Specimen>
        <Specimen label="Spiked run — advisory inline, split dot, no banner or modal">
          <RunCard run={SPIKED_RUN} dateLabel="Sun 12 Oct" sessionLabel="Long run" />
        </Specimen>
        <Specimen label="No pace — the third column goes dashed, never '0:00 /mi'">
          <RunCard run={PACELESS_RUN} dateLabel="Sat 11 Oct" />
        </Specimen>
        <Specimen label="No session type — eyebrow is the date alone">
          <RunCard run={PLAIN_RUN} dateLabel="Tue 14 Oct" />
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
          Side and geometry separate the speakers, not hue: the athlete's bubble
          is right-aligned and unruled, the coach's is left and held by a rule.
          The safety notice has no bubble geometry at all — no radius, no side,
          one heavy left rule; it is full-bleed in the thread and only inset
          here by the page. In greyscale the three stay unmistakable.
        </Text>
        <Specimen label="Athlete — right, accent fill, 12px radius">
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
          areas are 48pt even where the drawing is a few points wide.
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
        <Section title="Type scale" note="If it is a number, it is mono" />
        {TYPE_SCALE.map((step) => (
          <View key={step.role} style={styles.typeRow}>
            <Text style={styles.typeRole}>{step.role}</Text>
            <Text style={styles.typeUse}>{step.use}</Text>
            <Text style={[text[step.role], styles.typeSample]}>
              {step.sample}
            </Text>
          </View>
        ))}

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

function Specimen({
  label,
  children,
}: {
  label: string;
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

  specimen: { marginTop: space.lg },
  specimenLabel: { ...text.meta, color: color.muted, marginBottom: space.sm },

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

  tail: { height: space.xl },
});
