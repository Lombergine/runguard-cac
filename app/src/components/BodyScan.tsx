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
 * NO SIDE-PARSER LIVES HERE. `sorenessLabel` ("left shin") and `injuryLabel`
 * ("shin (left)") in lib/bodyParts already own the two stored formats; this
 * file reads a stored string by REGENERATING it from them and comparing, so
 * there is exactly one description of each format in the app. A string that
 * matches neither is still counted and still named — see `unplaced`. Losing a
 * flagged area silently is worse than admitting the diagram cannot place it.
 *
 * NO CARD OF ITS OWN, matching RecoveryTiles: this is a section, and the screen
 * that composes it owns the surface it sits on.
 */
import { StyleSheet, Text, View } from "react-native";

import { BodyMap, MarkSwatch } from "./BodyMap";
import {
  BODY_PARTS,
  BodyPart,
  injuryLabel,
  Side,
  sorenessLabel,
} from "../lib/bodyParts";
import { BodyMark, Injury, SorenessEntry } from "../lib/types";
import { space } from "../theme/space";
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

/** The sides each formatter can produce, `null` (bare) checked last. */
const SIDES: readonly (Side | null)[] = ["left", "right", "both", null];

type Format = (key: string, side: Side | null) => string;

/**
 * Read a stored part string by regenerating every string the formatters can
 * produce and comparing. `null` when the string is outside the vocabulary —
 * older rows came through the website's 19 free-text regions.
 */
function resolve(
  raw: string,
  format: Format,
): { part: BodyPart; side: Side | null } | null {
  const want = raw.trim().toLowerCase();
  for (const part of BODY_PARTS) {
    for (const side of SIDES) {
      if (format(part.key, side).toLowerCase() === want) {
        // A side on a part that has none is noise; drop it.
        return { part, side: part.lateral ? side : null };
      }
    }
  }
  return null;
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
 */
function rowsFor(
  raw: string,
  kind: BodyMark["kind"],
  severity: number | undefined,
  format: Format,
): Row[] | null {
  const found = resolve(raw, format);
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
  const injuryRows: Row[] = [];
  const sorenessRows: Row[] = [];
  /** Flagged, but outside the vocabulary, so the diagram cannot place it. */
  const unplaced: string[] = [];

  // Only unresolved injuries. `resolved_at` is the entire difference between a
  // current injury and a healed one.
  for (const injury of injuries ?? []) {
    if (injury.resolved_at !== null) continue;
    const rows = rowsFor(injury.body_part, "injury", undefined, injuryLabel);
    if (rows) injuryRows.push(...rows);
    else unplaced.push(injury.body_part.trim());
  }

  for (const entry of soreness) {
    const rows = rowsFor(entry.part, "soreness", entry.severity, sorenessLabel);
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
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Body scan</Text>
        <Text style={styles.note}>
          {flagged ? (
            <>
              <Text style={styles.count}>{flagged}</Text>
              {` area${flagged === 1 ? "" : "s"} flagged`}
            </>
          ) : (
            "Nothing flagged"
          )}
        </Text>
      </View>

      <BodyMap marks={marks} accessibilityLabel={summary} />

      {flagged ? (
        <View style={styles.legend}>
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
            </View>
          ))}

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
      ) : (
        <Text style={styles.rowMeta}>{emptyLine}</Text>
      )}
    </View>
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

  legend: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowLabel: { ...text.base, color: color.ink, flex: 1 },
  rowMeta: { ...text.meta, color: color.muted },
  /** Welded to its scale — a bare "6" is not a severity. */
  rowSeverity: { ...text.meta, fontFamily: font.mono, color: color.ink2 },

  key: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
    marginTop: space.xs,
  },
  keyItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
});

export default BodyScan;
