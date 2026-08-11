/**
 * The 2×2 recovery grid: Sleep · 7d, HRV, Resting HR, Week.
 *
 * Mirrors the four bento tiles on the website's home tab
 * (website/src/components/athlete/tabs.tsx `BentoTile`:127) — same four
 * readings, same copy — under the website's `Panel` head (tabs.tsx:22): title on
 * the LEFT, muted note on the RIGHT, then the content. The note carries the
 * reading instruction the tiles cannot fit, which is what the two deltas are
 * measured against.
 *
 * Tiles stay ink-on-card and are never tinted. The website turns a tile amber or
 * red when a delta crosses a threshold; that is status colour doing advisory
 * work, and advisory here stays a description. Sunrise loosens how often colour
 * may appear, not what colour is allowed to say — so the ember is spent on the
 * things the athlete acts on, never on a reading that has drifted.
 *
 * Every reading is nullable. `RecoverySnapshot`
 * (website/src/lib/risk.ts) has every field `| null`, and for most athletes in
 * the seed data three of these four are null. A null renders <Absent/> through
 * <Tile/>. Never 0 — absent and zero are three-kinds-of-nothing distinct, and
 * a zeroed-out reading that reads as measured is the failure the visual spec
 * exists to prevent.
 *
 * The figures are already rounded to one decimal by the server (risk.ts
 * `round`), so nothing is re-formatted here beyond welding the unit on.
 */
import { View, Text, StyleSheet } from "react-native";

import { Tile } from "./Tile";
import { Profile } from "../lib/types";
import { formatDistance } from "../lib/units";
import { space } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/**
 * The recovery readings the grid shows.
 *
 * These are fields of `RecoverySnapshot` that /api/mobile/home already sends
 * (see the comment on `recovery` in website/src/app/api/mobile/home/route.ts);
 * `Profile["risk"]["recovery"]` in ../lib/types.ts currently declares only
 * `hasData`. Declared optional and INTERSECTED with the real contract, so this
 * widens rather than redefines: a plain `profile.risk` is still assignable, and
 * when types.ts grows the fields this alias collapses to a no-op and should be
 * deleted. Until then a field that is missing is `undefined`, which the `!= null`
 * checks below treat exactly like `null` — unknown either way.
 */
type RecoveryReadings = {
  /** Hours, mean of the last 7 days. */
  sleepAvg?: number | null;
  /** Milliseconds. */
  hrv?: number | null;
  /** Percent versus the 28-day baseline. */
  hrvDeltaPct?: number | null;
  /** Beats per minute. */
  restingHr?: number | null;
  /** bpm versus the 28-day baseline. */
  restingHrDelta?: number | null;
};

export type RecoveryTilesProps = {
  risk: Profile["risk"] & { recovery: RecoveryReadings };
};

/** "+3" / "-12" — the sign is part of the figure, so it stays in the same node. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function RecoveryTiles({ risk }: RecoveryTilesProps) {
  const r = risk.recovery;

  return (
    <View style={styles.grid}>
      <View style={styles.head}>
        <Text style={styles.title}>Recovery</Text>
        {/* The caveat, not a heading of its own: two of these four tiles carry a
            delta, and a delta means nothing without what it is measured from. */}
        <Text style={styles.note}>Deltas vs 28-day baseline</Text>
      </View>

      <View style={styles.row}>
        <Tile label="Sleep · 7d" value={r.sleepAvg != null ? `${r.sleepAvg} h` : null} />
        <Tile
          label="HRV"
          value={r.hrv != null ? `${r.hrv} ms` : null}
          sub={r.hrvDeltaPct != null ? `${signed(r.hrvDeltaPct)}% vs base` : undefined}
        />
      </View>
      <View style={styles.row}>
        <Tile
          label="Resting HR"
          value={r.restingHr != null ? `${r.restingHr} bpm` : null}
          sub={
            r.restingHrDelta != null ? `${signed(r.restingHrDelta)} bpm vs base` : undefined
          }
        />
        {/*
          weekKm is always a number, so the guard is `hasActivityHistory`, not
          the value: 0 km from an athlete who has never synced a run is not a
          measured zero, it is an unknown, and rendering "0 mi" for it would be
          a blank reading as a fact. With history, "0 mi" IS the Zero object —
          solid rule, card fill, unit welded, styled like every other fact —
          which is what the solid tile already renders.
        */}
        <Tile
          label="Week"
          value={risk.hasActivityHistory ? formatDistance(risk.weekKm) : null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space.md },
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
  // Two explicit rows rather than a wrapping grid: `flex: 1` on each tile keeps
  // the pair the same width and the same height at 360px, which a flexBasis
  // wrap does not guarantee once one tile carries a sub-line.
  row: { flexDirection: "row", gap: space.md },
});

export default RecoveryTiles;
