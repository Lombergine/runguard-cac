/**
 * One density tile: a micro-label, one big mono figure, an optional sub-line.
 *
 * Ports the website's `BentoTile`
 * (website/src/components/athlete/tabs.tsx:127): a white `card` ground, the
 * `ruleSoft` hairline, `radius.card`, and `shadow.card`. What does NOT survive
 * the port is the web version's entrance animation and its per-tile glow — a
 * shadow here is elevation, never emphasis, so every tile carries the same one.
 *
 * The card surface is spelled out here rather than composed from <Card/>
 * because a tile has to `flex: 1` so both tiles in a grid row finish at the
 * same height, and Card takes no style prop. Every value still comes from the
 * same tokens Card uses, so the two surfaces cannot drift.
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

import { InfoDot } from "./InfoDot";
import { color } from "../theme/tokens";
import { text, font, tabular } from "../theme/type";
import { layout, radius, space, ruleWidth } from "../theme/space";

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
   *
   * This lands on a GLYPH, so it must be one of the `…Text` variants
   * (`brandText`, `okText`, `watchText`, `unusualText`, `series1Text`) and
   * never a fill token. The fills are the website's raw hexes and fail as
   * text: `brand` is 2.15:1 on `card`, `ok` 3.30:1, `watch` 3.19:1. Their
   * `…Text` twins are all ≥5.16:1 on `card` and ≥4.51:1 on `well`.
   *
   * Ember is the app's signature and this is the one place in the primitives
   * where it belongs on a figure — `color.brandText` for a tile the screen
   * wants to read as the headline number.
   */
  accent?: string;
  /**
   * Optional explainer, revealed by a circled "i" beside the label — what the
   * figure actually is and where it came from. One of `EXPLAINERS` in
   * ./InfoDot, which is where the copy lives.
   *
   * Omit it and this tile renders exactly the markup it did before, down to the
   * label being a bare `<Text>` rather than a row — verified by rendering both
   * and diffing the element trees.
   *
   * IT IS NOT, HOWEVER, FREE OF LAYOUT COST, and a comment here used to claim it
   * was ("no tile in a grid changes height"). Passing it costs the label 20px of
   * width — the 16px dot plus the `space.xs` gap — so a label that fitted on one
   * line without the dot can wrap to two lines with it, and a wrapped label is a
   * whole `text.micro` line (16px) taller. Measured against the real font
   * (Spline Sans Mono 500 at 11.5px is monospaced at 1200/2000 em = 6.90px per
   * glyph, plus 1.38px letterSpacing = 8.28px per character), in a 154px tile at
   * the 360px floor the label has 119px bare and 99px with the dot:
   *
   *   FITNESS SCORE     107.6px   fits bare, WRAPS with the dot   ← stats row 1
   *   BODY BATTERY       99.4px   fits bare, wraps with the dot by 0.4px
   *   SLEEP CONSISTENCY 140.8px   wraps either way
   *   every other label            fits both ways
   *
   * So the row is 16px taller than it would be, not misaligned — the dot itself
   * is drawn at 16px, exactly `text.micro.lineHeight`, so a SINGLE-line label
   * row is genuinely the height it always was. The two labels above are the
   * whole exposure at 360px; a shorter label, a wider screen or a full-width
   * tile has none. Fixing it means shortening a label or moving the dot, both of
   * which are layout decisions rather than component ones.
   */
  info?: string;
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
export function Tile({ label, value, sub, accent, info }: TileProps) {
  const absent = value === null;
  return (
    <View style={styles.tile}>
      {info ? (
        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelWraps]}>{label}</Text>
          {/* A fixed-height column, so the dot stays level with the FIRST line
              when a long label wraps — the same trick recovery.tsx uses to
              centre a tip's marker. `alignItems: "center"` on the row would
              float it into the middle of a two-line label instead. */}
          <View style={styles.labelDot}>
            <InfoDot label={label} text={info} />
          </View>
        </View>
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
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
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    // The squircle iOS draws itself, as <Card/> does and as space.ts asks of
    // every radius but `pill`. Free, and most of what separates a native
    // surface from a web page in a wrapper.
    borderCurve: "continuous",
    padding: layout.cardPadding,
  },
  label: { ...text.micro, color: color.muted },
  /** Only reached when `info` is passed — see the note on the prop. */
  labelRow: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  /** Without this the label pushes the dot off the tile rather than wrapping. */
  labelWraps: { flexShrink: 1 },
  labelDot: {
    height: text.micro.lineHeight as number,
    justifyContent: "center",
  },
  /** A step under `stat`: two of these share a row, and "63.5 ml/kg/min" has to fit one line. */
  value: { ...text.stat, fontSize: 20, lineHeight: 24, color: color.ink, marginTop: space.xs },
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
