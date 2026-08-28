/**
 * The inset grouped list — iOS's own list shape, as one component.
 *
 * Ported from `IOSList` / `IOSListRow` in the Claude Design "Mobile app
 * discrepancy" study's `ios-frame.jsx`, which restated this product as a native
 * app rather than a web page in a wrapper. The palette already matched; the
 * STRUCTURE did not, and this is the largest single piece of the difference: a
 * web page draws a bordered box per row, iOS pools rows into one soft slab and
 * lets the corner radius do the grouping.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `settings.tsx` had already hand-written this shape — a `LinkRow` with a
 * chevron, a `StaticRow` without one, and a `Divider` between them — and its
 * own comments show the reasoning being rediscovered locally ("Deliberately NOT
 * a Pressable … there is nothing to press, so there is no affordance to dim").
 * That reasoning is not settings-specific. It is the rule for every row in the
 * app, and a rule that lives in one screen is a rule the next screen breaks.
 *
 * ── THE ONE RULE THAT IS NOT COSMETIC ───────────────────────────────────────
 *
 * A row with no `onPress` is a plain `View`: no chevron, no press flash, no
 * accessibility role. A row that LOOKS tappable and is not is the same class of
 * lie as a check-in reminder switch that delivers nothing — the athlete taps,
 * nothing happens, and the only conclusion available to them is that the app is
 * broken. The chevron in particular is a promise that a screen is underneath;
 * it is `onPress`-gated below so the promise cannot be made by accident.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 *
 *     <List header="ACCOUNT">
 *       <ListRow title="Profile" detail="Aria N." onPress={…} chevron />
 *       <ListRow title="Version" detail={<Text style={mono}>1.0.0</Text>} isLast />
 *     </List>
 *
 * `isLast` on the final row is the caller's job. It is not derived from
 * `Children.count` on purpose: rows are routinely conditional (`{isDemo ? null
 * : <ListRow …/>}`), which makes a derived count silently wrong exactly when a
 * row is hidden, and the failure — a separator running into the slab's rounded
 * bottom corner — is the kind that only shows up on someone else's device.
 */
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { rowPress } from "../theme/press";
import { color } from "../theme/tokens";
import { layout, radius, ruleWidth, space, target } from "../theme/space";
import { text } from "../theme/type";

/**
 * The disclosure chevron.
 *
 * Same grid, same size, same path and same stroke as the one `settings.tsx`
 * draws, and the same 24-unit grid the tab bar's glyphs use — the icon
 * vocabulary is one system or it is noise. A screen adopting `ListRow` should
 * delete its local copy rather than keep a second definition alive.
 *
 * Stroked at `ruleWidth`, scaled up by the viewBox ratio so the drawn line is
 * 1.5pt on screen and not 1.5 viewBox units. Hairlines are rejected across this
 * codebase (see `space.ts`) because they disappear in direct sunlight, and the
 * chevron is the glyph an athlete looks for when deciding whether a row goes
 * anywhere.
 */
const GRID = 24;
const CHEVRON_SIZE = 20;
const CHEVRON = "M9.5 5.5 L16 12 L9.5 18.5";

function Chevron() {
  return (
    <Svg width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={CHEVRON}
        fill="none"
        stroke={color.muted}
        strokeWidth={(ruleWidth * GRID) / CHEVRON_SIZE}
      />
    </Svg>
  );
}

export type ListProps = {
  /**
   * The section eyebrow above the slab, e.g. "ACCOUNT". Optional — a single
   * unlabelled group at the top of a screen is the iOS convention and does not
   * need one.
   *
   * `text.micro` already uppercases and tracks it, so pass it in whatever case
   * reads best in source.
   */
  header?: string;
  children: React.ReactNode;
  /** Layout only — margin, flex. Merged LAST. See `CardProps.style`. */
  style?: StyleProp<ViewStyle>;
};

export function List({ header, children, style }: ListProps) {
  return (
    <View style={style}>
      {header ? (
        // A section header IS a heading, so VoiceOver's rotor can jump group to
        // group instead of walking every row — the same reasoning as `Panel`.
        <Text style={styles.header} accessibilityRole="header">
          {header}
        </Text>
      ) : null}
      <View style={styles.slab}>{children}</View>
    </View>
  );
}

