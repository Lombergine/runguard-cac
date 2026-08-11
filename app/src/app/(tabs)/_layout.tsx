/**
 * The tab bar. See ../../../../docs/visual-spec.md § "Components" → Nav.
 *
 * Four items, Home first and default, because the check-in is the product and
 * everything else — charts, calendar, race history — is explicitly secondary.
 *
 * Three things this file is careful about:
 *
 *  1. White bar over the cream page, held up by the website's hairline
 *     (`ruleSoft`) at the app's 1.5px width — the colour is the site's, the
 *     weight is ours, because a true hairline vanishes in sunlight. Under
 *     sunrise the bar may also float: `shadow.card`, the one elevation token,
 *     replaces the navigator's own `elevation: 8`. Nothing is hand-rolled.
 *  2. The active tab is the ember, because the ember is the brand. It lands
 *     twice and the two colours are NOT interchangeable: the label is a glyph
 *     and takes `brandText` (5.21:1 on the white bar), the icon is a shape and
 *     takes `brandStrong` (3.19:1 — over the 3:1 floor for a drawn element,
 *     where the `brand` fill itself would be 2.01:1 and invisible outdoors).
 *     Inactive stays `muted`, 5.16:1.
 *  3. The glyphs are drawn at the UI's own rule weight rather than at an icon
 *     set's. Each is stroked at `ruleWidth` device pixels exactly (the grid is
 *     scaled out of the stroke width), so a tab icon and a card border are the
 *     same line — a printed key, not a widget.
 */
import { Tabs } from "expo-router";
import { ColorValue, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { ruleWidth, space, target } from "../../theme/space";
import { color, shadow } from "../../theme/tokens";
import { text } from "../../theme/type";

/**
 * The bar's own height, above the home-indicator inset. One tap target plus a
 * gap: the icon-and-label stack needs the extra room, and the label must still
 * fit when the system font is scaled up.
 */
const BAR_HEIGHT = target.min + space.md;

/** Coordinate grid the glyphs are drawn on. Never a rendered size. */
const GRID = 24;

/**
 * Home — a house. The check-in lives here; this is the one tab an athlete uses
 * daily, so it gets the most literal glyph.
 */
const HOME = "M3.5 10.5 L12 4 L20.5 10.5 M6 8.6 V20 H18 V8.6";
/** Runs — a plotted line over a baseline. */
const RUNS = "M3.5 20.5 H20.5 M5 16.5 L10 10.5 L14 13.5 L20 5.5";
/** Calendar — a grid page with its header rule and two hangers. */
const CALENDAR = "M3.5 5.5 H20.5 V20.5 H3.5 Z M3.5 10 H20.5 M8 3 V7 M16 3 V7";
/** Races — a course flag. */
const RACES = "M6 3.5 V20.5 M6 5.5 H19 L16 9.5 L19 13.5 H6";

/**
 * `size` is handed down by the navigator (25 in its uikit variant). Dividing
 * the grid by it keeps the rendered stroke at exactly `ruleWidth` pixels
 * whatever size the platform asks for.
 */
function Glyph({
  d,
  stroke,
  size,
}: {
  d: string;
  stroke: ColorValue;
  size: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={(ruleWidth * GRID) / size}
      />
    </Svg>
  );
}

/**
 * One tab's icon renderer. The navigator hands down the active tint, which is
 * the label's ember (`brandText`); the drawn glyph takes the brighter
 * `brandStrong` instead, so the ember reads as ember at 1.5px without putting a
 * 2:1 fill under a word.
 */
function tabIcon(d: string) {
  return function TabIcon({
    color: tint,
    focused,
    size,
  }: {
    color: ColorValue;
    focused: boolean;
    size: number;
  }) {
    return (
      <Glyph d={d} stroke={focused ? color.brandStrong : tint} size={size} />
    );
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        // Screens own their own headers; a navigator header would be a second
        // voice on top of the check-in.
        headerShown: false,
        sceneStyle: styles.scene,
        // A glyph colour: the navigator paints the LABEL with this. The icon
        // overrides it in tabIcon().
        tabBarActiveTintColor: color.brandText,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: [styles.bar, { height: BAR_HEIGHT + insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          // "Home" does not say what is there, and this is the tab that
          // matters. The rest are named after what they show.
          tabBarAccessibilityLabel: "Home, the daily check-in",
          tabBarIcon: tabIcon(HOME),
        }}
      />
      <Tabs.Screen
        name="runs"
        options={{
          title: "Runs",
          tabBarIcon: tabIcon(RUNS),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: tabIcon(CALENDAR),
        }}
      />
      <Tabs.Screen
        name="races"
        options={{
          title: "Races",
          tabBarIcon: tabIcon(RACES),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: color.bg },
  bar: {
    backgroundColor: color.card,
    // The website's hairline colour at the app's 1.5px width.
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
    // The one elevation token, verbatim — it also supplies the `elevation` that
    // replaces the navigator's default 8. Its offset is downward, so what shows
    // above the bar is the soft top of the 14px blur, not a second shadow.
    ...shadow.card,
  },
  /** Guarantees the 48px target even if the bar is ever shortened. */
  item: { minHeight: target.min },
  // No colour here: the tint the navigator passes is what separates active
  // from inactive, and it must not be overridden.
  label: text.micro,
});
