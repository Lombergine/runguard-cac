/**
 * The body scan — the read-only half of the body map, plus the legend that
 * makes it readable. Mirrors the website's `AthleteModel`
 * (website/src/components/athlete/AthleteModel.tsx) in WHAT IT SAYS and in
 * nothing else.
 *
 * WHAT IS PORTED: which data becomes which mark, and in which tone. Unresolved
 * injuries are the top tone at full weight (AthleteModel.tsx:31-48); soreness
 * is banded ≥7 / ≥4 / below; a lateral part stored with no side lights BOTH
 * sides (AthleteModel.tsx:100-106); the header counts flagged areas
 * (AthleteModel.tsx:285).
 *
 * WHAT IS NOT PORTED: the presentation, all of it. The website stages this on a
 * rotating holographic pedestal with an 8s sway, a bob, breathing glows, ping
 * rings and a scanning ellipse sweeping the body top to bottom. That is a
 * marketing surface. ../../../docs/visual-spec.md § Imagery asks for "one good
 * illustration, drawn flatly in the same line weight as the icons, like a
 * printed anatomy key rather than a rendered figure", and § "Status and
 * advisory" — "Nothing shouts" — rules out the rest. The figure here is drawn
 * at `ruleWidth`, flat, still.
 *
 * THE LEGEND IS NOT DECORATION. The website's only way to identify a dot is a
 * native `title` tooltip, which does not exist on a touch device: on a phone
 * those marks are unidentifiable and unreachable by a screen reader. So every
 * flagged area is spelled out here as text, the figure carries one summary
 * label covering all of them, and the individual marks are not accessibility
 * nodes at all.
 *
 * NO SIDE-PARSER LIVES HERE. `parseStoredPart` in lib/bodyParts owns reading a
 * stored string — it regenerates every label `sorenessLabel` ("left shin") and
 * `injuryLabel` ("shin (left)") can produce and compares, so the reader cannot
 * drift from the writer. This file used to hold a private copy of that loop,
 * which is how the app came to show `Hip / IT band (left)` here and `hip (left)`
 * on Profile for the same injury; both surfaces now go through the one function.
 * A string that matches neither format is still counted and still named — see
 * `unplaced`. Losing a flagged area silently is worse than admitting the diagram
 * cannot place it.
 *
 * NO CARD OF ITS OWN: this is a section, and the screen that composes it owns
 * the surface it sits on.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE DESIGN'S ROW, AND WHAT THE GLYPH ALREADY WAS
 *
 * The design study draws each flagged area as a list row — a severity glyph, a
 * 17px label, a tabular meta figure — divided by a separator inset from the
 * left, with a tinted action row under the group.
 *
 * ITS GLYPH IS ALREADY WHAT SHIPS, exactly, and not by coincidence: the design's
 * 18×18 rect at radius 6, `0.45 + severity/10 * 0.55` fill opacity (1 for an
 * injury), a core of `3 + severity/10 * 4`, stroked at 3 for an injury and 1.5
 * otherwise, and the crit ≥7 / mid ≥4 / warn banding, are `Mark` in
 * `BodyMap.tsx` line for line. `MarkSwatch` draws the legend with that same
 * function, so the key cannot drift from the marks it explains. Nothing about
 * the glyph is restated here.
 *
 * It survives greyscale, which is the test that matters (§ "Status and
 * advisory": shape carries the meaning). Desaturate a row and three channels
 * still separate the states — an injury is a DIAMOND core on a double-weight
 * outline, a severe soreness is a large dense disc, a mild one a small faint
 * disc. Colour repeats what the drawing has already said; it is never the only
 * difference.
 *
 * WHAT CHANGED IS THE CHROME AROUND IT. The rows were an 8pt-gapped stack
 * inside a padded panel; they are now full-bleed divided rows (`padded={false}`,
 * the shape `PrTable` and `ProfilePanels` already use), at the design's row
 * metrics rounded onto the app's 4px scale — 12/16 for the design's 13/16 — and
 * with the app's `ruleWidth` separator rather than the design's 0.5px hairline
 * (docs/design-port.md #7: a line that has to survive sunlight on a track needs
 * more than a hairline). The separator is inset from the left and full-bleed
 * right, positioned the way `ListRow` does it, because a border cannot be inset.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { BodyMap, MarkSwatch } from "./BodyMap";
import { Panel } from "./Panel";
import { parseStoredPart } from "../lib/bodyParts";
import { BodyMark, Injury, SorenessEntry } from "../lib/types";
import { dim } from "../theme/press";
import { layout, ruleWidth, space, target } from "../theme/space";
import { color } from "../theme/tokens";
import { font, text } from "../theme/type";

export type BodyScanProps = {
  /** Every logged injury. Resolved ones are filtered out here. */
  injuries: Injury[] | undefined;
  /** Today's self-reported soreness. */
  soreness: SorenessEntry[];
};

