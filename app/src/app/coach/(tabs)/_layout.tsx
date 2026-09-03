/**
 * The coach's tab bar.
 *
 * THREE items, matching the website's coach nav exactly — Roster, Training
 * calendar, Data sources. That is the whole coach surface, so the app's bottom
 * bar and the site's top nav name the same three places, and a coach who learns
 * one already knows the other.
 *
 * It is a SEPARATE bar from the athlete's five-item one, not a mode on it. The
 * two navigate different data behind different credentials, and a shared bar
 * whose contents depend on which session is live is one wrong branch away from
 * showing a coach an athlete's check-in, or an athlete the roster.
 *
 * Everything visual here is lifted from `(tabs)/_layout.tsx` deliberately, so
 * the two bars are the same object with different contents:
 *
 *  1. White bar over the cream page, held up by the website's hairline
 *     (`ruleSoft`) at the app's 1.5px width, floating on the one elevation
 *     token. Nothing hand-rolled.
 *  2. The active tab is the ember, landing twice in two NON-interchangeable
 *     values: the label is a glyph and takes `brandText` (5.21:1 on the white
 *     bar), the icon is a shape and takes `brandStrong` (3.19:1, over the 3:1
 *     floor for a drawn element, where the `brand` fill would be 2.01:1 and
 *     invisible outdoors). Inactive stays `muted` at 5.16:1.
 *  3. Glyphs are stroked at `ruleWidth` DEVICE pixels exactly — the grid is
 *     scaled out of the stroke width — so a tab icon and a card border are the
 *     same line. A printed key, not a widget.
 */
import { Tabs } from "expo-router";
import { ColorValue, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { ruleWidth, space, target } from "../../../theme/space";
import { selected } from "../../../lib/motion";
import { color } from "../../../theme/tokens";
import { font, text } from "../../../theme/type";

/** One tap target plus a gap, matching the athlete bar. */
const BAR_HEIGHT = target.min + space.md;

/** Coordinate grid the glyphs are drawn on. Never a rendered size. */
const GRID = 24;

/**
 * Dashboard — four panes. The overview is a set of team-level readings sitting
 * side by side, and a chart glyph would promise one chart; a grid says "several
 * things about the squad at once", which is what the tab actually is.
 */
const DASHBOARD =
  "M4.5 4.5 H11 V11 H4.5 Z M13 4.5 H19.5 V11 H13 Z M4.5 13 H11 V19.5 H4.5 Z M13 13 H19.5 V19.5 H13 Z";
/**
 * Roster — three stacked rows. The roster IS a table, not a feed (visual-spec
 * § "Coach dashboard"), and the glyph says list rather than people: a crowd
 * icon would promise faces, and this product shows initials, never photographs
 * of minors.
 */
const ROSTER = "M3.5 6.5 H20.5 M3.5 12 H20.5 M3.5 17.5 H20.5";
/**
 * Calendar — a month grid. Deliberately not the athlete Training tab's plotted
 * line: that tab shows what HAPPENED, this one is where a coach writes what
 * WILL happen, and the two must not read as the same idea.
 */
const CALENDAR =
  "M4.5 6.5 H19.5 V19.5 H4.5 Z M4.5 10.5 H19.5 M9 4.5 V8 M15 4.5 V8";
/**
 * Athletes — two figures. The management tab is about PEOPLE joining and
 * leaving, which is the one place in this product where a person icon is
 * honest: it names membership, not a face. The roster's glyph stays a list,
 * because that tab is a table of readings.
 */
const ATHLETES =
  "M9 10.5 a2.6 2.6 0 1 0 0-5.2 a2.6 2.6 0 0 0 0 5.2 M4.5 19 c0-2.8 2-4.6 4.5-4.6 s4.5 1.8 4.5 4.6 M16 6.2 a2.2 2.2 0 1 1 0 4.4 M15.5 14.6 c2.2 .2 4 2 4 4.4";
/**
 * Data sources — a watch. The only live source is Apple Health arriving off a
 * wrist, so the glyph names the device rather than an abstract plug.
 */
const SOURCES =
  "M8.5 8.5 H15.5 V15.5 H8.5 Z M10 8.5 V5.5 H14 V8.5 M10 15.5 V18.5 H14 V15.5";

/**
 * `size` is handed down by the navigator (25 in its uikit variant). Dividing
 * the grid by it keeps the rendered stroke at exactly `ruleWidth` pixels
 * whatever size the platform asks for.
 */
function Glyph({ d, stroke, size }: { d: string; stroke: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={(ruleWidth * GRID) / size}
        strokeLinecap="round"
        strokeLinejoin="round"
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
    return <Glyph d={d} stroke={focused ? color.brandStrong : tint} size={size} />;
  };
}

export default function CoachTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      /* The tab change is felt as well as seen — the one haptic both Whoop
         and Strava fire, and the cheapest cue that the app is native. */
      screenListeners={{ tabPress: () => selected() }}
      screenOptions={{
        // Screens own their own headers; a navigator header would be a second
        // voice over the roster's own.
        headerShown: false,
        sceneStyle: styles.scene,
        // A glyph colour: the navigator paints the LABEL with this. The icon
        // overrides it in tabIcon().
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: [styles.bar, { height: BAR_HEIGHT + insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      {/*
        Dashboard first, Roster second. The overview answers "is anything wrong
        today", which is the question a coach opens the app with; the roster
        answers "who do I open", which is what they do about it. Ordering them
        the other way put the fourteen-row table in front of the summary and
        pushed every team number below the fold — the reason these were split.
      */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarAccessibilityLabel: "Dashboard, how the squad is doing",
          tabBarIcon: tabIcon(DASHBOARD),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Roster",
          tabBarAccessibilityLabel: "Roster, who needs a look before practice",
          tabBarIcon: tabIcon(ROSTER),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Calendar",
          tabBarAccessibilityLabel: "Training calendar",
          tabBarIcon: tabIcon(CALENDAR),
        }}
      />
      <Tabs.Screen
        name="athletes"
        options={{
          title: "Athletes",
          tabBarAccessibilityLabel: "Athletes, who is on the roster and how they join",
          tabBarIcon: tabIcon(ATHLETES),
        }}
      />
      <Tabs.Screen
        name="sources"
        options={{
          title: "Sources",
          tabBarAccessibilityLabel: "Data sources, where each athlete's data comes from",
          tabBarIcon: tabIcon(SOURCES),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: color.bg },
  bar: {
    backgroundColor: color.bg,
    borderTopWidth: ruleWidth,
    borderTopColor: color.rule,
  },
  /** Guarantees the 48px target even if the bar is ever shortened. */
  item: { minHeight: target.min },
  // No colour here: the tint the navigator passes is what separates active from
  // inactive, and it must not be overridden.
  /*
    `text.micro` verbatim, minus most of its tracking.

    micro carries 0.12em of letter-spacing, which is right for a label sitting
    alone above a figure and wrong for five words sharing the width of a phone:
    at nine characters "DASHBOARD" rendered as "DASHBOA…". The size and the
    face stay the same so the bar still reads as the same family; only the
    tracking gives way, because it is the part that was buying nothing here.
  */
  label: { ...text.meta, fontFamily: font.bodySemi, fontSize: 11, lineHeight: 14 },
});
