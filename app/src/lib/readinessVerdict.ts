import type { ColorValue } from "react-native";
/**
 * Readiness presentation, mirrored from the web athlete portal.
 *
 * The website is the source of truth for what an athlete is shown, so these
 * bands, words and the `/100` unit are copied from
 * `website/src/components/athlete/tabs.tsx` rather than invented:
 *
 *   readyColor  (:49)  r < 40 → critical | r < 65 → warning | else good
 *   verdict     (:167) >= 65 "Good to go" | >= 40 "Train with care"
 *                      | "Take it easy today"
 *   unit        (:208, :572) "/100", rendered welded to the numeral
 *
 * If the web copy changes, change it here too — grep `readyColor` on both sides.
 *
 * ONE DELIBERATE DIVERGENCE. The website gates the gauge on
 * `risk.hasActivityHistory`; this app gates on `todayCheckin` via
 * `readinessState()`, because visual-spec non-negotiable #6 requires "— unknown"
 * whenever there is no check-in. That is the stricter rule: the server returns
 * readiness 100 for an athlete with no check-in AND no wearable data, so
 * `hasActivityHistory` alone still lets a fabricated 100 through.
 *
 * NOTE for review: "Take it easy today" is second-person imperative, which
 * visual-spec rule 5 forbids for the clear/watch/unusual advisory. It is kept
 * verbatim here because it is the website's existing athlete-facing wording and
 * mirroring was the explicit instruction. Rule 5 still governs `Advisory`, which
 * is a separate element.
 */
import { color } from "../theme/tokens";

export type ReadinessBand = "under" | "partial" | "recovered";

/** Website: r < 40 | r < 65 | else. */
export function readinessBand(value: number): ReadinessBand {
  if (value < 40) return "under";
  if (value < 65) return "partial";
  return "recovered";
}

/** Website `readyColor`, mapped onto this app's status tokens. */
export function readinessColor(value: number): ColorValue {
  switch (readinessBand(value)) {
    case "under":
      return color.unusual;
    case "partial":
      return color.watch;
    case "recovered":
      return color.ok;
  }
}

/** Website Home-tab `verdict`, verbatim. */
export function readinessVerdict(value: number): string {
  switch (readinessBand(value)) {
    case "under":
      return "Take it easy today";
    case "partial":
      return "Train with care";
    case "recovered":
      return "Good to go";
  }
}

/**
 * The numeral with its unit welded into one string, per visual-spec rule 3.
 * Matches the website, which renders `{readiness}/100`.
 */
export function readinessValue(value: number): string {
  return `${value}/100`;
}
