/**
 * One athlete, opened from the roster row.
 *
 * ── WHOSE DATA THIS IS ─────────────────────────────────────────────────────
 *
 * visual-spec § "Coach dashboard" names this the thing that must never be
 * misread: "Athlete name is sticky at the top of any detail surface, display 19,
 * full contrast, with the roster photo or initials adjacent. Never rely on the
 * user remembering which row they clicked." So the identity block reads its name
 * from the PAYLOAD, never from a route param or a roster row handed across the
 * push — the id in the URL is the request, and the name is the answer. And it
 * fails closed: an athlete that cannot be resolved renders a state that says
 * what is unavailable rather than partial data under an unconfirmed name.
 *
 * ── WHAT THE DESIGN DRAWS THAT THIS DOES NOT ───────────────────────────────
 *
 *  1. `700 22px` for the name. `text.title` (19 display) instead — the size the
 *     spec itself specifies for this exact element, and the rank the app already
 *     has. docs/design-port.md #18 records why a one-off 22 display rank is not
 *     minted for a single string.
 *  2. The avatar hue. Same reason as on the roster: § "Tokens" rations colour
 *     and an arbitrary hue cannot be contrast-checked. 56 is
 *     `target.min + space.sm`, off the 4px scale, as design-port #22 composes
 *     the profile avatar's 60.
 *  3. `readiness` anywhere. The payload carries it and the design has no slot
 *     for it, which is the right answer for a reason worth writing down:
 *     § "Status and advisory" says "there is no composite score anywhere… if a
 *     component would render a single number that summarises the athlete, it's
 *     the wrong component", and `readinessScore` returns a confident 100 from no
 *     data at all. It is the athlete's own number, on the athlete's own phone.
 *  4. `insights`. Also in the payload, also not rendered: those sentences are
 *     written in the second person for the athlete to read, and the coach route
 *     already excludes `prePractice.athleteReason` for exactly that reason —
 *     "the same observation reworded for the athlete's own screen; sending it to
 *     a coach app invites it to be read out as if it were addressed to them".
 *  5. Every figure in the mock is a literal. `28` in the load eyebrow is the
 *     count of points actually present, the bar heights are `series[].load`, and
 *     the flag rows are the payload's own rows.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";

import { Advisory } from "../../../components/Advisory";
import { Card } from "../../../components/Card";
import { Absent } from "../../../components/Nothing";
import { Section } from "../../../components/Section";
import { getCoachAthlete, type CoachAthleteDetail } from "../../../lib/api";
import { dayLabel } from "../../../lib/dates";
import type { Flag } from "../../../lib/types";
import { fmtMiles } from "../../../lib/units";
import { useScreenHeader } from "../../../theme/header";
import { dim } from "../../../theme/press";
import { layout, radius, ruleWidth, space, target } from "../../../theme/space";
import { color } from "../../../theme/tokens";
import { font, tabular, text } from "../../../theme/type";

/** The identity avatar. `target.min + space.sm` — the design's 56, off the scale. */
const AVATAR = target.min + space.sm;

/**
 * The bar rail. The design draws 84; `target.min + space.xxl` is 80 and comes
 * off the 4px scale, which app/CLAUDE.md makes the single source for a size.
 */
const RAIL_H = target.min + space.xxl;

/** How many days of load the rail shows, at most. The design's 28. */
const LOAD_DAYS = 28;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * "Grade 11 · Intermediate", and neither half is assumed.
 *
 * THE TIER IS GATED ON `fitness.weekly.length`, not on `hasActivityHistory`.
 * `computeFitness` builds `weekly` only from weeks holding more than 5 km of
 * runs longer than 2 km and then falls back to `score = 50` when it is empty —
 * and 50 buckets to "Intermediate". One short run opens the
 * `hasActivityHistory` gate while that fallback is still firing, so an athlete
 * who has never really trained is labelled a tier as a plain stated fact. This
 * is the same gate docs/design-port.md #26 applies to the athlete's own profile,
 * and it matters more here: a coach reads a tier as a judgement they can act on.
 */
function metaLine(d: CoachAthleteDetail): string {
  const grade = d.athlete.grade != null ? `Grade ${d.athlete.grade}` : "Grade not recorded";
  const tierKnown = (d.fitness?.weekly.length ?? 0) > 0;
  const tier = tierKnown && d.fitness ? d.fitness.tier : "tier not yet computed";
  return `${grade} · ${tier}`;
}

/* ------------------------------------------------------------------ *
 * Needs a look
 * ------------------------------------------------------------------ */

