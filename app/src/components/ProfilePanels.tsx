/**
 * The rest of the athlete's profile: how data syncs, which apps are connected,
 * season goals, achievements and injury history.
 *
 * Mirrors `website/src/components/athlete/tabs.tsx:793-881`. Four small panels
 * in one file because they are only ever used together, on one screen, and four
 * files of thirty lines would be filing rather than structure.
 *
 * Each owns its own `Card`; the screen supplies the heading above it, matching
 * how `profile.tsx` already sets out Team and Max heart rate.
 *
 * ── THREE ABSENCES THAT ARE NOT FAILURES ───────────────────────────────────
 * Non-negotiable #4 says absent, zero and no-run are three different objects.
 * This file has three more that are easy to render as bad news and are not:
 *
 *   an UNCONNECTED app      is not a broken one — nobody said it should be
 *   an UNEARNED badge       is not a failed one — most are simply not yet
 *   a goal with NO forecast is not an off-track goal — `onTrack: null` means
 *                           there is not enough history to say, which is a
 *                           different sentence from "you are behind"
 *
 * Each is rendered as an ordinary unfilled state, never in a status colour.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { StyleSheet, Text, View } from "react-native";

import { Card } from "./Card";
import { Absent } from "./Nothing";
import { getBodyPart, injuryLabel } from "../lib/bodyParts";
import { dayLabel } from "../lib/dates";
import type { Badge, Goal, Injury } from "../lib/types";
import { ruleWidth, space } from "../theme/space";
import { color } from "../theme/tokens";
import { text } from "../theme/type";

/* ------------------------------------------------------------------ *
 * Connected apps
 * ------------------------------------------------------------------ */

/** The five the website checks for, in its order (`tabs.tsx:819-832`). */
const APPS = ["Apple Health", "Strava", "Garmin", "COROS", "WHOOP"] as const;

/**
 * What the server actually puts in `connectedSources`
 * (website/src/lib/profile.ts:124): `"Strava"`, `"Apple Watch"`, or the sentinel
 * `"No data yet"` when the set is empty. It never emits `"Apple Health"`, and
 * `"healthkit"` / `"apple_export"` are the ACTIVITY `source` column values it
 * reads to decide — not strings it ever sends. Matching only on those meant the
 * Apple Health pill could not light for anyone, so an athlete whose watch was
 * syncing read the footnote below as "nothing has arrived from it". Both forms
 * are matched; the sentinel matches nothing, which is the correct outcome.
 */
const APPLE_ALIASES = ["apple watch", "apple health", "healthkit", "apple_export"];

