/**
 * A labelled section: an uppercase label, then a card of rows.
 *
 * This is the single shape the whole Claude Design study is built from. Every
 * screen in the mockup — Home, Training, Stats, Recovery, Races, the pushed
 * detail screens — is a vertical stack of these and nothing else:
 *
 *     TODAY                      ← 13px, uppercase, muted, tracked
 *     ┌──────────────────────┐
 *     │ Easy run · 4.2 mi   ›│   ← 17px title, muted sub, chevron
 *     ├──────────────────────┤   ← separator, inset from the left
 *     │ Central League   17d │
 *     └──────────────────────┘
 *
 * ── WHY THIS EXISTS AND `Panel` DOES NOT COVER IT ───────────────────────────
 *
 * `Panel` puts its title INSIDE the card, which is the website's shape and the
 * right one for a card that is a single object with a caveat ("Weekly mileage ·
 * 4.2 mi of 42.3 mi target"). This is the other shape: a label that names a
 * GROUP, sitting outside and above it, where the card underneath is a list of
 * things rather than one thing.
 *
 * Both already existed in the app as the two heading ranks — a section heading
 * groups several cards, a panel title titles exactly one. This gives the first
 * rank a component instead of leaving it hand-drawn on five screens, which is
 * how it drifted into three sizes the first time.
 *
 * The label is `text.micro`: mono, uppercase, tracked. The design uses a 13px
 * sans; the app's micro role is 11.5 mono and is what every other eyebrow on
 * every other screen already uses, so matching the design here would have made
 * this the one eyebrow in the app that looked different.
 */
import { View, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { color } from "../theme/tokens";
import { layout, space } from "../theme/space";
import { text } from "../theme/type";

export type SectionProps = {
  /** Names the group. Sentence-cased here; `text.micro` renders it uppercase. */
  label: string;
  /**
   * The right-hand half of the label line — a count, a window, a caveat.
   *
   * A NODE, not a string, for the same reason `Panel.note` is: it frequently
   * carries a figure, and every numeral in this app is mono and tabular with
   * its unit welded on.
   */
  note?: React.ReactNode;
  children: React.ReactNode;
  /** Layout only, merged last. */
  style?: StyleProp<ViewStyle>;
};

export function Section({ label, note, children, style }: SectionProps) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.head}>
        <Text style={styles.label} accessibilityRole="header">
          {label}
        </Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  /**
   * Baseline-aligned and wrapping, so a long note drops under the label rather
   * than squeezing it — the same rule `Panel`'s head follows.
   */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    /* Indented slightly, as the design does: the label hangs just inside the
       card's corner rather than flush with the page edge. */
    paddingHorizontal: space.xs,
  },
  label: { ...text.micro, color: color.muted },
  note: { ...text.meta, color: color.muted, flexShrink: 1 },
});

export default Section;