/**
 * The pre-practice advisory, with the one downgrade this app owes it.
 *
 * `prePracticeFlag` returns `clear · "Nothing in today's check-in or recovery
 * data stands out."` for an athlete it has never heard from — vacuously true,
 * and on a coach surface it reads as an all-clear. The predicate here is
 * DELIBERATELY THE SAME ONE `(tabs)/roster.tsx` uses: the roster route's own
 * comment warns that "the phone must never show a coach a different state than
 * the web does for the same athlete", and two screens in one app disagreeing
 * about one athlete is worse than either being wrong alone.
 */
function advisoryOf(d: CoachAthleteDetail): { flag: Flag; reason: string } {
  // The route always sends one, but it costs nothing to fail closed rather than
  // render an advisory-shaped hole if it ever stops.
  if (!d.prePractice) {
    return {
      flag: "unknown",
      reason: "The server sent no pre-practice reading for this athlete.",
    };
  }
  const nothingKnown = !d.risk.selfReport.hasData && !d.risk.hasActivityHistory;
  if (d.prePractice.flag === "clear" && nothingKnown) {
    return {
      flag: "unknown",
      reason:
        "No check-in and no runs have ever arrived for this athlete, so there is nothing to read yet.",
    };
  }
  return { flag: d.prePractice.flag, reason: d.prePractice.reason };
}

/**
 * `body` is a NODE, not a string, for the reason `SectionProps.note` is one: it
 * frequently carries a figure, and every numeral in this app is mono and tabular
 * with its unit welded into a single node. A joined sentence would set the
 * distances in the body face and lose the split between the two voices.
 */
type LookRow = { key: string; body: ReactNode; detail?: ReactNode };

/**
 * The rows under "Needs a look", after the advisory — each one a fact the
 * payload actually carries.
 *
 * PAST TENSE AND DESCRIPTIVE, never an instruction (non-negotiable #5), and
 * never phrased as a diagnosis (CLAUDE.md § Safety). None of them wears a status
 * dot: the four dot shapes are the ENGINE'S four advisory states, and putting
 * one beside an injury a coach typed in would mint a fifth verdict the engine
 * never issued.
 */
