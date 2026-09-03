/**
 * InfoDot — a small circled "i" beside a stat label that reveals what the
 * number actually means and where it comes from.
 *
 * Ports `website/src/components/InfoDot.tsx`, with one structural change that
 * the platform forces and one that the spec forces.
 *
 * ── THE PLATFORM CHANGE: THERE IS NO HOVER ────────────────────────────────
 * The web version opens on `onMouseEnter` *and* on click. A phone has no
 * pointer, so hover is not a degraded affordance here — it is an absent one,
 * exactly like the native `title` attribute `(tabs)/stats.tsx` already refused
 * to port for the HR-zone legend. So this is a tap-toggle, and the tap target
 * is a real `target.min` square even though the dot is drawn at `space.lg`:
 * the 14px web hit area is a mouse target and would be unusable at 6am with
 * cold hands. The dot's DRAWN size is unchanged, so the label row it sits in
 * keeps its height — `hitSlop` grows the touch area, not the layout.
 *
 * ── THE SPEC CHANGE: IT IS AN EXPLAINER, NOT AN ALERT ─────────────────────
 * § "Nothing shouts". The dot is a `rule` hairline around `card` with a
 * `muted` glyph, and the panel it opens is an ordinary card: no fill, no
 * accent, no shadow beyond the one every card carries. Nothing here is a
 * verdict about the athlete, so nothing here wears a status colour.
 *
 * ── WHY A MODAL, AND NOT AN ABSOLUTELY-POSITIONED SIBLING ─────────────────
 * The web tooltip is `position: absolute` inside the tile, which works because
 * a browser paints outside an overflow-visible box. In React Native the same
 * approach fails twice over: an absolute child is laid out inside its parent's
 * coordinate space, so a tooltip on the right-hand tile of a two-up grid runs
 * off the screen edge with no way to know it has, and Android clips children
 * to a rounded parent. `Modal` sidesteps both — it renders into its own
 * full-screen root, above every card, above the tab bar, clipped by nothing —
 * and the tooltip is then placed from the dot's WINDOW coordinates
 * (`measureInWindow`) and clamped to the screen. See `place()` below.
 *
 * It also settles "only one open at a time" without a store: while a modal is
 * up, its full-bleed overlay is the only thing that can receive a touch, so a
 * second dot is physically unreachable until the first closes. The state stays
 * local to one component and no dot has to know another exists.
 */
import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { layout, minWidth, radius, ruleWidth, space, target } from "../theme/space";
import { Press } from "./Press";
import { color, shadow } from "../theme/tokens";
import { font, text } from "../theme/type";

/** The dot's drawn diameter. Must stay ≤ `text.micro.lineHeight` (16) so that
 *  adding one to a label row cannot change the row's height. */
const DOT = space.lg;

/** Grows the 16px dot to a real 48px target without moving anything. */
const SLOP = (target.min - DOT) / 2;

/**
 * The panel is as wide as the page's content column at the narrowest supported
 * screen — 360 less both page insets. Derived rather than picked, so it cannot
 * drift from `layout.page`, and it is by construction the widest thing that
 * fits at the 360px floor.
 */
const PANEL_W = minWidth - layout.page * 2;

/** Kept off the screen edges by the same inset the page uses. */
const EDGE = layout.page;

/** The dot's window rectangle, captured at the moment of the tap. */
type Anchor = { x: number; y: number; width: number; height: number };