/** The scale every soreness figure is reported on. */
const MAX_SEVERITY = 10;

/**
 * The action row's disclosure chevron.
 *
 * Same 24-unit grid, same path and same `ruleWidth` stroke as `List`'s — the
 * icon vocabulary is one system or it is noise — drawn at the design's 18
 * rather than that file's 20, and tinted with the label rather than left grey,
 * because here the arrow and the word are one tinted object. `List` does not
 * export its copy; if it ever does, delete this one rather than keep both.
 */
const GRID = 24;
const CHEVRON_SIZE = 18;
const CHEVRON = "M9.5 5.5 L16 12 L9.5 18.5";

function Chevron() {
  return (
    <Svg width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox={`0 0 ${GRID} ${GRID}`}>
      <Path
        d={CHEVRON}
        fill="none"
        stroke={color.brandText}
        strokeWidth={(ruleWidth * GRID) / CHEVRON_SIZE}
      />
    </Svg>
  );
}

/** One flagged area, already resolved to a spot on the figure. */
type Row = {
  /** e.g. "Hip / IT band (left)". */
  label: string;
  mark: BodyMark;
};

/**
 * A stored string becomes one row per lit side. "both", and a lateral part
 * stored with no side at all, become two.
 *
 * `parseStoredPart` accepts EITHER stored format, where this used to be handed
 * the one formatter matching the row's table. That is strictly a widening —
 * checked by generating all 77 strings the two formatters can produce and
 * comparing: no string resolves to a different part or side than before, and 61
 * that the row's own formatter would have rejected now resolve. So a soreness
 * row that somehow holds "shin (left)" is placed on the figure instead of
 * falling through to `unplaced`, and nothing that used to be placed moves.
 */
function rowsFor(
  raw: string,
  kind: BodyMark["kind"],
  severity: number | undefined,
): Row[] | null {
  const found = parseStoredPart(raw);
  if (!found) return null;

  const { part, side } = found;
  const sides: BodyMark["side"][] = !part.lateral
    ? [null]
    : side === "left" || side === "right"
      ? [side]
      : ["left", "right"];

  return sides.map((s) => ({
    label: s ? `${part.label} (${s})` : part.label,
    mark: { key: part.key, side: s, kind, severity },
  }));
}

/** What the screen reader hears for one row. */
function describe(row: Row): string {
  return row.mark.kind === "injury"
    ? `${row.label}, injury`
    : `${row.label}, soreness ${row.mark.severity} of ${MAX_SEVERITY}`;
}

function areaCount(n: number): string {
  return `${n} area${n === 1 ? "" : "s"} flagged`;
}

