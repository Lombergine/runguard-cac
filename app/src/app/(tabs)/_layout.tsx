/**
 * The tab bar. See ../../../../docs/visual-spec.md § "Components" → Nav.
 *
 * Home is first and default, because the check-in is the product and everything
 * else — charts, calendar, race history — is explicitly secondary.
 *
 * FIVE items, not the four the spec asks for. That line was written when the app
 * showed a subset of the athlete's data; it now mirrors the whole web portal,
 * whose seven tabs have to land somewhere, and burying Recovery and Stats behind
 * a header link would hide two of the five things an athlete opens the app for.
 * The calendar folded into Stats — which is where the website has always kept
 * it — so this is four of the spec's items plus one, not four plus two.
 * Recorded as a decision, on instruction, rather than left to read as drift.
 *
 * A COACH SEES THREE — Roster, Calendar, Sources — and none of the five. The
 * two sets are mutually exclusive, gated on `useSession().role`, because the
 * device holds one credential at a time and a tab an athlete cannot fetch is
 * worse than a tab that is not there.
 *
 * Three things this file is careful about:
 *
 *  1. White bar over the cream page, held up by the website's hairline
 *     (`ruleSoft`). NO SHADOW: it carried `shadow.card`, which the design's bar
 *     does not have, and `tokens.ts` says in as many words that a shadow is
 *     elevation and never emphasis. The bar is not elevated; it is the edge of
 *     the page, and a hairline is what says so.
 *  2. The active tab is the ember, because the ember is the brand — and it is
 *     ONE ember. The label and the glyph used to take `brandText` and
 *     `brandStrong` respectively, which drew a focused tab in two shades one
 *     step apart; the design uses a single `--accent` for both. Inactive stays
 *     `muted`, 5.16:1.
 *  3. Focus is not carried by colour alone. The glyph thickens (2.1 against
 *     1.6) and the label goes semibold, both from the design, so the current
 *     tab survives greyscale and glare. `visual-spec.md` §5: colour last.
 */
import { Tabs } from "expo-router";
import { ColorValue, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { useSession } from "../../lib/session";
import { ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, text } from "../../theme/type";

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
/** Training — a plotted line over a baseline. */
const RUNS = "M3.5 20.5 H20.5 M5 16.5 L10 10.5 L14 13.5 L20 5.5";
/**
 * Recovery — a crescent. Recovery is mostly what happened overnight (sleep, HRV,
 * resting HR), and a moon says that without the medical register a cross or a
 * heart would carry. Drawn as two arcs so it outlines at `ruleWidth` rather than
 * needing a fill.
 */
const RECOVERY = "M14.6 3.8 A8.6 8.6 0 1 0 14.6 20.2 A10.6 10.6 0 0 1 14.6 3.8 Z";
/**
 * Stats — three bars on a baseline. Deliberately bars where Training is a line:
 * the two tabs sit next to each other and must not read as the same glyph.
 */
const STATS = "M3.5 20.5 H20.5 M6.5 20.5 V13 M12 20.5 V6.5 M17.5 20.5 V10";
/** Races — a course flag. */
const RACES = "M6 3.5 V20.5 M6 5.5 H19 L16 9.5 L19 13.5 H6";

/**
 * The three coach glyphs, drawn on the same 24-unit grid at the same
 * `ruleWidth`, because a coach tab bar and an athlete tab bar are one interface
 * seen by two people and must not read as two products.
 */
/**
 * Roster — a table: a short left column of marks and a long right column of
 * names, three rows deep. Deliberately a TABLE rather than three stacked lines,
 * which would be a hamburger, and rather than a person, which would be an
 * avatar for a screen that lists fourteen of them. See visual-spec § "Coach
 * dashboard": the roster is a table, not a feed.
 */
const ROSTER = "M4 6.5 H6.5 M9.5 6.5 H20 M4 12 H6.5 M9.5 12 H20 M4 17.5 H6.5 M9.5 17.5 H20";
/**
 * Calendar — the month grid: a box, the header rule, and two hangers crossing
 * the top edge. The plainest possible reading of "the team calendar", and it
 * shares no shape with Stats' bars or Training's line.
 */
const CALENDAR = "M4.5 6 H19.5 V20.5 H4.5 Z M4.5 10.5 H19.5 M8.5 3.5 V8 M15.5 3.5 V8";
/**
 * Sources — an arrow arriving in a tray. Runs come IN from the athletes' phones;
 * the direction is the whole meaning, so the arrowhead points down into an open
 * box rather than out of one.
 */
const SOURCES = "M12 3.5 V13.8 M8.2 10 L12 13.8 L15.8 10 M4.5 16.5 V20.5 H19.5 V16.5";

/**
 * `size` is handed down by the navigator (25 in its uikit variant). Dividing
 * the grid by it keeps the rendered stroke at exactly `ruleWidth` pixels
 * whatever size the platform asks for.
 */
/**
 * The design's own stroke weights: 2.1 focused, 1.6 idle (`:1861`).
 *
 * WEIGHT, not just hue. The bar used one constant width and let colour alone
 * say which tab was current, which is the thing `visual-spec.md` §5 rules out —
 * "colour last", and never colour only. A thicker glyph and a heavier label
 * survive greyscale, glare and colour-blindness; the ember is the third cue,
 * not the only one.
 *
 * On the 24-unit grid these are absolute, so they are scaled by the rendered
 * size the navigator asks for rather than being written as device pixels.
 */
const STROKE_ON = 2.1;
const STROKE_OFF = 1.6;

function Glyph({
  d,
  stroke,
  size,
  weight,
}: {
  d: string;
  stroke: ColorValue;
  size: number;
  weight: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={(weight * GRID) / size}
        /* The design rounds both; the app's header glyphs already do. */
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * One tab's icon renderer.
 *
 * The glyph takes the tint the navigator hands down and nothing else. It used
 * to substitute `brandStrong` when focused, so a focused tab was drawn in two
 * different embers — the label in `brandText`, the icon a shade brighter. The
 * design uses one `--accent` for both (`:1860`), and two accents one step apart
 * read as a rendering mistake rather than a distinction.
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
      <Glyph
        d={d}
        stroke={tint}
        size={size}
        weight={focused ? STROKE_ON : STROKE_OFF}
      />
    );
  };
}

