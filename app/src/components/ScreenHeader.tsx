/**
 * The tab header: a title, a subtitle, and the three actions — pinned above
 * the scroller, never collapsing.
 *
 * ── WHY THIS IS NOT THE NATIVE LARGE TITLE ─────────────────────────────────
 *
 * `theme/header.ts` records that `headerLargeTitleEnabled` was tried and
 * reverted: the title stopped rendering at all, content was clipped on four of
 * six screens because a large title needs
 * `contentInsetAdjustmentBehavior="automatic"` on every consumer, and it wanted
 * a second background token. That verdict still stands.
 *
 * It also would not have matched. The design's header is `flex:none` above the
 * only scroller, so it is PINNED and never shrinks — a static bar that happens
 * to be 34pt, not iOS's collapsing large title. Reaching for the native one
 * would have cost three regressions to get further from the design.
 *
 * So this is an ordinary view the screen puts above its own list — but it is
 * now the design's translucent `--nav` over a real blur rather than an opaque
 * strip. `expo-blur` was not installed when this was written, and without a
 * blur a 0.86-alpha bar over scrolling content is just muddy; that is why it
 * painted `bg` and why this comment used to argue for it. The dependency is
 * there now, so the reason is gone.
 *
 * `visual-spec.md`'s "nothing floats" still holds and is not in tension with
 * this: a blurred bar is not floating ABOVE the page, it is the page seen
 * through frosted glass, and it is still held by a hairline rather than a
 * shadow.
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { useSession } from "../lib/session";
import { color } from "../theme/tokens";
import { layout, ruleWidth, space, target } from "../theme/space";
import { text } from "../theme/type";
import { dim } from "../theme/press";

/** The icon grid every glyph in this app is drawn on. */
/** The design's `blur(18px)`, in expo-blur's 0-100 scale. */
const BLUR = 18;

const GRID = 24;
const ICON = 23;

/**
 * Paths taken from the design. Drawn `fill="none"` and stroked, like the tab
 * bar's glyphs and `List`'s chevron, so the whole icon vocabulary is one voice.
 */
const GLYPH = {
  alerts:
    "M12 3.2a7 7 0 00-7 7v3.3l-1.4 2.6h16.8L19 13.5v-3.3a7 7 0 00-7-7ZM9.6 18.7a2.6 2.6 0 004.8 0",
  chat: "M4 5h16v11H9l-5 4z",
  settings:
    "M12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18",
} as const;

export type HeaderAction = {
  glyph: keyof typeof GLYPH;
  /** Spoken, and the only name this control has — there is no visible label. */
  label: string;
  onPress: () => void;
};

export type ScreenHeaderProps = {
  title: string;
  /**
   * The line under the title. A NODE, not a string, because Home's carries a
   * date and non-negotiable #2 requires that to arrive pre-formatted rather
   * than be derived here.
   */
  subtitle?: React.ReactNode;
  actions?: readonly HeaderAction[];
};

/**
 * The actions a tab header carries, in the design's order.
 *
 * Here rather than in each screen so the set cannot drift: eight copies of this
 * list is eight chances for one tab to lose the bell or order them differently.
 *
 * ── A COACH GETS TWO, NOT THREE ─────────────────────────────────────────────
 *
 * This was role-blind, and all three coach tabs render it, so a coach was shown
 * an "Ask RunGuard" button that opens the ATHLETE's chat: `getChat()` is
 * `/me`-shaped, and `request()` refuses an athlete route for a coach credential
 * before a packet leaves the phone. The design had already decided the answer —
 * its coach nav has Alerts and Settings and no chat (`:1850`) — and it is the
 * right one twice over: RunGuard's chat answers questions about YOUR training,
 * and a coach has no training here. Better not to offer the door than to open
 * it onto a 401.
 *
 * Alerts and Settings stay for both. Settings is now role-aware (it asks
 * `/coach/roster` rather than `/home`, which used to sign a coach out on the
 * first tap).
 */
export function useTabHeaderActions(): readonly HeaderAction[] {
  const router = useRouter();
  const { role } = useSession();
  const alerts: HeaderAction = {
    glyph: "alerts",
    label: "Alerts",
    onPress: () => router.push("/alerts"),
  };
  const settings: HeaderAction = {
    glyph: "settings",
    label: "Settings",
    onPress: () => router.push("/settings"),
  };
  if (role === "coach") return [alerts, settings];
  return [
    alerts,
    { glyph: "chat", label: "Ask RunGuard", onPress: () => router.push("/chat") },
    settings,
  ];
}

function ActionButton({ glyph, label, onPress }: HeaderAction) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space.sm}
      style={({ pressed }) => dim(pressed)}
    >
      <Svg width={ICON} height={ICON} viewBox={`0 0 ${GRID} ${GRID}`} fill="none">
        <Path
          d={GLYPH[glyph]}
          /*
           * `brandText`, never `brand`: the fill measures 2.01:1 and these are
           * glyphs. The design strokes them in its accent, which is the same
           * intent at a contrast the app has actually measured.
           */
          stroke={color.brandText}
          strokeWidth={(ruleWidth * GRID) / ICON}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

export function ScreenHeader({ title, subtitle, actions }: ScreenHeaderProps) {
  /*
   * No top inset here. Every screen that mounts this already wraps itself in a
   * `SafeAreaView edges={["top"]}`, so spending the inset again would push the
   * title a status bar's height down the page.
   */
  /*
   * `tint="default"` follows the system appearance on its own, so the blur does
   * not need a `useColorScheme()` of its own; the `nav` tint layered over it is
   * a `DynamicColorIOS` pair and adapts the same way.
   */
  return (
    <BlurView intensity={BLUR} tint="default" style={styles.bar}>
      {/*
       * The action row sits ABOVE the title and is right-aligned on its own
       * line, as the design draws it — not beside the title, where a 34pt line
       * and a 23pt glyph would have to agree on a baseline they do not share.
       */}
      {actions?.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <ActionButton key={a.glyph} {...a} />
          ))}
        </View>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  /**
   * The design's `--nav` over the blur — see the note at the top of this file.
   * The hairline is what separates it from the content scrolling beneath.
   */
  bar: {
    backgroundColor: color.nav,
    paddingHorizontal: layout.page,
    paddingBottom: space.sm,
    borderBottomWidth: ruleWidth,
    borderBottomColor: color.ruleSoft,
  },
  /** Right-aligned, on a row tall enough to be a real target. */
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: space.lg,
    minHeight: target.min,
  },
  /**
   * `largeTitle` keeps its `+0.4` tracking rather than the design's `-0.6px`:
   * `type.ts` records that as iOS's own value for a large title, and Archivo at
   * 34 is already tighter than SF Pro Display. See docs/design-port.md #4.
   */
  title: { ...text.largeTitle, color: color.ink },
  subtitle: { ...text.meta, color: color.muted, marginTop: space.xs },
});

export default ScreenHeader;
