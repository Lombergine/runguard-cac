/**
 * The inset grouped list — the structure the native rebuild is built on.
 *
 * The mock names this as the central change: "Cards of key/value → inset
 * grouped lists with real separators". The difference is not decoration. A
 * key/value card is a web idiom: it draws a box per fact, so ten facts are ten
 * boxes, each with its own border and shadow, and the eye has to re-enter every
 * one. An inset group draws ONE surface and separates the facts inside it with
 * hairlines, so a section reads as a single object with parts — which is both
 * how iOS presents settings and dense data, and how a coach or athlete actually
 * reads these screens: down a column, not box to box.
 *
 * ── THE SEPARATOR INSET IS THE WHOLE TRICK ─────────────────────────────────
 * A rule that runs the full width cuts the group into slices. A rule that
 * starts at the LABEL's left edge and runs to the group's right edge reads as
 * belonging to the row above it, which is what makes a grouped list feel like
 * one surface rather than a stack. `ListRow` measures that inset from its own
 * leading content, so a row with an avatar indents its separator further than a
 * row without one — the same behaviour as UITableView, and the reason this is a
 * component rather than a `borderBottomWidth` on a View.
 *
 * The last row never draws one: a rule against the group's rounded bottom edge
 * is the single most common way a hand-rolled grouped list looks wrong.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * It has no idea what an absent value is, and it must not learn. The visual
 * spec keeps absent / zero / no-run as three separate components
 * (`Nothing.tsx`), and a list that rendered its own em dash for a null would
 * quietly become a fourth — the one that means "we don't know" in a place
 * where nobody chose it. `value` takes a node, so a caller hands in `<Absent/>`
 * and the distinction stays where the spec put it.
 */
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, shadow } from "../theme/tokens";
import { tapped } from "../lib/motion";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";

/**
 * A titled group. The title sits OUTSIDE the surface, in the page margin —
 * the iOS convention, and the reason the group itself needs no header row.
 */
export function ListSection({
  title,
  footer,
  children,
}: {
  title?: string;
  /** Explanatory copy under the group. Where a web tooltip's text goes. */
  footer?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <List>{children}</List>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/** The rounded surface. Rows inside it get their separators automatically. */
export function List({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.group}>
      {rows.map((row, i) => (
        <View key={i}>
          {row}
          {/* Never after the last row — see the header. */}
          {i < rows.length - 1 ? <Separator inset={rowInset(row)} /> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * How far in this row's separator should start.
 *
 * Read off the row's own props rather than measured: a row with leading content
 * declares it, and asking the element is exact and synchronous, where an
 * onLayout measurement would land a frame late and visibly shift the rule.
 */
function rowInset(row: ReactElement): number {
  // Only the two props that move the inset, so a non-ListRow child (a custom
  // row a screen drops in) simply gets the default rather than throwing.
  const props = row.props as { leading?: ReactNode; leadingWidth?: number };
  if (!props.leading) return layout.cardPadding;
  const width = typeof props.leadingWidth === "number" ? props.leadingWidth : LEADING_WIDTH;
  return layout.cardPadding + width + space.md;
}

/** The default width reserved for a row's leading slot (an avatar, an icon). */
const LEADING_WIDTH = 28;

function Separator({ inset }: { inset: number }) {
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

export function ListRow({
  label,
  /**
   * The figure or answer. A NODE, not a string, so an unknown arrives as the
   * spec's own `<Absent/>` rather than as a dash this component invented.
   */
  value,
  /** Second line under the label — units, provenance, a date. */
  detail,
  /** An avatar or icon before the label. Sets the separator inset. */
  leading,
  leadingWidth,
  onPress,
  /** Draws the disclosure chevron. Implied by `onPress` unless set false. */
  chevron,
  accessibilityLabel,
}: {
  label: string;
  value?: ReactNode;
  detail?: string;
  leading?: ReactNode;
  leadingWidth?: number;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const showChevron = chevron ?? Boolean(onPress);
  const body = (
    <>
      {leading ? (
        <View style={[styles.leading, { width: leadingWidth ?? LEADING_WIDTH }]}>{leading}</View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.value}>{value}</Text>
      ) : (
        value ?? null
      )}
      {showChevron ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={tapped}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      /*
        The pressed state fills the whole row, not just the label. There is no
        hover on a phone, so the press IS the affordance — a row that does not
        visibly take the touch reads as a dead area.
      */
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionTitle: {
    ...text.micro,
    color: color.muted,
    marginLeft: layout.cardPadding,
    textTransform: "uppercase",
  },
  sectionFooter: {
    ...text.meta,
    color: color.muted,
    marginHorizontal: layout.cardPadding,
  },

  group: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    borderRadius: radius.card,
    overflow: "hidden",
    ...shadow.card,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.md,
    minHeight: target.min,
  },
  rowPressed: { backgroundColor: color.press },
  leading: { alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  label: { ...text.base, color: color.ink },
  detail: { ...text.meta, color: color.muted },
  value: { ...text.baseSemi, color: color.ink2 },
  chevron: { ...text.base, color: color.muted, marginLeft: -space.xs },

  separator: {
    height: ruleWidth,
    backgroundColor: color.sep,
  },
});

export default List;
