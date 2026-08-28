/**
 * The Panel. One titled surface, used by every screen in the app.
 *
 * Ported from the website's own Panel
 * (website/src/components/athlete/tabs.tsx:22): a semibold title on the LEFT, a
 * muted note on the RIGHT, then the content. The note is the caveat, the unit,
 * or the instruction — never decoration.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * It did not, and the cost was visible on every screen. Nine files spelled this
 * shape out by hand from the same tokens, each citing `tabs.tsx:22` as its
 * authority — and they had drifted into THREE different title sizes:
 *
 *   text.meta + bodySemi  14px    profile, chat, settings, login, signup,
 *                                 AddRaceForm, LogResultForm
 *   text.baseSemi         16.5px  stats, YearGrid, and five charts
 *   text.title            19px    home, CheckInCard, TodayBlock, WeekProgress,
 *                                 PrTable, races, connect, BodyScan, two charts
 *
 * The website has exactly one (`text-sm font-semibold`, 14px), so at most one of
 * the three could have been the port. `profile.tsx:97` had already recorded the
 * duplication in a comment — "Neither file owns a shared component" — which is
 * the drift documenting itself and then continuing.
 *
 * THE TITLE SIZE HERE IS `text.meta` + `bodySemi`, the 14px reading. It is the
 * website's value, it is what the majority of the hand-written copies used, and
 * it is the one that keeps a panel title subordinate to the screen's real
 * heading. The 19px reading made a panel title compete with the check-in
 * prompt, which is the one thing on the home screen that is allowed to be loud.
 *
 * The surface comes from `Card`, so a panel cannot drift from a card either.
 */
import { View, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { Card } from "./Card";
import { color } from "../theme/tokens";
import { layout, space } from "../theme/space";
import { font, text } from "../theme/type";

export type PanelProps = {
  /** Left of the head. Sentence case, not a shout. */
  title: string;
  /**
   * Right of the head, muted. The caveat, the unit, or the instruction.
   *
   * A NODE, not a string, because a note frequently carries figures and every
   * numeral in this app has to be mono and tabular. Callers pass nested `Text`
   * spans for those — see `WeekProgress`'s "4.2 mi of 42.3 mi target", where
   * each figure is its own node so the unit stays welded to it (non-negotiable
   * #3) and only the numerals change face.
   *
   * Where it carries a date it must already be a pre-formatted LOCAL string —
   * non-negotiable #2. This component never derives one.
   */
  note?: React.ReactNode;
  children: React.ReactNode;
  /**
   * `false` for a panel whose content is a full-bleed list of divided rows.
   *
   * The rows then run edge to edge and draw their own dividers corner to
   * corner, the way `PrTable` and the race history do, instead of stopping
   * 16pt short on each side. The HEAD keeps its padding either way — a title
   * flush against the card's border would be the only unpadded text in the app.
   */
  padded?: boolean;
  /** Layout only, merged last. See `CardProps.style`. */
  style?: StyleProp<ViewStyle>;
};

export function Panel({ title, note, children, padded = true, style }: PanelProps) {
  return (
    <Card padded={padded} style={[styles.panel, style]}>
      <View style={[styles.head, !padded && styles.headInset]}>
        {/*
          A panel title IS a heading, so VoiceOver's rotor can jump between
          them. Only `privacy.tsx` set this before — a long legal document is
          where skipping between sections is most obviously needed — but the
          semantics are the same on every screen, and having it here means no
          future panel can forget it.
        */}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  /**
   * `gap` on the panel rather than a margin under the head, which is what the
   * hand-written copies did — it spaces every child, so a panel holding three
   * rows does not need each row to carry its own top margin.
   *
   * 12, the website's `mb-3`. The copies had drifted to 12 (profile) and 8
   * (chat); 12 is the ported value and the one that reads at arm's length.
   */
  panel: { gap: space.md },
  /**
   * `alignItems: "baseline"` so the title and its note sit on one line even at
   * different sizes, and `flexWrap` so a long note drops to its own line rather
   * than crushing the title — both are the website's flex rules.
   */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  /**
   * Restores the head's own padding when the CARD has none, so an unpadded
   * panel still reads as "title, then rows" rather than as text jammed into a
   * corner. Horizontal only: the card's `gap` already spaces the head from the
   * first row, and a top inset here would double it.
   */
  headInset: {
    paddingTop: layout.cardPadding,
    paddingHorizontal: layout.cardPadding,
  },
  title: { ...text.meta, fontFamily: font.bodySemi, color: color.ink },
  /**
   * The caveat. Always the right-hand side, always muted (5.16:1 on card).
   * `flexShrink` so a long note gives way to the title instead of pushing it.
   */
  note: { ...text.meta, color: color.muted, flexShrink: 1 },
});

export default Panel;