export type ListRowProps = {
  /** The row's label. Sentence case. */
  title: string;
  /**
   * The right-hand value, muted.
   *
   * A NODE, not a string, for the same reason `PanelProps.note` is one: a
   * detail is very often a figure, and every numeral in this app is mono and
   * tabular (non-negotiable #3). Callers pass a nested `Text` for those, with
   * the unit welded into the same node ("4.2 mi", never "4.2" + "mi"). A date
   * must already be a pre-formatted LOCAL string — this component never
   * derives one.
   */
  detail?: React.ReactNode;
  /**
   * A second line beneath the title — the caveat, or the reason a row cannot be
   * changed. `settings.tsx`'s static rows show what this is for: a row that
   * exists but does nothing is only honest if it says why.
   */
  sub?: React.ReactNode;
  /**
   * What the row does. Omit it and the row renders inert: a plain `View`, no
   * chevron, no press flash, no role. That is the point — see the file header.
   */
  onPress?: () => void;
  /**
   * Show the disclosure chevron. Opt-in, and ignored without `onPress`.
   *
   * Not defaulted to `true` for a tappable row, because the chevron does not
   * mean "tappable", it means "a screen is underneath". Sign out, retry and
   * toggle rows act in place and must not wear one, and a default that has to
   * be switched off by the rows that would be lying is the wrong default.
   */
  chevron?: boolean;
  /** Last row in the slab: suppresses the separator. Caller-set — see header. */
  isLast?: boolean;
  /** Layout only. Merged LAST. */
  style?: StyleProp<ViewStyle>;
};

export function ListRow({
  title,
  detail,
  sub,
  onPress,
  chevron = false,
  isLast = false,
  style,
}: ListRowProps) {
  const body = (
    <>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {sub != null ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {detail != null ? <Text style={styles.detail}>{detail}</Text> : null}
      {onPress && chevron ? <Chevron /> : null}
      {/*
        Absolutely positioned rather than a `borderBottomWidth`, because the
        separator is inset from the LEFT (so it starts under the title, the way
        iOS draws it) and full-bleed right — a border is all-or-nothing across
        the row. `pointerEvents="none"` so it cannot swallow a touch that lands
        on the bottom 1.5pt of a 52pt target.
      */}
      {isLast ? null : <View style={styles.separator} pointerEvents="none" />}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, style]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      // "link" only when the row actually pushes a screen; everything else is a
      // button. VoiceOver announces the two differently, and that announcement
      // is the only chevron a screen-reader user gets.
      accessibilityRole={chevron ? "link" : "button"}
      accessibilityLabel={title}
      // `rowPress`, not `dim`: a row is a SURFACE, so it flashes a fill across
      // its full width. Dimming it would dim its own content. See theme/press.
      style={({ pressed }) => [styles.row, rowPress({ pressed }), style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * The eyebrow's inset is `cardPadding` alone, NOT the design's 36.
   *
   * 36 in `ios-frame.jsx` is 20 + 16: the list's own inset from the phone edge,
   * plus the row's inset inside the slab. Here the 20 is already spent by the
   * screen (`layout.page`), so repeating it would push the header 20pt right of
   * the row titles it is meant to align with.
   *
   * The design's 6pt bottom padding is rounded to `space.xs` — the theme is the
   * single source (app/CLAUDE.md) and a one-off 6 buys nothing that the 4px
   * scale does not, especially with `text.micro`'s own 4.5pt of leading.
   */
  header: {
    ...text.micro,
    color: color.muted,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    paddingHorizontal: layout.cardPadding,
  },
  /**
   * One pooled surface. `radius.group` (26) is deliberately much rounder than
   * `radius.card` — on a grouped list the corner is what does the grouping.
   *
   * `overflow: "hidden"` is load-bearing twice over: it clips the first and
   * last rows' press flash to the rounded corners (an unclipped flash paints
   * square corners over the slab and is the single most obvious tell that a
   * list was hand-rolled), and it keeps a separator from escaping the curve.
   *
   * No shadow and no border. A grouped list is a sunken group on the page
   * ground, not a card floating above it, and `shadow.card` here would put two
   * competing elevations on one screen.
   */
  slab: {
    backgroundColor: color.card,
    borderRadius: radius.group,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  /**
   * `minHeight`, not `height`: `target.row` (52) is the floor, and a row with a
   * `sub` line or Dynamic Type turned up grows past it rather than clipping.
   */
  row: {
    minHeight: target.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  /** Takes the slack so `detail` and the chevron stay pinned right. */
  body: { flex: 1 },
  title: { ...text.base, color: color.ink },
  sub: { ...text.meta, color: color.muted },
  /**
   * `flexShrink` so a long detail gives way to the title instead of pushing it
   * off the row; `textAlign` so a wrapped one stays right-aligned.
   */
  detail: { ...text.base, color: color.muted, flexShrink: 1, textAlign: "right" },
  separator: {
    position: "absolute",
    left: layout.cardPadding,
    right: 0,
    bottom: 0,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },
});

export default List;