export function ConnectedApps({ sources }: { sources: string[] | undefined }) {
  const on = new Set((sources ?? []).map((s) => s.toLowerCase()));
  const isOn = (name: string) =>
    on.has(name.toLowerCase()) ||
    (name === "Apple Health" && APPLE_ALIASES.some((a) => on.has(a)));

  return (
    <Card>
      <Text style={styles.prose}>
        RunGuard reads what your watch already records. Nothing is typed in by
        hand, and nothing is sent anywhere your coach could not already see.
      </Text>
      <View style={styles.pills}>
        {APPS.map((name) => (
          <View key={name} style={[styles.pill, isOn(name) && styles.pillOn]}>
            <Text style={[styles.pillText, isOn(name) && styles.pillTextOn]}>{name}</Text>
          </View>
        ))}
      </View>
      {/* An app nobody connected is not a problem to solve — say so plainly
          rather than leaving five grey chips to read as five failures. */}
      <Text style={styles.footnote}>
        Garmin, COROS, Fitbit and WHOOP write into Apple Health, so their data
        arrives that way rather than through a direct connection. An app that is
        not lit simply has not sent anything.
      </Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Season goals
 * ------------------------------------------------------------------ */

export function SeasonGoals({ goals }: { goals: Goal[] | undefined }) {
  if (!goals || goals.length === 0) {
    return <Absent label="No season goals set." />;
  }
  return (
    <Card padded={false}>
      {goals.map((g, i) => (
        <View key={`${g.event}-${i}`} style={[styles.row, i > 0 && styles.divided]}>
          <Text style={styles.rowTitle}>{g.event}</Text>
          <View style={styles.figures}>
            <View style={styles.figure}>
              <Text style={styles.figureLabel}>TARGET</Text>
              <Text style={styles.figureValue}>{g.targetLabel}</Text>
            </View>
            <View style={styles.figure}>
              <Text style={styles.figureLabel}>PREDICTED NOW</Text>
              {g.predicted === null ? (
                <Text style={styles.figureAbsent}>—</Text>
              ) : (
                <Text style={styles.figureValue}>{g.predicted}</Text>
              )}
            </View>
          </View>
          {/*
            THREE STATES, NOT TWO. `onTrack: null` is "not enough training
            behind this to say", which the website renders the same as being
            behind. That is a blank reading as a value, in the direction that
            makes a teenager feel they are failing at something nobody has
            measured yet.
          */}
          <Text style={styles.rowNote}>
            {g.onTrack === null
              ? "Not enough training recorded yet to forecast this one."
              : g.onTrack
                ? "Your current prediction is inside this target."
                : "Your current prediction is outside this target."}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Achievements
 * ------------------------------------------------------------------ */

/**
 * The website gives each badge an emoji and a filled tile (`tabs.tsx:854-864`).
 * Neither ships here, and the reasoning is the spec's rather than taste:
 *
 *   § Imagery — almost none: "One good illustration (the body diagram)... no
 *   stock photography, no mascot, no illustration system." The body map is that
 *   one illustration; an emoji set is a second one.
 *
 *   § Nothing shouts: "no badges, no confetti, no streak flames."
 *
 * What survives is the INFORMATION — which achievements exist, which are earned,
 * and the detail sentence under each — because that is the parity requirement.
 * What is dropped is the celebration. An earned achievement is stated in the ink
 * voice; an unearned one is stated in the muted voice and is explicitly not a
 * failure. Nothing is filled, coloured, or ranked.
 */
export function Achievements({ badges }: { badges: Badge[] | undefined }) {
  if (!badges || badges.length === 0) {
    return <Absent label="No achievements recorded yet." />;
  }
  const earned = badges.filter((b) => b.earned).length;
  return (
    <Card padded={false}>
      {badges.map((b) => (
        <View key={b.id} style={[styles.row, styles.dividedFirst]}>
          <Text style={b.earned ? styles.rowTitle : styles.rowTitleMuted}>{b.label}</Text>
          <Text style={styles.rowNote}>{b.detail}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.divided]}>
        <Text style={styles.footnote}>
          {`${earned} of ${badges.length} earned so far. The rest are things that have not happened yet, not things that went wrong.`}
        </Text>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Injury history
 * ------------------------------------------------------------------ */

/**
 * Read-only, and it must stay that way: `POST`/`PATCH /api/injury` are coach
 * routes, mounted only on the dashboard. The athlete's own record is something
 * they can read, not something they can edit.
 *
 * `resolved_at` is the discriminator. An unresolved injury is the same fact the
 * body scan on the Stats tab lights up, and both surfaces name the part through
 * `lib/bodyParts` so the vocabulary cannot drift.
 */
export function InjuryHistory({ injuries }: { injuries: Injury[] | undefined }) {
  if (!injuries || injuries.length === 0) {
    // Not "no injuries — great!". An empty record is an empty record; whether
    // the athlete is uninjured is not something this list knows.
    return <Absent label="Nothing recorded." />;
  }
  const open = injuries.filter((i) => i.resolved_at === null);
  const healed = injuries.filter((i) => i.resolved_at !== null);
  const ordered = [...open, ...healed];

  return (
    <Card padded={false}>
      {ordered.map((inj, i) => {
        const lateral = getBodyPart(inj.body_part)?.lateral === true;
        const name = lateral ? injuryLabel(inj.body_part, null) : inj.body_part;
        return (
          <View key={inj.id} style={[styles.row, i > 0 && styles.divided]}>
            <Text style={styles.rowEyebrow}>
              {inj.resolved_at === null ? "OPEN" : "HEALED"}
            </Text>
            <Text style={styles.rowTitle}>{name}</Text>
            {/* Explicit local dates, both of them — non-negotiable #2. */}
            <Text style={styles.rowNote}>
              {inj.resolved_at === null
                ? `Recorded ${dayLabel(inj.date)}`
                : `${dayLabel(inj.date)} — healed ${dayLabel(inj.resolved_at)}`}
            </Text>
            {inj.note ? <Text style={styles.rowNote}>{inj.note}</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  prose: { ...text.meta, color: color.ink2 },
  footnote: { ...text.meta, color: color.muted },

  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginVertical: space.md },
  pill: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: space.lg,
    borderWidth: ruleWidth,
    borderColor: color.rule,
  },
  /** Connected: the soft ember wash the app uses for "this one is selected". */
  pillOn: { backgroundColor: color.accentSoft, borderColor: color.brandStrong },
  pillText: { ...text.meta, color: color.muted },
  pillTextOn: { color: color.ink },

  row: { padding: space.lg, gap: space.xs },
  divided: { borderTopWidth: ruleWidth, borderTopColor: color.ruleSoft },
  dividedFirst: {},
  rowEyebrow: { ...text.micro, color: color.muted },
  rowTitle: { ...text.base, color: color.ink },
  /** Unearned: quieter, never struck through, never in a status colour. */
  rowTitleMuted: { ...text.base, color: color.muted },
  rowNote: { ...text.meta, color: color.ink2 },

  figures: { flexDirection: "row", gap: space.lg, marginTop: space.xs },
  figure: { flex: 1, gap: space.xs },
  figureLabel: { ...text.micro, color: color.muted },
  figureValue: { ...text.stat, color: color.ink },
  figureAbsent: { ...text.stat, color: color.unknown },
});