/**
 * Two tab bars, one navigator.
 *
 * `Tabs.Protected` is the same idiom as the `Stack.Protected` guards in the root
 * layout, and it carries the same warning: it is a DENY-LIST. A route file under
 * `(tabs)/` that is not named inside one of these groups is appended to the
 * navigator anyway (expo-router 57, `build/useScreens.js`), so it would appear
 * in BOTH tab bars. Every file must be declared below.
 *
 * The coach's three screens are declared here rather than in the root layout
 * because they are children of THIS navigator; the root gates the whole `(tabs)`
 * group, and this decides which five or three of it exist. Until the files
 * `roster.tsx`, `calendar.tsx` and `sources.tsx` land (a concurrent agent owns
 * them), expo-router logs `No route named "roster"` in dev and drops the entry —
 * a warning, not a crash, and the declaration is what makes them gated the
 * moment they arrive rather than visible to everyone.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { role } = useSession();
  const coach = role === "coach";

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
        /*
         * Rendered rather than styled, so the focused tab can take the design's
         * heavier cut. `tabBarLabelStyle` is a static style and cannot vary by
         * focus; this receives `{ focused, color, children }` per tab, so one
         * definition here covers all eight rather than eight `options` blocks.
         *
         * `color` is the navigator's own tint and is applied last — it is what
         * separates active from inactive and must not be overridden.
         */
        tabBarLabel: ({ focused, color: tint, children }) => (
          <Text
            style={[styles.label, focused ? styles.labelOn : null, { color: tint }]}
            numberOfLines={1}
          >
            {children}
          </Text>
        ),
        tabBarItemStyle: styles.item,
      }}
    >
      {/* The design's order and the design's names: Today · Training · Stats ·
          Recovery · Races (`ATHLETE_TABS`, RunGuard iOS App copy.dc.html:1227).
          Stats and Recovery were transposed, and tab one was called "Home"
          while the screen it opens is titled "Today" — the app disagreeing with
          itself about the name of its own front page. */}
      <Tabs.Protected guard={!coach}>
        <Tabs.Screen
          name="index"
          options={{
            title: "Today",
            // The name alone does not say what is there, and this is the tab
            // that matters. The rest are named after what they show.
            tabBarAccessibilityLabel: "Today, the daily check-in",
            tabBarIcon: tabIcon(HOME),
          }}
        />
        <Tabs.Screen
          name="runs"
          options={{
            // The route stays `runs`; the tab is Training, because it now carries
            // the week's plan as well as the runs already done.
            title: "Training",
            tabBarIcon: tabIcon(RUNS),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Stats",
            tabBarIcon: tabIcon(STATS),
          }}
        />
        <Tabs.Screen
          name="recovery"
          options={{
            title: "Recovery",
            tabBarIcon: tabIcon(RECOVERY),
          }}
        />
        <Tabs.Screen
          name="races"
          options={{
            title: "Races",
            tabBarIcon: tabIcon(RACES),
          }}
        />
      </Tabs.Protected>

      {/* Three, not five. A coach is triaging a squad, not checking in — none
          of the athlete tabs has an equivalent here, and the order is the order
          of the web dashboard's own nav. Roster is first and therefore the
          default: signed in as a coach, `index` is not in the navigator's
          `routeNames` at all, so "/" resolves to whichever screen is declared
          first below. */}
      <Tabs.Protected guard={coach}>
        <Tabs.Screen
          name="roster"
          options={{
            title: "Roster",
            tabBarAccessibilityLabel: "Roster, every athlete on the team",
            tabBarIcon: tabIcon(ROSTER),
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
          name="sources"
          options={{
            title: "Sources",
            tabBarIcon: tabIcon(SOURCES),
          }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: color.bg },
  bar: {
    backgroundColor: color.card,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
    /*
     * No shadow. It had `shadow.card`, and the design's bar has none — see the
     * docblock. `elevation: 0` is explicit because the navigator's own default
     * is 8 on Android, so removing the token alone would leave a shadow there.
     */
    elevation: 0,
  },
  /** Guarantees the 48px target even if the bar is ever shortened. */
  item: { minHeight: target.min },
  // No colour here: the tint the navigator passes is what separates active
  // from inactive, and it must not be overridden. The WEIGHT is ours — see
  // `tabBarLabelStyle` at the navigator, which swaps in `labelOn` when focused.
  label: text.micro,
  /** The design's 600 against 400 (`:1862`), so focus is not hue alone. */
  labelOn: { fontFamily: font.monoSemi },
});
