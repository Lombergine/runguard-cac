/**
 * PRs & predicted times — the app's port of the website's four-column table
 * (website/src/components/athlete/tabs.tsx:506-534).
 *
 * WHY THIS IS NOT A TABLE. The website lays out Event · PR · Predicted now ·
 * Verdict as four `<td>`s, and hides the verdict column outright below the `sm`
 * breakpoint. Four columns of figures do not survive 360px, and a verdict that
 * disappears on a phone is not a port of the verdict. So the row is re-cut the
 * way the race log already cuts one (../app/(tabs)/races.tsx:215 `ResultRow`):
 *
 *     5K                              ← the event, as the row's eyebrow
 *     PR              PREDICTED       ← two labelled figures, side by side
 *     18:42           18:20
 *     Your predicted time is faster   ← the verdict, full width, wrapping prose
 *     than your PR.
 *
 * Two mono figures with a micro-label each fit inside 320px of content with room
 * to spare, and the fourth column becomes a sentence that WRAPS instead of a
 * column that crushes. Nothing is hidden at any width.
 *
 * Every time here is `label` — pre-formatted by the server (`fmtTime`) and
 * rendered through <Stat/>, mono and tabular. This component never formats or
 * concatenates a time, and never renders `timeS`; that field is read only to
 * compare.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE VERDICTS, AND WHY THEY ARE WORDED DIFFERENTLY
 *
 * The conditions are ported exactly; only the sentences changed. Non-negotiable
 * #5 (../../../docs/visual-spec.md) says advisory language stays descriptive —
 * the app describes, it does not instruct — and § "Nothing shouts" rules out
 * badges and ticks.
 *
 *   pr.timeS === null   "race it to set a PR"  → "No time on record for this
 *                       event; a first race would set your PR."
 *                       An order became an observation about the record.
 *
 *   predicted faster    "PR predicted ✓"       → "Your predicted time is faster
 *                       than your PR."
 *                       The ✓ is a badge glyph awarding something that has not
 *                       happened — a model output, not a result. The sentence
 *                       says what was computed and nothing more.
 *
 *   otherwise           "keep building"        → "Your predicted time is not yet
 *                       faster than your PR."
 *                       An imperative became the plain negation of the same
 *                       condition. `faster` is a strict `<`, so an equal
 *                       prediction lands here too — "not yet faster" is true of
 *                       it, where "slower" would not be.
 *
 * The website also paints the predicted time and its verdict green when the
 * model beats the PR. No status colour is used here: `ok` is for verdicts about
 * something measured, and this is a prediction. The wording carries it, exactly
 * as `races.tsx` carries a PR with a plain two-letter label and no fill.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * HONESTY: a prediction is the model's output, and with no synced activity it is
 * the model talking to itself. The website gates race predictions on
 * `risk.hasActivityHistory` (tabs.tsx:681) and this app already follows that in
 * races.tsx:194-209. The same gate applies here — but the props are Event data
 * only, so the flag is read from the shared profile the caller's `prs` and
 * `predictions` came out of, and it fails closed: no profile, no prediction.
 * That is the one reason this component touches the store.
 *
 * The two absences are NOT the same absence and must not render alike:
 *   no PR         → "PR · — · Not raced yet."       nothing was ever run
 *   no prediction → "Predicted · — · Not enough     nothing to model it from
 *                    data yet."
 * Both are <Absent/>, dashed, because both are unknowns; neither is ever a `0`
 * and neither is ever the server's `label` for a null PR, which is the bare
 * string "—" (website/src/lib/profile.ts:363) and would read as a value on its
 * own.
 */
import { StyleSheet, Text, View } from "react-native";

import { Absent } from "./Nothing";
import { Card } from "./Card";
import { Stat } from "./Stat";
import { useProfile } from "../lib/profileStore";
import type { PRRecord, Predictions } from "../lib/types";
import { layout, ruleWidth, space } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/**
 * `PRRecord` and `Predictions` come from ../lib/types.ts, which is the single
 * declaration of what /api/mobile/me sends. They were local narrowings while
 * this component was built in parallel with the type being widened; keeping them
 * local would have left two descriptions of one payload free to drift apart.
 *
 * Note `PRRecord.label` is the string "—" when `timeS` is null. It is compared,
 * never rendered — see `PrRow`.
 */
export type PrTableProps = {
  prs: readonly PRRecord[];
  /** Keyed by event name. An event with no entry has no prediction. */
  predictions: Predictions;
};

/**
 * The verdict sentence, or null when there is nothing observed to describe.
 *
 * Conditions ported verbatim from tabs.tsx:527; see the header for the wording.
 * With no prediction there is no comparison, and the dashed slot beside it has
 * already said so — a sentence there would be the component filling silence.
 */
function verdict(pr: PRRecord, predicted: Predictions[string] | undefined): string | null {
  if (predicted === undefined) return null;
  if (pr.timeS === null) {
    return "No time on record for this event; a first race would set your PR.";
  }
  return predicted.timeS < pr.timeS
    ? "Your predicted time is faster than your PR."
    : "Your predicted time is not yet faster than your PR.";
}

function PrRow({
  pr,
  predicted,
}: {
  pr: PRRecord;
  /** Already gated. `undefined` = unknown, for either reason. */
  predicted: Predictions[string] | undefined;
}) {
  const line = verdict(pr, predicted);
  return (
    <View style={styles.row}>
      <Text style={styles.event}>{pr.event}</Text>
      <View style={styles.figures}>
        <View style={styles.figure}>
          {pr.timeS === null ? (
            <Absent eyebrow="PR" label="Not raced yet." />
          ) : (
            <Stat label="PR" value={pr.label} />
          )}
        </View>
        <View style={styles.figure}>
          {predicted === undefined ? (
            <Absent eyebrow="Predicted" label="Not enough data yet." />
          ) : (
            <Stat label="Predicted" value={predicted.label} />
          )}
        </View>
      </View>
      {line ? <Text style={styles.verdict}>{line}</Text> : null}
    </View>
  );
}

export function PrTable({ prs, predictions }: PrTableProps) {
  // See the header: the gate, not decoration. `?? false` fails closed.
  const { profile } = useProfile();
  const predictionKnown = profile?.risk.hasActivityHistory ?? false;

  return (
    <View style={styles.block}>
      {/* The Panel head, as on the website and in RecoveryTiles: title left,
          the caveat right. */}
      <View style={styles.head}>
        <Text style={styles.title}>PRs & predicted times</Text>
        <Text style={styles.note}>
          {predictionKnown
            ? "Predicted times come from your recent training."
            : "Predictions need synced runs."}
        </Text>
      </View>

      {prs.length === 0 ? (
        <Absent label="No events on record." />
      ) : (
        <Card padded={false}>
          {prs.map((pr, i) => (
            <View key={pr.event} style={i > 0 ? styles.divided : undefined}>
              <PrRow
                pr={pr}
                predicted={predictionKnown ? predictions[pr.event] : undefined}
              />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.muted, flexShrink: 1 },

  row: { padding: layout.cardPadding, gap: space.sm },
  divided: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  /** The row's identity, in the eyebrow slot races.tsx uses for the same job. */
  event: { ...text.micro, color: color.muted },
  /**
   * Two columns, never four. `flex: 1` on each keeps the pair equal-width at
   * 360px whether a column holds a 22px figure or a dashed slot.
   */
  figures: { flexDirection: "row", gap: space.lg },
  figure: { flex: 1 },
  /** Prose, full width, wrapping — this is the column that could not be one. */
  verdict: { ...text.meta, color: color.ink2, marginTop: space.xs },
});

export default PrTable;
