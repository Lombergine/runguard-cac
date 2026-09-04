/**
 * Time in each heart-rate zone over the last seven days.
 *
 * Extracted from `(tabs)/stats.tsx` when the coach's athlete screen needed the
 * same panel. It is the SAME component in both places rather than two — the
 * rounding rule below is the kind of thing that silently diverges in a copy,
 * and a coach and an athlete reading different totals for the same week is
 * exactly the failure this codebase keeps designing against.
 *
 * The bar wears the five-rung ember ramp rather than five separate hues, so the
 * app has one encoding of "how hard" rather than two.
 */
import { StyleSheet, Text, View } from "react-native";

import { Absent } from "./Nothing";
import { useEmberRamp } from "./YearGrid";
import type { ZoneMinutes } from "../lib/types";
import { color, shadow } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

const ZONES = ["z1", "z2", "z3", "z4", "z5"] as const;

/**
 * The card head, inlined.
 *
 * `Panel` is defined LOCALLY in four screens (stats, settings, privacy,
 * profile) and is not a shared component, so this cannot import it. Rather
 * than make a fifth copy in a fifth place, this renders the same geometry
 * directly from the same tokens — and if `Panel` is ever extracted for real,
 * this is one of the call sites to fold into it.
 */
function Head({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.panelHead}>
      <Text style={styles.panelTitle}>{title}</Text>
      {note ? <Text style={styles.panelNote}>{note}</Text> : null}
    </View>
  );
}

/**
 * Time in each heart-rate zone over the last seven days.
 *
 * The bar wears the SAME five-rung ember ramp as the training year at the foot
 * of this screen (`components/YearGrid`) rather than the website's five
 * separate hues. Two five-step encodings of "how hard" on one screen would be
 * two visual languages for one idea, the ramp is monotonic in greyscale where
 * blue→green→amber→orange→red is not, and the status tokens stay where they
 * belong: on verdicts, never on chrome.
 *
 * A zone at zero minutes is a measured zero and prints `0 min`. The whole panel
 * only goes Absent when there is nothing at all — no `load` leg, or no
 * heart-rate minutes recorded all week, which is what a week of runs synced
 * without a strap looks like.
 */
export function HrZones({ zones }: { zones: ZoneMinutes | undefined }) {
  const ramp = useEmberRamp();
  // Rounded once, here, and summed from the rounded parts — so the total in
  // the note is always exactly the five figures in the legend added up.
  const minutes = ZONES.map((z) => Math.round(zones?.[z] ?? 0));
  const total = minutes.reduce((s, m) => s + m, 0);

  return (
    <View style={styles.panel}>
      <Head
        title="Time in HR zones"
        note={total > 0 ? `${total} min · last 7 days` : "last 7 days"}
      />
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
            {ZONES.map((z, i) =>
              minutes[i] > 0 ? (
                <View
                  key={z}
                  style={{ flex: minutes[i], backgroundColor: ramp[i] }}
                />
              ) : null,
            )}
          </View>

          {/* The legend IS the readout. Every zone prints its own minutes,
              welded, because the website's hover title has no phone. */}
          <View style={styles.legend}>
            {ZONES.map((z, i) => (
              <View key={z} style={styles.legendItem}>
                <View
                  style={[styles.swatch, { backgroundColor: ramp[i] }]}
                />
                <Text style={styles.legendValue}>
                  {`${z.toUpperCase()} · ${minutes[i]} min`}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.note}>
            Z1 is your easiest running, Z5 your hardest. Runs synced without
            heart rate are not counted here.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
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
  zoneBar: {
    flexDirection: "row",
    height: space.xl,
    borderRadius: radius.control,
    // The unfilled remainder is the sunken well, so a short week reads as a
    // short bar rather than as a full one at low intensity.
    backgroundColor: color.well,
    overflow: "hidden",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: space.md,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: space.md, height: space.md, borderRadius: space.xs },
  /** Mono at metadata size: it carries a numeral, and every numeral is mono. */
  legendValue: {
    ...text.meta,
    ...tabular,
    fontFamily: font.mono,
    color: color.ink2,
  },
  note: { ...text.meta, color: color.muted, marginTop: space.sm },
});

export default HrZones;
