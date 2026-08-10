/**
 * The tab bar. See ../../../../docs/visual-spec.md § "Components" → Nav.
 *
 * Four items, Home first and default, because the check-in is the product and
 * everything else — charts, calendar, race history — is explicitly secondary.
 *
 * Three things this file is careful about:
 *
 *  1. Nothing floats. React Navigation's bar ships `elevation: 8` and a
 *     hairline top border in the theme's border colour; both are overridden so
 *     the bar is separated from the page by the same 1.5px rule as every card.
 *     Hairlines vanish in sunlight, which is the whole reason the rule is 1.5.
 *  2. Colour is rationed. The active tint is the one accent; inactive is
 *     `muted`, a grey — so the bar spends exactly one of the screen's three
 *     permitted colours.
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
import { color } from "../../theme/tokens";
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

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        // Screens own their own headers; a navigator header would be a second
        // voice on top of the check-in.
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: color.accent,
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
          tabBarIcon: ({ color: tint, size }) => (
            <Glyph d={HOME} stroke={tint} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="runs"
        options={{
          title: "Runs",
          tabBarIcon: ({ color: tint, size }) => (
            <Glyph d={RUNS} stroke={tint} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color: tint, size }) => (
            <Glyph d={CALENDAR} stroke={tint} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="races"
        options={{
          title: "Races",
          tabBarIcon: ({ color: tint, size }) => (
            <Glyph d={RACES} stroke={tint} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: color.bg },
  bar: {
    backgroundColor: color.card,
    // Replaces the navigator's hairline, which is invisible outdoors.
    borderTopWidth: ruleWidth,
    borderTopColor: color.rule,
    // The navigator's default is 8. Nothing in this app floats.
    elevation: 0,
  },
  /** Guarantees the 48px target even if the bar is ever shortened. */
  item: { minHeight: target.min },
  // No colour here: the tint the navigator passes is what separates active
  // from inactive, and it must not be overridden.
  label: text.micro,
});