export function BodyScan({ injuries, soreness }: BodyScanProps) {
  const router = useRouter();
  const injuryRows: Row[] = [];
  const sorenessRows: Row[] = [];
  /** Flagged, but outside the vocabulary, so the diagram cannot place it. */
  const unplaced: string[] = [];

  // Only unresolved injuries. `resolved_at` is the entire difference between a
  // current injury and a healed one.
  for (const injury of injuries ?? []) {
    if (injury.resolved_at !== null) continue;
    const rows = rowsFor(injury.body_part, "injury", undefined);
    if (rows) injuryRows.push(...rows);
    else unplaced.push(injury.body_part.trim());
  }

  for (const entry of soreness) {
    const rows = rowsFor(entry.part, "soreness", entry.severity);
    if (rows) sorenessRows.push(...rows);
    else unplaced.push(entry.part.trim());
  }

  const rows = [...injuryRows, ...sorenessRows];
  const flagged = rows.length + unplaced.length;

  // Soreness first so an injury on the same spot draws over it, not under.
  const marks = [...sorenessRows, ...injuryRows].map((r) => r.mark);

  /*
   * The website's header reads "All clear" here. That is a verdict about the
   * body inferred from an empty record, and an empty record is exactly what an
   * athlete who never checked in also has — `todaySoreness` is `[]` whether
   * nothing hurts or nothing was asked. Non-negotiable #4: a blank must never
   * read as a healthy value. So the header describes the RECORD.
   */
  /*
   * And the website's empty line — "No flagged areas — nothing lit up. Keep it
   * that way." — fails non-negotiable #5: "Keep it that way" is a second-person
   * imperative, which turns a description into an instruction. Replaced with
   * what was actually observed, in the past tense, naming the report rather
   * than the athlete.
   */
  const emptyLine = "No open injuries, and no soreness reported today.";

  const summary = flagged
    ? `Body scan. ${areaCount(flagged)}: ` +
      [
        ...rows.map(describe),
        ...unplaced.map((p) => `${p}, not shown on the diagram`),
      ].join("; ") +
      "."
    : `Body scan. ${emptyLine}`;

  return (
    <Panel
      title="Body scan"
      note={
        flagged ? (
          <>
            <Text style={styles.count}>{flagged}</Text>
            {` area${flagged === 1 ? "" : "s"} flagged`}
          </>
        ) : (
          "Nothing flagged"
        )
      }
      /* The rows are a full-bleed divided list, so the card cannot own their
         inset — see `PanelProps.padded`. Everything that is NOT a row carries
         `styles.inset` instead. */
      padded={false}
    >
      <BodyMap marks={marks} accessibilityLabel={summary} />

      {flagged ? (
        <>
          {/* No `gap`: the rows are contiguous and the separator is the only
              thing between them, the way a grouped list draws it. Rendered only
              when there ARE rows — an empty one is still a flex child and would
              spend the Panel's gap on nothing, which happens whenever every
              flagged area landed in `unplaced`. */}
          {rows.length ? (
            <View>
              {rows.map((row, i) => (
                <View key={`${row.mark.key}-${row.mark.side}-${i}`} style={styles.row}>
                  <MarkSwatch kind={row.mark.kind} severity={row.mark.severity} />
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.mark.kind === "injury" ? (
                    <Text style={styles.rowMeta}>injury</Text>
                  ) : (
                    <Text style={styles.rowSeverity}>
                      {row.mark.severity}/{MAX_SEVERITY}
                    </Text>
                  )}
                  {/* Between rows only — never under the last one, which would
                      read as a clipped row (docs/design-port.md #6). The action
                      row below draws its own, above itself. */}
                  {i === rows.length - 1 ? null : (
                    <View style={styles.separator} pointerEvents="none" />
                  )}
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.notes, styles.inset]}>
            {unplaced.length ? (
              <Text style={styles.rowMeta}>
                {`Also flagged, not shown on the diagram: ${unplaced.join(", ")}.`}
              </Text>
            ) : null}

            {/*
              The key. Shape and weight carry the meaning — a diamond on a heavier
              outline is an injury, a disc is soreness, and the disc grows and
              fills as the reported figure rises — so the tones only repeat what
              the drawing already says and the scan survives greyscale.
            */}
            <View style={styles.key}>
              <View style={styles.keyItem}>
                <MarkSwatch kind="injury" />
                <Text style={styles.rowMeta}>injury</Text>
              </View>
              <View style={styles.keyItem}>
                <MarkSwatch kind="soreness" severity={9} />
                <Text style={styles.rowMeta}>severe</Text>
              </View>
              <View style={styles.keyItem}>
                <MarkSwatch kind="soreness" severity={5} />
                <Text style={styles.rowMeta}>moderate</Text>
              </View>
              <View style={styles.keyItem}>
                <MarkSwatch kind="soreness" severity={2} />
                <Text style={styles.rowMeta}>mild</Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <Text style={[styles.rowMeta, styles.inset]}>{emptyLine}</Text>
      )}

      {/*
        The design's action row. It goes to Home, which is where soreness is
        added or changed — the scan is a reading, and the one thing an athlete
        can do about what it shows is on the other tab. A component owning its
        own `router` follows `RunCard`, and the row is a real destination: a row
        that wore a chevron and did nothing would be the lie `List`'s header
        describes.
      */}
      <Pressable
        onPress={() => router.navigate("/")}
        accessibilityRole="link"
        accessibilityLabel="Add or change soreness"
        /* `dim`, not `rowPress`: a row flashes a fill across its full width, and
           `Card` does not clip its corners, so a flash on the card's last child
           would paint square corners over the radius. See theme/press. */
        style={({ pressed }) => [styles.action, dim(pressed)]}
      >
        <View style={styles.separatorTop} pointerEvents="none" />
        <Text style={styles.actionLabel}>Add or change soreness</Text>
        <Chevron />
      </Pressable>
    </Panel>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  /** The Panel head: title left, note right, both on the same baseline. */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted },
  /** Every numeral is mono, including one sitting inside a sentence. */
  count: { fontFamily: font.mono, color: color.ink },

  /**
   * The design's 13/16 row padding on the app's 4px scale, with its 12pt gap.
   * No `minHeight`: these rows are not tap targets, and 12 + a 24pt line + 12
   * already clears 48.
   */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPadding,
  },
  rowLabel: { ...text.base, color: color.ink, flex: 1 },
  rowMeta: { ...text.meta, color: color.muted },
  /**
   * Welded to its scale — a bare "6" is not a severity — and `statInline`
   * rather than `meta` in the mono face, so the figure is tabular. Same `muted`
   * as the word "injury" beside it: the two are one meta column and must not
   * read as two ranks.
   */
  rowSeverity: { ...text.statInline, color: color.muted },
  /**
   * Absolutely positioned, and inset from the left with a full-bleed right, the
   * way `ListRow` draws it: a `borderWidth` is all-or-nothing across the row.
   */
  separator: {
    position: "absolute",
    left: layout.cardPadding,
    right: 0,
    bottom: 0,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },
  /** The same rule, above the action row rather than below a data row. */
  separatorTop: {
    position: "absolute",
    left: layout.cardPadding,
    right: 0,
    top: 0,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },

  /** Everything in the card that is NOT a full-bleed row. */
  inset: { paddingHorizontal: layout.cardPadding },
  notes: { gap: space.sm },

  key: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
  },
  keyItem: { flexDirection: "row", alignItems: "center", gap: space.xs },

  /**
   * The action row. `target.min`, because unlike the rows above this one is
   * actually tapped.
   */
  action: {
    minHeight: target.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPadding,
  },
  /**
   * `brandText`, never `brand`: the ember hex is 2.01:1 and is a fill, so a
   * word wearing it would be unreadable in the light this app is used in. This
   * is the tinted-action tint the rest of the app uses for the same job.
   */
  actionLabel: { ...text.base, color: color.brandText, flex: 1 },
});

export default BodyScan;
