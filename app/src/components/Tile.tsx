/**
 * One density tile: a micro-label, one big mono figure, an optional sub-line.
 *
 * Mirrors the website's `BentoTile`
 * (website/src/components/athlete/tabs.tsx) for its INFORMATION, not for its
 * decoration. The web version carries a gradient ground, a glow and an entrance
 * animation; none of that survives the port. Here it is a flat `card` ground
 * with a single 1.5px rule — see ../../../docs/visual-spec.md § "Lines instead
 * of shadows". No shadow, no elevation, no gradient, no tint.
 *
 * The card surface is spelled out here rather than composed from <Card/>
 * because a tile has to `flex: 1` so both tiles in a grid row finish at the
 * same height, and Card takes no style prop. Every value still comes from the
 * same tokens Card uses.
 *
 * `value` arrives PRE-FORMATTED with its unit already welded on ("7.2 h",
 * "48 ms", "4.2 mi"). There is deliberately no `unit` prop: a separate unit
 * prop is precisely how a bare numeral ends up in one Text node with its unit
 * in another, which visual-spec non-negotiable #3 forbids.
 *
 * `value: null` means the reading was never recorded, and renders as a dash in
 * `color.unknown` with "Not recorded" beneath — see the note on the component
 * for why this is inline rather than a nested <Absent/> box. It is still the
 * difference between "we don't know" and a fact, never a stand-in numeral and
 * never a zero.
 */
import { View, Text, StyleSheet } from "react-native";

import { color } from "../theme/tokens";
import { text, font, tabular } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

export type TileProps = {
  /** Micro-label, e.g. "Resting HR". Rendered uppercase by `text.micro`. */
  label: string;
  /**
   * Pre-formatted WITH its unit welded on, e.g. "7.2 h". `null` when the
   * reading does not exist — renders <Absent/>, never a stand-in numeral.
   */
  value: string | null;
  /** Optional second line, e.g. "+3 bpm vs base". Mono, because it has a numeral in it. */
  sub?: string;
  /**
   * Colour for the figure. A token from ../theme/tokens — never a literal.
   * Colour is rationed to about three appearances per screen, so most tiles
   * leave this unset and read ink-on-card.
   */
  accent?: string;
};

/**
 * A missing reading renders an inline dash in the value slot, NOT a nested
 * `<Absent/>` box.
 *
 * The box was the first attempt and it was wrong on screen: three unrecorded
 * recovery metrics became three large dashed rectangles that dominated the home
 * screen, so absence outweighed data — the opposite of what it should do. The
 * spec requires absence to be *distinguishable*, not *prominent*, and the web
 * portal renders exactly a bare `—` in the same numeral position
 * (BentoTile, website/src/components/athlete/tabs.tsx:150).
 *
 * The tile's own border is already the container, so a second bordered box
 * inside it was redundant as well as loud. The dash keeps `color.unknown` and
 * sits at the value's size and position, so the row still aligns, and the
 * "Not recorded" label moves to the sub-line where a real tile's delta goes.
 */
export function Tile({ label, value, sub, accent }: TileProps) {
  const absent = value === null;
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          absent ? styles.valueAbsent : accent ? { color: accent } : null,
        ]}
      >
        {absent ? "—" : value}
      </Text>
      {absent ? (
        <Text style={styles.sub}>Not recorded</Text>
      ) : sub ? (
        <Text style={styles.sub}>{sub}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  label: { ...text.micro, color: color.muted },
  value: { ...text.stat, color: color.ink, marginTop: space.xs },
  /** Same size and position as a real value, so rows stay aligned. */
  valueAbsent: { color: color.unknown },
  // Mono at metadata size: the sub-line carries a figure ("+3 bpm vs base"),
  // and every numeral in this app is mono with its unit welded to it. Composed
  // from the type tokens rather than a new size, so no bare fontSize appears.
  sub: {
    ...text.meta,
    ...tabular,
    fontFamily: font.mono,
    color: color.muted,
    marginTop: space.xs,
  },
});

export default Tile;
