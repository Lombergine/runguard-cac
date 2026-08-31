/**
 * Roster — every athlete on the team, before practice.
 *
 * The coach's default tab. See ../../../../docs/visual-spec.md § "Coach
 * dashboard": denser than the athlete side, a TABLE rather than a feed, sorted
 * by what is missing and never by risk, and failing closed when the team cannot
 * be resolved.
 *
 * ── WHAT THE DESIGN DRAWS THAT THIS DOES NOT ───────────────────────────────
 *
 *  1. THE STATUS RAIL. The design carries each athlete's state in a 3px inset
 *     left rail plus coloured text and nothing else. Colour alone fails
 *     greyscale and colour-blindness, which is the exact failure § "Status and
 *     advisory" exists to prevent — "shape carries the meaning" and colour is
 *     applied last. `Advisory` (dot + lowercase word + reason) ships instead.
 *     The design is internally inconsistent here too: one athlete carries a red
 *     flag over an amber rail, which is what putting meaning in a hue buys.
 *
 *  2. THE SEGMENTED WINDOW CONTROL (24h / 3d / 7d / 30d / 6mo). Removed. The
 *     roster payload carries exactly ONE window — `risk.weekKm` and
 *     `risk.prevWeekKm`, seven days each — and the route takes no window
 *     parameter, so four of its five segments could only ever render four
 *     dashed tiles. That is worse than not offering them: four blanks arriving
 *     as the ANSWER to "how did the last 30 days go" reads as "nothing
 *     happened", and a blank must never read as a healthy value (non-negotiable
 *     #4). It is also the inert control docs/design-port.md #22 already ruled
 *     out — "a pill that opens nothing is the same lie as a chevron on an inert
 *     row". The window is stated as a fact in the tile labels instead.
 *
 *  3. THE AVATAR HUE. `athletes.avatar_hue` rides in the payload and the design
 *     paints each circle with it. Fourteen arbitrary hues cannot be
 *     contrast-checked — tokens.ts exists because the website's own accents
 *     measured 2.0–3.3:1 as text — and § "Tokens" rations colour to about three
 *     appearances per screen, on the thing you tap, on a status dot, and on the
 *     body map. Initials sit on the neutral system fill; the status dots keep
 *     the colour.
 *
 *  4. EVERY FIGURE IN THE MOCK IS A HARDCODED STRING — "1" spikes, "2"
 *     soreness, `dist(88)`, "+12% vs previous 7d", and the counts baked into
 *     the eyebrows. Every number below is derived from the payload or rendered
 *     absent; `teamTiles` is the whole arithmetic and it reads the response.
 *
 * ── THE ONE HONESTY FIX THIS SCREEN OWNS ───────────────────────────────────
 *
 * `prePracticeFlag` (website/src/lib/engine.ts) returns
 * `clear · "Nothing in today's check-in or recovery data stands out."` when
 * there is no check-in AND no recovery data at all — vacuously true, and on a
 * roster row it reads as a coach-facing all-clear for an athlete the system has
 * never heard from. That is the same fabricated-from-nothing failure as
 * `readinessScore` returning 100, and non-negotiable #6 forbids it. `stateOf`
 * below downgrades exactly that case to `unknown`, and only that case: a
 * `watch` or `unusual` always rests on something real (a reported severity, or
 * the illness pattern in the wearable data), so neither is ever touched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { Card } from "../../components/Card";
import { Chevron } from "../../components/List";
import { Section } from "../../components/Section";
import { TabScreen } from "../../components/TabScreen";
import { StatusDot } from "../../components/StatusDot";
import { Tile } from "../../components/Tile";
import { getCoachRoster, type CoachRoster, type CoachRosterAthlete } from "../../lib/api";
import { dayLabel, localDay } from "../../lib/dates";
import type { Flag } from "../../lib/types";
import { fmtMiles } from "../../lib/units";
import { dim, rowPress } from "../../theme/press";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/**
 * The roster row's initials circle. 40, which is `target.min - space.sm` — the
 * design's 38 is not on the 4px scale and app/CLAUDE.md makes the theme the
 * single source, so the size is composed from it the way docs/design-port.md
 * #22 composes the profile avatar's 60 from `target.min + space.md`.
 */
const AVATAR = target.min - space.sm;

/** Row height floor, so a skeleton reserves the height the real rows take. */
const ROW_H = target.row + space.lg;

/** Two initials, or one. Never a photo — see visual-spec § "Imagery". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <View
      // Decoration: the name is right beside it, so a screen reader that read
      // the initials as well would say the athlete's name twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.avatarText}>{initialsOf(name)}</Text>
    </View>
  );
}

/**
 * The text-safe twin of each state fill, exactly as `Advisory` maps them.
 *
 * A row cannot use `Advisory` itself: that component stacks the word over the
 * reason on two lines at body rank, which is right on a detail surface and is
 * two rows' worth of height fourteen times over on a triage list. The values
 * are the `…Text` variants and never the fills — `ok` measures 3.30:1 and
 * `watch` 3.19:1 as type, and these land on a glyph.
 */