export function InfoDot({ label, text: explainer }: InfoDotProps) {
  /**
   * ONE piece of state, and it is the anchor rather than a boolean: the panel
   * cannot be open without the measurement it needs to be placed, because the
   * measurement IS the open state.
   */
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const dot = useRef<View>(null);
  const screen = useWindowDimensions();

  const toggle = () => {
    if (anchor) {
      setAnchor(null);
      return;
    }
    // Window coordinates, not parent-relative — the panel is placed in the
    // modal's own root, which shares the window's origin.
    dot.current?.measureInWindow((x, y, width, height) =>
      setAnchor({ x, y, width, height }),
    );
  };

  return (
    <>
      <Press
        ref={dot}
        onPress={toggle}
        hitSlop={SLOP}
        accessibilityRole="button"
        /* The website's exact form (InfoDot.tsx:35). The label is the tile's,
           so the question names the figure the reader is looking at. */
        accessibilityLabel={`What is ${label}?`}
        /* The spec's `aria-expanded` on disclosures, in its RN spelling. */
        accessibilityState={{ expanded: anchor !== null }}
        style={styles.dot}
        haptic="none"
      >
        <Text style={styles.glyph}>i</Text>
      </Press>

      <Modal
        visible={anchor !== null}
        transparent
        /* No entrance animation: § "Quality floor" asks for reduced motion to
           be respected, and an explainer that must be read has nothing to gain
           from arriving slowly. */
        animationType="none"
        /* Android renders a modal below the status bar by default, which would
           shift the modal's origin away from the window origin `measureInWindow`
           reported and put the panel that many pixels too low. */
        statusBarTranslucent
        /* The Android back button. */
        onRequestClose={() => setAnchor(null)}
      >
        {/* Full-bleed and invisible: no scrim. A scrim would dim the tile the
            reader is asking about, and dimming the screen for a definition is
            the "modal, interstitial" weight § "Per-run spike warning" rules
            out. Its only job is to catch the next tap, anywhere. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setAnchor(null)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {anchor ? (
          <Panel anchor={anchor} screen={screen} label={label} text={explainer} />
        ) : null}
      </Modal>
    </>
  );
}

export type InfoDotProps = {
  /** The tile's own label. Used verbatim in "What is {label}?". */
  label: string;
  /** The explainer. One of `EXPLAINERS` — see the note on it. */
  text: string;
};

/**
 * The card itself, placed. Split out only so `place()` can be called with a
 * non-null anchor, without an escape hatch in the JSX above.
 */
function Panel({
  anchor,
  screen,
  label,
  text: explainer,
}: {
  anchor: Anchor;
  screen: { width: number; height: number };
  label: string;
  text: string;
}) {
  const at = place(anchor, screen);
  return (
    <View
      style={[styles.panel, at.box]}
      /* One announcement, so the whole explainer is read as one thing. */
      accessible
      accessibilityLabel={`${label}. ${explainer}`}
    >
      {/*
        The cap only bites at a large Dynamic Type setting, where a five-line
        explainer becomes a twelve-line one. Scrolling is the only answer that
        neither clips the sentence nor lets it run off the screen — and it sits
        on the SCROLLER rather than on the card, so the card is exactly as tall
        as what fits inside it. A `maxHeight` on the card instead would leave
        the scroller with no height of its own to shrink into.
      */}
      <ScrollView style={{ maxHeight: at.room }}>
        <Text style={styles.body}>{explainer}</Text>
      </ScrollView>
    </View>
  );
}

/**
 * Where the panel goes.
 *
 * HORIZONTALLY it wants to be centred under the dot and is then clamped into
 * the screen, so it can never run off either edge. At the 360px floor the
 * panel is exactly the content column, so both clamps land on the same value
 * and the panel simply spans the page — which is what happens to the RIGHT-HAND
 * tile of a two-up grid: its dot sits at roughly x=205, the centred position
 * would want to start at x=45, and the right clamp pulls it back to the page
 * inset. The panel is then left-aligned with the page rather than with its dot.
 * That is the correct trade: the alternative is a panel that is either narrower
 * than the sentence needs or partly off-screen.
 *
 * VERTICALLY it takes whichever side of the dot has more room, so a tile near
 * the bottom of a long scroll opens upward instead of off-screen. `room` is
 * what is left of that side once the card's own padding is taken out, and it
 * becomes the scroller's `maxHeight`.
 */
function place(
  a: Anchor,
  screen: { width: number; height: number },
): { box: { left: number; width: number; top?: number; bottom?: number }; room: number } {
  const width = Math.min(PANEL_W, screen.width - EDGE * 2);
  const wanted = a.x + a.width / 2 - width / 2;
  const left = Math.max(EDGE, Math.min(wanted, screen.width - width - EDGE));

  const below = screen.height - (a.y + a.height) - space.sm - EDGE;
  const above = a.y - space.sm - EDGE;
  const chrome = layout.cardPadding * 2 + ruleWidth * 2;

  return below >= above
    ? {
        box: { left, width, top: a.y + a.height + space.sm },
        room: below - chrome,
      }
    : {
        box: { left, width, bottom: screen.height - a.y + space.sm },
        room: above - chrome,
      };
}

/* ------------------------------------------------------------------ *
 * The copy
 * ------------------------------------------------------------------ */

/**
 * The explainers, ported CHARACTER FOR CHARACTER from the `info=` props on the
 * website's Home, Stats and Recovery tabs, with the source beside each.
 *
 * They live here, in one object, rather than inline on the two screens that
 * use them, for one reason: this is duplicated prose, and duplicated prose
 * drifts. Kept together it can be diffed against the website in a single pass —
 * `grep -n 'info="' website/src/components/athlete/tabs.tsx` prints the other
 * copy in the same order — and a reworded sentence on the portal shows up as a
 * one-line diff here rather than being lost in a screen four hundred lines
 * long.
 *
 * WHAT MUST NOT BE "IMPROVED" WHEN EDITING THESE. Several carry a caveat that
 * is the entire reason the dot exists, and each is the kind of sentence a
 * summariser deletes first:
 *
 *   - TRIMP counts runs synced without heart-rate data as ZERO. Without that
 *     line a week of strapless running reads as a week of no training.
 *   - HRV is compared against the athlete's OWN baseline and nobody else's, so
 *     only the % change means anything. This is the line that stops a figure
 *     with no units anyone knows from becoming a number to compare with
 *     teammates — the same social-comparison pressure `(tabs)/stats.tsx`
 *     removed the peer percentiles for.
 *   - Body battery is NOT fitness: "you can be very fit and very tired".
 *   - The streak is "a record of consistency, not a target to chase".
 *
 * ONE STRING DIVERGES FROM THE WEBSITE, and it is `sleep7d` — see its note.
 */
export const EXPLAINERS = {
  /* ── Home ───────────────────────────────────────────────────────────── */

  /**
   * The one number this app is really about, and until now the only one on the
   * hero with nothing behind it.
   *
   * Two clauses are load-bearing and must survive any edit:
   *
   *   - "adjusted down for soreness you reported" is what makes the check-in
   *     worth filling in honestly. An athlete who cannot see that their own
   *     report moves the number has no reason to believe it does.
   *   - "It is not a fitness score" separates it from `fitnessScore` below,
   *     which is the confusion this screen invites by showing one large 0–100
   *     figure — the same distinction `bodyBattery` has to make.
   *
   * Matches the web home tile (website/src/components/athlete/tabs.tsx,
   * BentoTile label="Readiness").
   */
  readiness:
    "0–100, built from your sleep, HRV and resting heart rate against your own baselines, then adjusted down for soreness you reported. It answers one question: how ready are you to absorb hard work today. Under 40 means back off; 65 and up means you're clear to run it as written. It is not a fitness score — you can be very fit and very flat.",

  /* ── Stats ──────────────────────────────────────────────────────────── */

  /** tabs.tsx:448 — verbatim. */
  fitnessScore:
    "0–100, from your most recent week with real running in it: 55% your VO₂max reading, 45% your distance-weighted pace (about 11:15/mi scores 0, 5:20/mi scores 100). Trend compares this week against the average of the last four.",

  /** tabs.tsx:454 — verbatim. */
  vo2max:
    "Apple's Cardio Fitness estimate, read straight from Health — RunGuard doesn't calculate this one. It feeds into your fitness score.",

  /** tabs.tsx:460 — verbatim. */
  weekTrimp:
    "Training impulse over the last 7 days — how long each run was, weighted sharply upward by how hard your heart was working. Two runs the same distance can score very differently. Runs synced without heart-rate data count as zero.",

  /** tabs.tsx:466 — verbatim. */
  sevenDayMi:
    "Distance over the last 7 days — a rolling window, not since Monday. The target is your weekly-distance goal if you've set one; otherwise it's a placeholder just above your current week.",

  /** tabs.tsx:471 — verbatim. */
  longestStreak:
    "The most days in a row you trained without a rest day, over the last 120 days. Earns the 7-Day Streak badge at 7 — it's a record of consistency, not a target to chase.",

  /* ── Recovery ───────────────────────────────────────────────────────── */

  /**
   * tabs.tsx:581 — THE ONE CHANGED STRING.
   *
   * The website reads "Under 7 h turns amber", describing the per-stat colour
   * it applies at that threshold (tabs.tsx:580). This app deliberately does not
   * port that colour — see divergence 3 in the header of `(tabs)/recovery.tsx`:
   * colour alone carrying a meaning has no shape and no label behind it, so it
   * does not survive greyscale, glare or colour-blindness. Nothing on this
   * screen turns amber, so the clause describes a thing that is not there, and
   * an explainer that misdescribes the screen it is attached to is worse than
   * no explainer.
   *
   * "turns amber" is replaced with "is low", which keeps the 7 h threshold and
   * the whole of the claim after the dash untouched. Nothing else is altered.
   */
  sleep7d:
    "Your average hours asleep over the last 7 nights, from Apple Health. Under 7 h is low — short sleep is one of the strongest injury and illness signals there is.",

  /** tabs.tsx:588 — verbatim. */
  hrv:
    "Heart rate variability — the tiny timing differences between heartbeats. Higher usually means recovered; a drop means your body is still under stress. Compared against your own baseline, not anyone else's, so only the % change matters.",

  /** tabs.tsx:595 — verbatim. */
  restingHr:
    "Your heart rate at rest, versus your normal. Sitting 5+ bpm above baseline usually means fatigue, a bug coming on, or not enough recovery — it's an early warning, often before you feel it.",

  /** tabs.tsx:601 — verbatim. */
  bodyBattery:
    "How fresh your legs are: how far this week's training sits below what your body is used to. High after an easy week or a taper, low mid-block. Not the same as fitness — you can be very fit and very tired.",

  /** tabs.tsx:607 — verbatim. */
  sleepConsistency:
    "How steady your sleep length is night to night, scored 0–100 from the swing across the last 7 nights. Same amount every night scores high; 5 h then 10 h scores low even if the average looks fine.",
} as const;

const styles = StyleSheet.create({
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: ruleWidth,
    borderColor: color.rule,
    backgroundColor: color.card,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * A lowercase "i", so it reads as the universal glyph rather than as a
   * capital I. Body semibold, not mono: mono is this app's numeral typeface and
   * this is a letter. `lineHeight` is pinned to the circle's inner height
   * because a default line box at this size is taller than the circle and
   * Android clips a text child to a rounded parent.
   */
  glyph: {
    fontFamily: font.bodySemi,
    fontSize: text.micro.fontSize,
    lineHeight: DOT - ruleWidth * 2,
    includeFontPadding: false,
    textAlign: "center",
    color: color.muted,
  },
  /** An ordinary card. Same tokens as <Card/>, so it cannot drift from one. */
  panel: {
    position: "absolute",
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.ruleSoft,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    ...shadow.card,
  },
  /**
   * Sentence case, body face, `ink2` — prose, at the size every other
   * explanatory line in the app is set at. Deliberately NOT `micro`, which is
   * the mono label face: this is something to read, not a caption.
   */
  body: { ...text.meta, color: color.ink2 },
});

export default InfoDot;
