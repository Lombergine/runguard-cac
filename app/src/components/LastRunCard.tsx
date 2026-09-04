/**
 * The athlete's most recent run, as the Home screen's picture of them: the
 * three figures — Distance / Time / Pace, always those three, always in that
 * order — with the explicit local day, opening the run itself on tap.
 *
 * Distance and pace go through lib/units; the day is pre-formatted by
 * lib/dates. Nothing here derives a date or a unit.
 */
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { dayLabel } from "../lib/dates";
import { fmtDuration, fmtMiles, fmtPaceMi } from "../lib/units";
import type { RecentRun } from "../lib/types";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, space, ruleWidth } from "../theme/space";
import { Press } from "./Press";

export function LastRunCard({ run }: { run: RecentRun }) {
  const router = useRouter();
  const pace = fmtPaceMi(run.durationS, run.km);
  const day = dayLabel(run.date);
  return (
    <Press
      onPress={() => router.push(`/activity/${run.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Your last run, ${day}: ${fmtMiles(run.km)} in ${fmtDuration(run.durationS)}`}
      accessibilityHint="Opens this run."
      style={styles.card}
      pressedStyle={styles.pressed}
    >
      <View style={styles.head}>
        <View>
          <Text style={styles.eyebrow}>Your last run</Text>
          <Text style={styles.day}>{day}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.label}>Distance</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {fmtMiles(run.km)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>Time</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {fmtDuration(run.durationS)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>Pace</Text>
          {pace === null ? (
            <Text style={styles.valueUnknown}>—</Text>
          ) : (
            <Text
              style={[styles.value, styles.valueAccent]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {pace}
            </Text>
          )}
        </View>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    gap: space.lg,
  },
  pressed: { backgroundColor: color.surface3 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { ...text.micro, color: color.muted },
  day: { ...text.baseSemi, color: color.ink, marginTop: 2 },
  chevron: { ...text.stat, color: color.muted },
  stats: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  /* Equal columns: three figures share the width instead of the longest
     one pushing the others off the card. */
  stat: { gap: 2, flex: 1, minWidth: 0 },
  label: { ...text.micro, color: color.muted },

  value: { ...text.stat, color: color.ink },
  valueAccent: { color: color.brandText },
  valueUnknown: { ...text.stat, color: color.unknown },
});
