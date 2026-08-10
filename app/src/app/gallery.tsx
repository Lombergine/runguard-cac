/**
 * /gallery — a dev-only specimen sheet.
 *
 * Every shared primitive in every state, labelled, so the system can be
 * verified by eye: the three kinds of nothing side by side, all four status
 * shapes, the advisory in each flag, cards, stats, and the type scale with its
 * role names.
 *
 * The greyscale test lives here too: screenshot the status row, desaturate it,
 * and all four states must still be tellable apart.
 */
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Absent, Zero, NoRun } from "../components/Nothing";
import { StatusDot } from "../components/StatusDot";
import { Advisory } from "../components/Advisory";
import { Card } from "../components/Card";
import { Stat } from "../components/Stat";
import { Flag } from "../lib/types";
import { color } from "../theme/tokens";
import { text, TextRole } from "../theme/type";
import { layout, space } from "../theme/space";

const FLAGS: Flag[] = ["clear", "watch", "unusual", "unknown"];

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

export default function Gallery() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.pageTitle}>Specimen sheet</Text>
        <Text style={styles.pageNote}>
          Shared primitives in every state. Not a product screen.
        </Text>

        {/* ---------------------------------------------------------- */}
        <Section title="Three kinds of nothing" />
        <Text style={styles.note}>
          Adjacent on purpose. Dashed is the only one that means "we don't
          know"; zero is a fact; rest recedes.
        </Text>
        <View style={styles.trio}>
          <View style={styles.trioCell}>
            <Absent />
            <Caption>Absent</Caption>
          </View>
          <View style={styles.trioCell}>
            <Zero unit="mi" />
            <Caption>Zero</Caption>
          </View>
          <View style={styles.trioCell}>
            <NoRun />
            <Caption>NoRun</Caption>
          </View>
        </View>

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
        <Section title="StatusDot" />
        <Text style={styles.note}>
          Shape carries the meaning. Desaturate this row — all four must still
          read apart.
        </Text>
        <View style={styles.dotRow}>
          {FLAGS.map((flag) => (
            <View key={flag} style={styles.dotCell}>
              <StatusDot flag={flag} size={28} />
              <Caption>{flag}</Caption>
            </View>
          ))}
        </View>
        <Specimen label="At the default 12px, inline size">
          <View style={styles.dotInline}>
            {FLAGS.map((flag) => (
              <StatusDot key={flag} flag={flag} />
            ))}
          </View>
        </Specimen>

        {/* ---------------------------------------------------------- */}
        <Section title="Advisory" />
        {FLAGS.map((flag) => (
          <Specimen key={flag} label={`flag="${flag}"`}>
            <Advisory flag={flag} reason={REASONS[flag]} />
          </Specimen>
        ))}

        {/* ---------------------------------------------------------- */}
        <Section title="Card" />
        <Specimen label="padded (default)">
          <Card>
            <Text style={styles.cardTitle}>Yesterday's run</Text>
            <Text style={styles.cardBody}>
              One crisp rule, no shadow. Nothing in this app floats.
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
        <Section title="Stat" />
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
        <Section title="Type scale" />
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

function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
}

function Caption({ children }: { children: string }) {
  return <Text style={styles.caption}>{children}</Text>;
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: { paddingHorizontal: layout.page, paddingBottom: space.xxxl },

  pageTitle: { ...text.title, color: color.ink, marginTop: space.xl },
  pageNote: { ...text.meta, color: color.muted, marginTop: space.xs },

  section: {
    ...text.micro,
    color: color.accent,
    marginTop: layout.section,
    marginBottom: space.sm,
  },
  note: { ...text.meta, color: color.ink2, marginBottom: space.md },

  specimen: { marginTop: space.lg },
  specimenLabel: { ...text.meta, color: color.muted, marginBottom: space.sm },

  caption: { ...text.meta, color: color.muted, marginTop: space.sm },

  trio: { flexDirection: "row", gap: space.sm },
  trioCell: { flex: 1 },

  dotRow: { flexDirection: "row", gap: space.xl },
  dotCell: { alignItems: "center" },
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