const FLAG_TEXT: Record<Flag, string> = {
  clear: color.okText,
  watch: color.watchText,
  unusual: color.unusualText,
  unknown: color.unknown,
};

/**
 * The advisory this row should actually render.
 *
 * See the header. `clear` on an athlete who has reported nothing and run
 * nothing is a verdict computed from no evidence; it becomes `unknown`, whose
 * dot is a dashed ring and whose reason says what is missing rather than
 * implying all is well.
 */
function stateOf(a: CoachRosterAthlete): { flag: Flag; reason: string } {
  const nothingKnown = !a.selfReport.hasData && !a.risk.hasActivityHistory;
  if (a.prePractice.flag === "clear" && nothingKnown) {
    return {
      flag: "unknown",
      reason:
        "No check-in and no runs have ever arrived for this athlete, so there is nothing to read yet.",
    };
  }
  return { flag: a.prePractice.flag, reason: a.prePractice.reason };
}

/* ------------------------------------------------------------------ *
 * The four tiles
 * ------------------------------------------------------------------ */

/** "+12%" / "-4%" / "0%". Sign is part of the figure, so it is welded on. */
function signedPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n}%`;
}

type TileSpec = { label: string; value: string | null; sub?: string };

/**
 * Every figure on this screen, derived in one place from one payload.
 *
 * Counts render as "3 of 14" rather than a bare "3": non-negotiable #3 wants
 * the unit welded into the numeral's own node, and for a count of people the
 * denominator IS the unit — "3" alone says nothing about whether that is most
 * of the team or one corner of it.
 */
function teamTiles(athletes: CoachRosterAthlete[]): TileSpec[] {
  const n = athletes.length;

  // Only athletes with a real activity history contribute. `risk.weekKm` is 0
  // for an athlete who has never synced, and summing those zeros into the team
  // total would report a measured 0 mi where the truth is "not recorded".
  const withRuns = athletes.filter((a) => a.risk.hasActivityHistory);
  const weekKm = withRuns.reduce((s, a) => s + a.risk.weekKm, 0);
  const prevKm = withRuns.reduce((s, a) => s + a.risk.prevWeekKm, 0);

  const distance: TileSpec = withRuns.length
    ? {
        label: "Team distance · 7 days",
        value: fmtMiles(weekKm),
        // A percentage against a zero baseline is not a percentage. With no
        // previous week to compare, the tile says what it has and stops.
        sub:
          prevKm > 0
            ? `${signedPct(Math.round((weekKm / prevKm - 1) * 100))} vs previous 7 days`
            : `over ${withRuns.length} of ${n}`,
      }
    : { label: "Team distance · 7 days", value: null };

  const flagged = athletes.filter((a) => stateOf(a).flag !== "clear").length;
  const spiking = athletes.filter((a) => a.spike !== null).length;
  // `daysSinceReport` counts days since the last SORENESS report, not since the
  // last check-in — `summarizeSelfReport` in website/src/lib/risk.ts is fed
  // soreness rows. So the label says "report", which is what the number means.
  const silent = athletes.filter((a) => a.selfReport.daysSinceReport !== 0).length;

  return [
    distance,
    {
      label: "Needs a look",
      value: `${flagged} of ${n}`,
      sub: "watch or unusual",
    },
    {
      label: "Session spikes",
      value: `${spiking} of ${n}`,
      sub: "in their last 7 runs",
    },
    {
      label: "No report today",
      value: `${silent} of ${n}`,
      sub: "nothing self-reported",
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function AthleteRow({
  athlete,
  isLast,
  onPress,
}: {
  athlete: CoachRosterAthlete;
  isLast: boolean;
  onPress: () => void;
}) {
  const state = stateOf(athlete);
  const week = athlete.risk.hasActivityHistory
    ? fmtMiles(athlete.risk.weekKm)
    : "no distance recorded";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      /* The whole row in one utterance. A `Pressable` with a label replaces its
         children for VoiceOver, so anything left out of this string — the
         reason, the week's distance, the dash — is simply not read out. */
      accessibilityLabel={`${athlete.name}. ${state.flag}. ${state.reason} Last 7 days, ${week}.`}
      accessibilityHint="Opens this athlete"
      style={({ pressed }) => [styles.row, rowPress({ pressed })]}
    >
      <Avatar name={athlete.name} size={AVATAR} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{athlete.name}</Text>
        <View style={styles.rowState}>
          {/* A fixed-height column, so the dot stays level with the FIRST line
              of a reason that wraps — `Tile` centres its info dot the same way.
              `alignItems: "center"` on the row would float it into the middle
              of a two-line reason instead. */}
          <View style={styles.rowDot}>
            <StatusDot flag={state.flag} />
          </View>
          <Text style={styles.rowReason} numberOfLines={2}>
            {/* Lowercase, body weight, colour last — the dot's SHAPE is what
                survives greyscale and carries the state. */}
            <Text style={[styles.rowFlag, { color: FLAG_TEXT[state.flag] }]}>
              {state.flag}
            </Text>
            {` · ${state.reason}`}
          </Text>
        </View>
      </View>
      {athlete.risk.hasActivityHistory ? (
        <Text style={styles.rowWeek}>{fmtMiles(athlete.risk.weekKm)}</Text>
      ) : (
        // Absent, not zero. A dash in the figure's own position, per the
        // precedent recorded on Tile.tsx: a dashed BOX here would make fourteen
        // unknowns the loudest thing on a triage screen.
        <Text style={styles.rowWeekAbsent}>—</Text>
      )}
      <Chevron />
      {isLast ? null : <View style={styles.separator} pointerEvents="none" />}
    </Pressable>
  );
}

/**
 * Every state where the card would otherwise be empty. The design has none of
 * these — an empty search, a team with no athletes and an unresolved team all
 * render as a bare card there — and a bare card is the blank that reads as a
 * healthy value.
 */
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export default function RosterScreen() {
  const router = useRouter();

  const [roster, setRoster] = useState<CoachRoster | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      setRoster(await getCoachRoster());
      setFailed(null);
    } catch (err) {
      // The server's own sentence, which `ApiError` already carries. Never the
      // raw thrown value: a fetch rejection can echo the request, and this
      // request holds a coach Bearer.
      setFailed(err instanceof Error ? err.message : "The roster could not be loaded.");
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  /**
   * The first load, started once.
   *
   * The indirection through a ref is `lib/profileStore.tsx`'s `ensure()`, and it
   * is not ceremony: an effect that calls a fetch which sets state on its way in
   * is a cascading render, and the app's own store solves it exactly this way.
   * A remount — a tab revisited, a fast refresh — does not refire it; pull to
   * refresh is how a coach asks for new data.
   */
  const started = useRef(false);
  const ensure = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void load(false);
  }, [load]);

  useEffect(() => {
    ensure();
  }, [ensure]);

  const athletes = useMemo(
    // A–Z, and never by risk. The eyebrow says so out loud because a coach
    // scanning a list will otherwise assume the top of it is the worst of it.
    () => [...(roster?.athletes ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roster]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? athletes.filter((a) => a.name.toLowerCase().includes(q)) : athletes;
  }, [athletes, query]);

  const tiles = useMemo(() => teamTiles(athletes), [athletes]);

  // Pre-formatted here. Non-negotiable #2: a component never derives a date.
  const today = dayLabel(localDay());
  const teamName = roster?.team?.name ?? null;

  /*
   * ALWAYS ONE LINE, loaded or not. This was `roster ? <Text/> : null`, so the
   * header stood one line tall while loading and two once the payload landed —
   * the bar changed height and pushed the content down under the coach's eye.
   *
   * The date is the spine because it is the one part already known before the
   * fetch (`dayLabel(localDay())` above, pre-formatted per non-negotiable #2).
   * The team and the count join it when they arrive; nothing appears or
   * disappears, so nothing moves.
   */
  const subtitle = (
    <Text style={styles.subtitle}>
      {teamName ? `${teamName} · ` : ""}
      {today}
      {roster ? (
        <>
          {" · "}
          <Text style={styles.subtitleCount}>{`${athletes.length} athletes`}</Text>
        </>
      ) : null}
    </Text>
  );

  return (
    <TabScreen
      title="Before practice"
      subtitle={subtitle}
      refreshing={refreshing}
      onRefresh={() => void load(true)}
    >
        {failed && !roster ? (
          <Card>
            <Text style={styles.emptyTitle}>The roster could not be loaded.</Text>
            <Text style={styles.emptyBody}>{failed}</Text>
            <Pressable
              onPress={() => void load(false)}
              accessibilityRole="button"
              accessibilityLabel="Try loading the roster again"
              style={({ pressed }) => [styles.retry, dim(pressed)]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        ) : !roster ? (
          // Grey bars at the final height, never a dash: a pending value is a
          // fact about the network, and a dash would claim it is a fact about
          // the team.
          <View style={styles.sections}>
            <View style={[styles.skeleton, styles.skeletonSearch]} />
            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <View style={[styles.skeleton, styles.skeletonTile]} />
                <View style={[styles.skeleton, styles.skeletonTile]} />
              </View>
              <View style={styles.gridRow}>
                <View style={[styles.skeleton, styles.skeletonTile]} />
                <View style={[styles.skeleton, styles.skeletonTile]} />
              </View>
            </View>
            <View style={[styles.skeleton, { height: ROW_H * 5 }]} />
          </View>
        ) : roster.team === null ? (
          /* Fails closed. visual-spec § "Coach dashboard": if identity is
             uncertain the surface explains what is unavailable rather than
             rendering partial data under an unconfirmed name. */
          <EmptyCard
            title="This account is not attached to a team."
            body="Nobody's data is being withheld — there is no roster to read. A team is attached from the RunGuard web dashboard."
          />
        ) : (
          <View style={styles.sections}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search the roster"
              placeholderTextColor={color.placeholder}
              autoCorrect={false}
              autoCapitalize="words"
              clearButtonMode="while-editing"
              accessibilityLabel="Search the roster by name"
              style={styles.search}
            />

            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <Tile {...tiles[0]} />
                <Tile {...tiles[1]} />
              </View>
              <View style={styles.gridRow}>
                <Tile {...tiles[2]} />
                <Tile {...tiles[3]} />
              </View>
            </View>

            <Section label="Roster · A–Z" note="never by risk">
              {athletes.length === 0 ? (
                <EmptyCard
                  title="No athletes on this roster yet."
                  body="Athletes appear here once they join the team with the coach's join code. Nothing is missing from the data — the team is empty."
                />
              ) : shown.length === 0 ? (
                <EmptyCard
                  title="Nobody on this roster matches that."
                  body={`${athletes.length} athletes are on the team; none of their names contains “${query.trim()}”.`}
                />
              ) : (
                <Card padded={false} style={styles.list}>
                  {shown.map((a, i) => (
                    <AthleteRow
                      key={a.id}
                      athlete={a}
                      isLast={i === shown.length - 1}
                      onPress={() => router.push(`/coach/athlete/${a.id}`)}
                    />
                  ))}
                </Card>
              )}
            </Section>

            {failed ? (
              <Text style={styles.stale}>
                This is the last roster that loaded. {failed}
              </Text>
            ) : null}
          </View>
        )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  sections: { gap: layout.section },

  subtitle: { ...text.meta, color: color.muted },
  /** The count is a numeral, so it is mono and tabular like every other one. */
  subtitleCount: { fontFamily: font.mono, ...tabular },

  /**
   * The design's search field: the iOS system fill at control radius. Not a
   * bordered box — `color.fill` is Apple's own neutral, and it is what makes a
   * field read as a system control rather than a drawn rectangle.
   */
  search: {
    ...text.base,
    color: color.ink,
    backgroundColor: color.fill,
    borderRadius: radius.control,
    borderCurve: "continuous",
    minHeight: target.min,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },

  /** 2×2. `space.md` is the 4px scale's nearest step to the design's 10. */
  grid: { gap: space.md },
  gridRow: { flexDirection: "row", gap: space.md },

  list: { overflow: "hidden" },
  row: {
    minHeight: ROW_H,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.md,
  },
  rowBody: { flex: 1, gap: space.xs },
  rowName: { ...text.base, color: color.ink },
  rowState: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  rowDot: { height: text.meta.lineHeight as number, justifyContent: "center" },
  /**
   * `ink2`, matching `Advisory.reason` — the state's colour lives in the dot's
   * shape, and a reason line tinted by its own severity is how a description
   * turns into an instruction (non-negotiable #5).
   */
  rowReason: { ...text.meta, color: color.ink2, flex: 1 },
  /** Same size and weight as the reason beside it. Only the colour differs. */
  rowFlag: { ...text.meta },
  rowWeek: { ...text.statInline, color: color.muted },
  /** Same size and position as a real figure, so the column still aligns. */
  rowWeekAbsent: { ...text.statInline, color: color.unknown },
  separator: {
    position: "absolute",
    left: layout.cardPadding,
    right: 0,
    bottom: 0,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },

  avatar: {
    backgroundColor: color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...text.meta, color: color.ink2 },

  emptyTitle: { ...text.base, color: color.ink },
  emptyBody: { ...text.meta, color: color.muted, marginTop: space.xs },
  stale: { ...text.meta, color: color.muted },

  retry: {
    minHeight: target.min,
    justifyContent: "center",
    marginTop: space.md,
  },
  retryLabel: { ...text.baseSemi, color: color.brandText },

  skeleton: {
    backgroundColor: color.well,
    borderRadius: radius.card,
    borderCurve: "continuous",
  },
  skeletonSearch: { height: target.min },
  skeletonTile: { flex: 1, height: ROW_H + space.xl },
});