function lookRows(d: CoachAthleteDetail): LookRow[] {
  const rows: LookRow[] = [];

  // The most recent run that ran markedly longer than this athlete's own recent
  // long runs. `pctAbove` and both distances come off the payload.
  const spiked = (d.recentRuns ?? []).find((r) => r.spike !== null);
  if (spiked?.spike) {
    const sp = spiked.spike;
    rows.push({
      key: `spike-${spiked.id}`,
      body: (
        <>
          {"One run went "}
          <Text style={styles.figure}>{fmtMiles(sp.km)}</Text>
          {", "}
          <Text style={styles.figure}>{`${Math.round(sp.pctAbove)}%`}</Text>
          {" above their recent longest of "}
          <Text style={styles.figure}>{fmtMiles(sp.longestKm)}</Text>
          {"."}
        </>
      ),
      detail: <Text style={styles.figure}>{dayLabel(spiked.date)}</Text>,
    });
  }

  // Injuries the coach has logged and not closed. `body_part` arrives in the
  // injury storage format, side baked in ("achilles (right)"), so it is printed
  // as stored rather than parsed and re-spelled.
  for (const inj of (d.injuries ?? []).filter((i) => i.resolved_at === null)) {
    rows.push({
      key: `injury-${inj.id}`,
      body: inj.note ? `${inj.body_part} — ${inj.note}` : inj.body_part,
      detail: (
        <>
          {"logged "}
          <Text style={styles.figure}>{dayLabel(inj.date)}</Text>
        </>
      ),
    });
  }

  // Observations, copied as observations. `engine.ts` computes both from this
  // athlete's own load history.
  if (d.patterns?.overreaching) {
    rows.push({
      key: "overreaching",
      body: (
        <>
          {"Their recent load has run above their own usual for "}
          <Text style={styles.figure}>{`${d.patterns.highEffortStreak} days`}</Text>
          {" in a row."}
        </>
      ),
    });
  }
  if (d.patterns?.undertraining) {
    rows.push({
      key: "undertraining",
      body: "Their recent load has run below their own usual for this point in the season.",
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ *
 * Daily load
 * ------------------------------------------------------------------ */

/** One day of the rail. Only the two fields it draws from. */
type LoadPoint = { date: string; load: number };

/**
 * The daily load series, still read defensively now that the type names it.
 *
 * `series` is declared on `Profile` (and so on `CoachAthleteDetail`, which is
 * derived from it), so the casts this used to need are gone. The per-point check
 * stays: `lib/api.ts` opens by saying a type is not a fence across HTTP, and the
 * consequence of trusting one here is not a crash but a WRONG PICTURE — a point
 * with a missing `load` would plot as a bar of height zero, and a zero bar in
 * this rail means a measured rest day. A point that is not a point is dropped,
 * and an empty result renders `Absent` rather than a flat month.
 *
 * Only the top-level copy. `risk.series` is the full-width one and this route
 * excludes it deliberately, so there is nothing to fall back to.
 */
function loadSeries(d: CoachAthleteDetail): LoadPoint[] {
  const out: LoadPoint[] = [];
  for (const p of d.series ?? []) {
    if (typeof p?.date === "string" && Number.isFinite(p.load)) {
      out.push({ date: p.date, load: p.load });
    }
  }
  return out;
}

function LoadRail({ series }: { series: LoadPoint[] }) {
  const days = series.slice(-LOAD_DAYS);
  const peak = days.reduce((m, p) => Math.max(m, p.load), 0);

  // Every point present and every one of them zero. `dailySeries` pre-fills a
  // slot for every date before bucketing a single activity, so this is NOT a
  // month of measured rest — it is a month we know nothing about, and drawing 28
  // flat bars would render an unknown as a fact. See lib/types.ts on `calendar`.
  if (!days.length || peak <= 0) {
    return (
      <Absent label="No daily load has been recorded for this athlete yet." />
    );
  }

  const heaviest = days.reduce((m, p) => (p.load > m.load ? p : m), days[0]);

  return (
    <Card>
      <View
        style={styles.rail}
        accessibilityRole="image"
        accessibilityLabel={`Daily load over ${days.length} days. The heaviest day was ${dayLabel(
          heaviest.date
        )}.`}
      >
        {days.map((p) => (
          <View key={p.date} style={styles.railSlot}>
            <View
              style={[
                styles.bar,
                // A day with no run gets no bar at all, rather than a 1px stub
                // that would read as a small amount of training.
                { height: p.load > 0 ? `${(p.load / peak) * 100}%` : 0 },
              ]}
            />
          </View>
        ))}
      </View>
      {/* Verbatim from the design, and the one sentence on this screen that is
          load-bearing rather than descriptive. */}
      <Text style={styles.caption}>
        Bars, not a score. There is no risk ranking in RunGuard.
      </Text>
      {/* The design has no equivalent, and it needs one: the series cannot
          express "we have no record of that day" (lib/types.ts), so the absence
          of a bar has to be named or it reads as a rest day. */}
      <Text style={styles.captionNote}>
        A day with no bar had no run recorded — which is not the same as a rest
        day.
      </Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export default function CoachAthleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const athleteId = Number(id);
  /*
   * "Athlete", not the design's "Roster".
   *
   * theme/header.ts pins `headerBackTitle` to "Back" across every pushed screen
   * in the app, with its reason written down: the native default echoes the
   * previous screen's title and "reads as a second, competing title next to the
   * real one". That file is the single source for the header and this screen is
   * not the place to make one exception to it, so the design's "Roster" label
   * does not ship. The title carries the screen's identity instead.
   */
  const header = useScreenHeader("Athlete");

  const [detail, setDetail] = useState<CoachAthleteDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!Number.isInteger(athleteId)) {
        setFailed("That is not an athlete id this app can ask for.");
        return;
      }
      if (isRefresh) setRefreshing(true);
      try {
        setDetail(await getCoachAthlete(athleteId));
        setFailed(null);
      } catch (err) {
        // `ApiError.message` is the server's own sentence. Never the raw thrown
        // value, which can echo a request carrying the coach's Bearer.
        setFailed(
          err instanceof Error ? err.message : "This athlete could not be loaded."
        );
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [athleteId]
  );

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

  const advisory = useMemo(() => (detail ? advisoryOf(detail) : null), [detail]);
  const rows = useMemo(() => (detail ? lookRows(detail) : []), [detail]);
  const series = useMemo(() => (detail ? loadSeries(detail) : []), [detail]);

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Stack.Screen options={header} />
        <View style={styles.page}>
          {failed ? (
            /* Fails closed: no name, no partial data, and a sentence naming
               what is unavailable. visual-spec § "Coach dashboard". */
            <Card>
              <Text style={styles.emptyTitle}>This athlete could not be loaded.</Text>
              <Text style={styles.emptyBody}>{failed}</Text>
              <Pressable
                onPress={() => void load(false)}
                accessibilityRole="button"
                accessibilityLabel="Try loading this athlete again"
                style={({ pressed }) => [styles.retry, dim(pressed)]}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </Card>
          ) : (
            // Skeletons at the final height. No name is guessed from the row the
            // coach tapped: an unconfirmed name on this screen is the failure
            // the whole surface is built to avoid.
            <View style={styles.sections}>
              <View style={[styles.skeleton, { height: AVATAR }]} />
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View style={[styles.skeleton, { height: RAIL_H }]} />
              <View style={[styles.skeleton, styles.skeletonHeading]} />
              <View style={[styles.skeleton, { height: RAIL_H + layout.section }]} />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={header} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
      >
        <View style={styles.sections}>
          {/* Identity. Name from the payload, at the top, in full contrast. */}
          <View style={styles.identity}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initialsOf(detail.athlete.name)}</Text>
            </View>
            <View style={styles.identityBody}>
              <Text style={styles.name} accessibilityRole="header">
                {detail.athlete.name}
              </Text>
              <Text style={styles.meta}>{metaLine(detail)}</Text>
            </View>
          </View>

          <Section label="Needs a look">
            <Card>
              {advisory ? (
                <Advisory flag={advisory.flag} reason={advisory.reason} />
              ) : null}
              {rows.map((r) => (
                <View key={r.key} style={styles.lookRow}>
                  <Text style={styles.lookBody}>{r.body}</Text>
                  {r.detail ? <Text style={styles.lookDetail}>{r.detail}</Text> : null}
                </View>
              ))}
              {/* The note row the design draws under the flags. It is the same
                  sentence CLAUDE.md § Safety requires of every coach surface. */}
              <Text style={styles.note}>
                RunGuard describes what it observed. It does not rank athletes,
                and none of this is a diagnosis.
              </Text>
            </Card>
          </Section>

          {/* The count is the number of points that actually arrived, not the
              design's literal 28 — a 12-point rail labelled "28 days" is a
              hardcoded mock number with extra steps. */}
          <Section label={`Daily load · ${Math.min(series.length, LOAD_DAYS)} days`}>
            <LoadRail series={series} />
          </Section>

          {failed ? (
            <Text style={styles.stale}>
              This is the last version that loaded. {failed}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  sections: { gap: layout.section },

  identity: { flexDirection: "row", alignItems: "center", gap: space.lg },
  identityBody: { flex: 1, gap: space.xs },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...text.base, color: color.ink2 },
  /** display 19, the rank visual-spec § "Coach dashboard" names for this. */
  name: { ...text.title, color: color.ink },
  meta: { ...text.meta, color: color.muted },

  /** Separated from the advisory above by a hairline, as the design's rows are. */
  lookRow: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: ruleWidth,
    borderTopColor: color.ruleSoft,
    gap: space.xs,
  },
  lookBody: { ...text.base, color: color.ink },
  /**
   * A figure inside one of those sentences. Nested in the surrounding `Text`, so
   * it inherits that line's size, leading and colour and changes only the face —
   * the rule type.ts states flatly: if it is a number, it is mono and tabular,
   * prose included. `login.tsx` carries the identical style.
   */
  figure: { fontFamily: font.mono, ...tabular },
  lookDetail: { ...text.meta, color: color.muted },
  note: { ...text.meta, color: color.muted, marginTop: space.md },

  /** The rail. `flex: 1` bars in a fixed-height row, as the design draws it. */
  rail: {
    height: RAIL_H,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xs,
    backgroundColor: color.well,
    borderRadius: radius.chip,
    borderCurve: "continuous",
    padding: space.sm,
  },
  railSlot: { flex: 1, height: "100%", justifyContent: "flex-end" },
  /**
   * `brand` and not `brandText`: this is a SHAPE, and tokens.ts is explicit that
   * the fill is for bars and dots while the `…Text` twin is for glyphs.
   */
  bar: {
    backgroundColor: color.brand,
    borderTopLeftRadius: radius.mark,
    borderTopRightRadius: radius.mark,
  },
  caption: { ...text.meta, color: color.ink2, marginTop: space.md },
  captionNote: { ...text.meta, color: color.muted, marginTop: space.xs },

  emptyTitle: { ...text.base, color: color.ink },
  emptyBody: { ...text.meta, color: color.muted, marginTop: space.xs },
  stale: { ...text.meta, color: color.muted },

  retry: { minHeight: target.min, justifyContent: "center", marginTop: space.md },
  retryLabel: { ...text.baseSemi, color: color.brandText },

  skeleton: {
    backgroundColor: color.well,
    borderRadius: radius.card,
    borderCurve: "continuous",
  },
  skeletonHeading: { height: text.micro.lineHeight as number, width: "45%" },
});
