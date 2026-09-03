/**
 * A block of related figures in ONE panel, divided by hairlines.
 *
 * ── WHY THIS REPLACED FOUR FLOATING CARDS ──────────────────────────────────
 * The coach screens were built as a stack of individually-shadowed cards, one
 * per figure, each with a capitalised mono label and a full sentence of
 * explanation underneath. Four of those side by side is the most recognisable
 * shape a generated interface has: every element at the same elevation, the
 * same padding and the same weight, so nothing is subordinate to anything and
 * the eye has no route through the screen.
 *
 * Grouping fixes it structurally rather than cosmetically. Figures that answer
 * one question — "what does this team look like right now" — become one object
 * with one edge and one shadow, and the hairlines between them read as
 * columns of a table rather than as gaps between competing cards. That is also
 * what the website does: its roster tiles sit in a bordered row, not four
 * detached panels.
 *
 * ── ELEVATION IS NOW A HIERARCHY, NOT A DEFAULT ────────────────────────────
 * Only the OUTER panel takes `shadow.card`. Nothing nested inside it floats.
 * `tokens.ts` already says a shadow "is elevation, never emphasis: it must not
 * be used to make one card louder than another" — putting one on every element
 * broke that from the other direction, by making them all equally loud.
 *
 * ── THE CAPTION IS OPTIONAL AND QUIET ──────────────────────────────────────
 * Each figure may carry one short caption, and it is deliberately NOT the
 * sentence-long explanation the old tiles had ("Consecutive days with a run",
 * "Above 2 means every day looks the same"). Those read as a tutorial written
 * for someone who has never seen the screen. A coach reads this every morning.
 * The caption carries the thing that changes — "+24% vs previous", "3+ days" —
 * and anything that needs a paragraph belongs in an explainer, not under a
 * number.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ColorValue } from "react-native";

import { color, shadow } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

export type Figure = {
  label: string;
  /** null renders the dash: an absent figure, never a zero. */
  value: string | null;
  caption?: string;
  /** The figure only — never the cell. A tinted cell reads as an alert. */
  tone?: ColorValue;
};

export function StatGroup({ figures }: { figures: Figure[] }) {
  return (
    <View style={styles.panel}>
      {figures.map((f, i) => {
        const topRow = i < 2;
        const leftCol = i % 2 === 0;
        return (
          <View
            key={f.label}
            style={[
              styles.cell,
              // Hairlines BETWEEN cells only, never around the outside — the
              // panel's own border is the outside edge, and doubling it reads
              // as a drawn table rather than one surface.
              !topRow && styles.cellTopRule,
              leftCol && styles.cellRightRule,
            ]}
          >
            <Text style={styles.label} numberOfLines={1}>
              {f.label}
            </Text>
            <Text
              style={[
                styles.value,
                f.value === null ? styles.valueAbsent : f.tone ? { color: f.tone } : null,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {f.value ?? "—"}
            </Text>
            {f.caption ? (
              <Text style={styles.caption} numberOfLines={1}>
                {f.caption}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    overflow: "hidden",
    ...shadow.card,
  },
  cell: { width: "50%", padding: layout.cardPadding },
  cellTopRule: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  cellRightRule: { borderRightWidth: ruleWidth, borderRightColor: color.ruleSoft },
  /**
   * Sentence case, not the mono caps every label on these screens used to
   * wear. `text.micro` is the eyebrow voice — it belongs at the top of a
   * section, once. Spent on every figure in a 2×2 it stops being emphasis and
   * becomes noise, and four tracked-out capitalised strings is most of what
   * makes a screen look machine-assembled.
   */
  label: { ...text.meta, color: color.muted },
  value: { ...text.stat, fontSize: 26, lineHeight: 32, color: color.ink, marginTop: space.xs },
  valueAbsent: { color: color.unknown },
  caption: { ...text.meta, color: color.muted, marginTop: 2 },
});

export default StatGroup;
