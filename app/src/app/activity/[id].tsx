/**
 * One run, opened on its own. A STACK route, not a tab — it is pushed from the
 * run log, and it is inside `Stack.Protected guard={signedIn}` in the root
 * layout, so it does not exist in the tree while signed out.
 *
 * Mirrors the facts of `website/src/app/athlete/activity/[id]/page.tsx` — source,
 * distance, time, average pace, average and max heart rate, elevation, calories,
 * cadence, type, the start, and the GPS trace — in this app's visual language.
 *
 * WHY THIS SCREEN FETCHES FOR ITSELF. `getActivity` is a single-record read
 * keyed by a route param; it is not part of `/api/mobile/me` and so has nothing
 * to take from `lib/profileStore`. It therefore owns its loading, its failure,
 * and its 401 — and the 401 branch follows the store's rule rather than
 * chat.tsx's: `isUnauthorized` is tested FIRST and `signOut()` is called
 * UNGUARDED, because a revoked token must end the session whether or not this
 * screen is still mounted. Only the local setState calls are guarded by `alive`.
 *
 * WHY A MISSING RUN IS WORDED THE WAY IT IS. The endpoint answers 404 for a run
 * that does not exist AND for another athlete's run, deliberately and
 * indistinguishably (see the route handler's comment: a 403 would confirm that a
 * given id is a real athlete's real run, which turns sequential ids into an
 * enumeration oracle for someone else's training history). So the copy below
 * must not say "not found" in a way that implies the run exists and is merely
 * private — it says the server does not distinguish, which is the truth.
 *
 * EVERY NULLABLE IS "NOT RECORDED", NEVER ZERO. A run with no HR strap has
 * `avgHr: null` and renders through `Absent` — dashed, `—`, "Not recorded". A
 * run that genuinely measured nothing renders through `Zero`, which is a fact
 * and looks like every other fact. See docs/visual-spec.md § "Three kinds of
 * nothing".
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { Card } from "../../components/Card";
import { Absent, Zero } from "../../components/Nothing";
import { Panel } from "../../components/Panel";
import { Section } from "../../components/Section";
import { Stat } from "../../components/Stat";
import { ApiError, getActivity, isUnauthorized } from "../../lib/api";
import { dayLabel, localDay, timeLabel } from "../../lib/dates";
import { useSession } from "../../lib/session";
import type { ActivityDetail, RoutePoint } from "../../lib/types";
import { fmtDuration, formatPaceFromKmPace, ftNumFromMeters, miNumFromMeters } from "../../lib/units";
import { useScreenHeader } from "../../theme/header";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";
import { layout, radius, space } from "../../theme/space";

/**
 * A nullable server figure → a whole number, or null.
 *
 * Null stays null: it means NOT RECORDED and must reach `Absent`. A non-finite
 * value is not a measurement either, so it becomes null rather than `NaN bpm`.
 */
function rounded(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

/**
 * The start, explicit and local: "TUE 14 OCT · 6:12AM".
 *
 * This is the one payload in the app that carries a time of day, and
 * non-negotiable #2 still governs it — the day is always spelled out, and both
 * halves are composed here from lib/dates rather than derived in a component.
 * Null when the stored datetime will not parse, which renders `Absent`: a start
 * we cannot read is not a start we may guess at.
 */
function startLabel(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${dayLabel(localDay(d))} · ${timeLabel(d)}`;
}

/* ------------------------------------------------------------------ *
 * The route map
 * ------------------------------------------------------------------ */

/**
 * The drawing's own coordinate space, not device pixels — the `<Svg>` below is
 * laid out by `aspectRatio`, and these numbers only ever divide into each other.
 * The 600 × 320 box and its 20-unit inset mirror the website's map so the two
 * surfaces frame a route identically.
 */
const VIEW = { w: 600, h: 320, pad: 20 } as const;

/** Stroke width in those same viewBox units, so it scales with the drawing. */
const STROKE = 3;

/**
 * `{lat, lng}` points → an SVG path, normalised into `VIEW`.
 *
 * Scaled UNIFORMLY on both axes, unlike the website, which stretches each axis
 * to fill its box. A route stretched to fit is a wrong picture of where someone
 * ran — an out-and-back drawn as a loop — and the phone frames it at a different
 * aspect ratio from the web anyway, so it has to normalise for itself regardless
 * (the route handler's docblock says as much). Longitude is multiplied by
 * cos(latitude) first, because a degree of longitude is shorter than a degree of
 * latitude everywhere but the equator.
 *
 * Null when there is no line to draw: fewer than two usable points, or every
 * point at the same place. A dot is not a route, and an empty box would read as
 * a route with no distance — the caller says "not recorded" instead.
 */
function routePath(points: RoutePoint[]): string | null {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) return null;

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const shrink = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanY = maxLat - minLat;
  const spanX = (maxLng - minLng) * shrink;
  if (spanX <= 0 && spanY <= 0) return null;

  const innerW = VIEW.w - 2 * VIEW.pad;
  const innerH = VIEW.h - 2 * VIEW.pad;
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? innerH / spanY : Number.POSITIVE_INFINITY
  );
  // Centre the drawn extent, since uniform scaling leaves slack on one axis.
  const offX = VIEW.pad + (innerW - spanX * scale) / 2;
  const offY = VIEW.pad + (innerH - spanY * scale) / 2;

  return pts
    .map((p, i) => {
      const x = offX + (p.lng - minLng) * shrink * scale;
      // maxLat first, so north is up rather than mirrored.
      const y = offY + (maxLat - p.lat) * scale;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * The trace, or the honest absence of one.
 *
 * The DRAWING brings its own `Card`; the absence deliberately does not. Its
 * section label now sits outside and above (see `Detail`), and `Absent` is
 * already a surface of its own — a dashed slot framed inside a white card would
 * be two surfaces for one hole.
 *
 * NOTHING WRITES THE `route` COLUMN TODAY — not the live sync, not the Apple
 * export path — so every row in the database has `route IS NULL` and this
 * renders its fallback for every run the app can currently open, exactly as the
 * website's own page does. The drawing above is not dead code: it is what runs
 * the day an ingest path starts storing points.
 *
 * The fallback is `Absent`, not a bordered empty box. "No route" is a thing we
 * do not know about the run, and in this app not-knowing is dashed.
 */
function RouteMap({ route }: { route: RoutePoint[] | null }) {
  const path = route === null ? null : routePath(route);

  if (path === null) return <Absent label="GPS route not recorded for this run." />;

  return (
    <Card>
      <View style={styles.map}>
        <Svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          width="100%"
          height="100%"
          accessibilityRole="image"
          accessibilityLabel="The GPS route of this run."
        >
          <Path
            d={path}
            fill="none"
            // A FILL token on a shape, never a glyph — see theme/tokens.ts.
            stroke={color.brand}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Cells
 * ------------------------------------------------------------------ */

/**
 * One metric. THE decision, made once: a null is a hole, a measured zero is a
 * fact, and anything else is a figure with its unit welded on.
 *
 * `value` arrives ALREADY in the unit it will be shown in, so the zero test is
 * made on what the athlete actually reads: 0.1 m of climb is zero whole feet,
 * and printing "0 ft" as an ordinary figure while `Zero` exists for exactly that
 * is how the three kinds of nothing start drifting into each other.
 */
function Metric({
  label,
  value,
  unit,
  format,
}: {
  label: string;
  /** Null means NOT RECORDED. Never coalesce it to 0. */
  value: number | null;
  /** Welded to the zero by `Zero` itself, e.g. "bpm" → "0 bpm". */
  unit: string;
  /** Formats a non-zero value WITH its unit welded on. Defaults to `v unit`. */
  format?: (v: number) => string;
}) {
  if (value === null) return <Absent eyebrow={label} />;
  if (value === 0) return <Zero eyebrow={label} unit={unit} />;
  return <Stat label={label} value={format ? format(value) : `${value} ${unit}`} />;
}

/**
 * A cell holding a WORD rather than a figure — the activity type.
 *
 * Deliberately not `Stat`, whose value is mono: mono is for numerals, and a word
 * set in the figure face reads as data it is not. An empty type renders absent
 * rather than falling back to "Run", because the app does not get to decide what
 * kind of session someone did.
 */
function Words({ label, value }: { label: string; value: string | null }) {
  if (value === null) return <Absent eyebrow={label} />;
  return (
    <View>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellWord}>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

type Load =
  | { state: "loading" }
  | { state: "ready"; activity: ActivityDetail }
  /** 404, or an id that is not a positive integer — the same answer either way. */
  | { state: "missing" }
  /** Transport failure or a 5xx. A fact about the network, not about the run. */
  | { state: "failed" }
  /** 401. The session is over; `signOut()` has been called. */
  | { state: "signedOut" };

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { signOut } = useSession();
  /**
   * The answer, TAGGED WITH THE ID IT ANSWERS FOR. Carrying the id is what lets
   * everything else be derived during render rather than reset by an effect: a
   * result for a run the screen is no longer showing is simply not this run's
   * answer, so it can never be rendered under the new id's heading.
   */
  const [answer, setAnswer] = useState<{ id: number; load: Load } | null>(null);

  /*
   * `Number("")` is 0 and `Number(" 7 ")` is 7, so the param is pattern-matched
   * rather than coerced. An id that is not a run id is not a request worth
   * making, and it lands on the same copy a 404 does — which is correct, since
   * the endpoint cannot tell the athlete any more than that either.
   */
  const activityId = typeof id === "string" && /^[0-9]+$/.test(id) ? Number(id) : null;

  const load: Load =
    activityId === null
      ? { state: "missing" }
      : answer !== null && answer.id === activityId
        ? answer.load
        : { state: "loading" };

  useEffect(() => {
    if (activityId === null) return;
    let alive = true;
    const settle = (next: Load) => {
      if (alive) setAnswer({ id: activityId, load: next });
    };
    getActivity(activityId)
      .then((activity) => {
        settle({ state: "ready", activity });
      })
      .catch((err: unknown) => {
        /*
         * FIRST, and unguarded by `alive` — the rule lib/profileStore states and
         * calendar.tsx once got wrong. A revoked token has to end the session
         * even if this screen was swiped away before the answer arrived.
         */
        if (isUnauthorized(err)) {
          void signOut();
          settle({ state: "signedOut" });
          return;
        }
        // 404 is BOTH "no such run" and "not yours" — the route answers the same
        // for either on purpose. Anything else is the network or the server.
        settle({
          state: err instanceof ApiError && err.status === 404 ? "missing" : "failed",
        });
      });
    return () => {
      alive = false;
    };
  }, [activityId, signOut]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={useScreenHeader("Run")} />
      <ScrollView contentContainerStyle={styles.page}>
        {load.state === "ready" ? (
          <Detail activity={load.activity} />
        ) : load.state === "loading" ? (
          <Panel title="This run" note="Opening">
            <Text style={styles.plain}>Reading it from your server.</Text>
          </Panel>
        ) : load.state === "signedOut" ? (
          <Panel title="This run" note="Signed out">
            <Text style={styles.plain}>
              This device is no longer signed in, so this run cannot be opened. Sign in
              again to see your runs.
            </Text>
          </Panel>
        ) : load.state === "failed" ? (
          <Panel title="This run" note="Could not load">
            <Text style={styles.plain}>
              Could not reach your server, so this run could not be opened. It will be
              here when the connection is.
            </Text>
          </Panel>
        ) : (
          /* Not "this run is private": see the file header. The server gives one
             answer to two different questions, and the copy says so rather than
             implying which one applies. */
          <Panel title="Not in your log" note="Nothing to show">
            <Text style={styles.plain}>
              RunGuard could not open this run. It may not exist, or it may belong to
              another athlete — your server answers the same way for both, so there is
              nothing more it can tell you. The runs you can open are in your run log.
            </Text>
          </Panel>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ activity }: { activity: ActivityDetail }) {
  const started = startLabel(activity.startTime);
  // Optional-chained even though `type` is declared non-nullable: a declared
  // field the route stops sending arrives `undefined` and typechecks clean, and
  // `.trim()` on it would white-screen the whole run rather than dash one cell.
  const title = activity.name?.trim() || activity.type?.trim() || "This run";
  const type = activity.type?.trim() || null;

  // Server-derived, with the divide-by-zero guard the web page has. Never
  // re-derived here: a screen dividing for itself has to rediscover that a
  // zero-distance run has no pace, and one that forgot would print "0:00 /mi".
  const pace =
    activity.avgPaceSecPerKm === null ? null : formatPaceFromKmPace(activity.avgPaceSecPerKm);

  // The same finiteness test `rounded` applies to the nullable figures, for the
  // two that are declared non-nullable. A route that stops sending one of them
  // hands over `undefined`, and `NaN mi` / `NaN:NaN` are not measurements — a
  // figure we cannot read is absent, never a number and never a zero.
  const distanceMi = Number.isFinite(activity.distanceM)
    ? miNumFromMeters(activity.distanceM)
    : null;
  const durationS = Number.isFinite(activity.durationS) ? activity.durationS : null;

  const elevationFt =
    activity.elevationGainM === null || !Number.isFinite(activity.elevationGainM)
      ? null
      : ftNumFromMeters(activity.elevationGainM);

  return (
    <>
      {/* Composed by `startLabel` from lib/dates: explicit, local, and already a
          string before it reaches a component (non-negotiable #2). */}
      {started ? <Text style={styles.started}>{started}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {/*
        The design's subtitle — provenance stated as a sentence under the title,
        where this screen carried it as a badge in the opposite corner. One line
        of prose says the same thing without a second object in the head, and it
        is what the design does.

        `sourceLabel` is mapped by the server. The raw `source` key is never
        printed, and never re-mapped here — one mapping, two surfaces.
      */}
      <Text style={styles.source}>{`From ${activity.sourceLabel}`}</Text>
      {started === null ? (
        <View style={styles.startAbsent}>
          <Absent eyebrow="Started" label="Start time not recorded" />
        </View>
      ) : null}

      {/*
        Distance / Time / Pace, always those three, always in that order, and
        THREE-UP in a single row — the same shape `RunCard` gives them in the run
        log, so a run reads identically in the list and on its own screen.

        This was a 2 × 2 with a hard-coded empty fourth cell. A hole in a stats
        grid is precisely the thing the three-kinds-of-nothing rule exists to
        forbid: at arm's length an empty slot beside "Avg pace" is unreadable as
        "there is no fourth metric" and reads instead as a metric that failed to
        arrive. Absent is dashed and says so; nothing else in this app is allowed
        to imply a missing figure.
      */}
      <View style={styles.section}>
        <Card>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Metric
                label="Distance"
                value={distanceMi}
                unit="mi"
                format={(mi) => `${mi} mi`}
              />
            </View>
            <View style={styles.cell}>
              <Metric
                label="Time"
                value={durationS}
                unit="min"
                format={fmtDuration}
              />
            </View>
            <View style={styles.cell}>
              {/* A pace that was never run is absent — never "0:00 /mi". */}
              {pace === null ? (
                <Absent eyebrow="Avg pace" />
              ) : (
                <Stat label="Avg pace" value={pace} />
              )}
            </View>
          </View>
        </Card>
      </View>

      {/*
        DELIBERATELY NOT a grouped `List`. These read as key/value rows, but five
        of the six are nullable and render `Absent` — a dashed, filled, padded
        slot. `ListRow`'s `detail` is a `Text`, so an Absent cannot go in one,
        and the only ways to force it are to flatten a not-recorded HR into a
        muted "—" (collapsing absent into an ordinary value, non-negotiable #4)
        or to copy List's internals in here. Both are worse than a grid.
      */}
      <Section label="Details" style={styles.section}>
        <Card>
          <View style={styles.grid}>
            <View style={styles.row}>
              <View style={styles.cell}>
                <Metric label="Avg HR" value={rounded(activity.avgHr)} unit="bpm" />
              </View>
              <View style={styles.cell}>
                <Metric label="Max HR" value={rounded(activity.maxHr)} unit="bpm" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.cell}>
                <Metric label="Elevation" value={elevationFt} unit="ft" />
              </View>
              <View style={styles.cell}>
                <Metric label="Calories" value={rounded(activity.calories)} unit="kcal" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.cell}>
                <Metric label="Cadence" value={rounded(activity.cadence)} unit="spm" />
              </View>
              <View style={styles.cell}>
                <Words label="Type" value={type} />
              </View>
            </View>
          </View>
        </Card>
      </Section>

      <Section label="Route" style={styles.section}>
        <RouteMap route={activity.route} />
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
  },

  /** Mono, because it is figures. ink, not muted: this is the run's identity. */
  started: { ...text.micro, color: color.ink },
  title: { ...text.title, color: color.ink, marginTop: space.sm },
  /** The subtitle under the title. Prose, muted — a caption, not a badge. */
  source: { ...text.meta, color: color.muted, marginTop: space.xs },
  startAbsent: { marginTop: space.md },

  section: { marginTop: layout.section },

  plain: { ...text.base, color: color.ink2 },

  /**
   * A row of equal cells — three for the headline stats, two in Details.
   * Top-aligned, because a dashed slot is taller than a figure.
   */
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  /**
   * The Details rows. `gap` lives here rather than as a `marginTop` on every
   * row but the first: the label naming this block now sits outside the card,
   * so the card holds one child and a row margin would have nothing to
   * compound against but the card's own padding.
   */
  grid: { gap: space.lg },
  cell: { flex: 1 },

  /** `Words`: the micro-label of a Stat, then prose rather than a numeral. */
  cellLabel: { ...text.micro, color: color.muted },
  cellWord: { ...text.baseSemi, color: color.ink, marginTop: space.xs },

  /** Clips the trace to the card radius; the aspect comes from the viewBox. */
  map: {
    aspectRatio: VIEW.w / VIEW.h,
    width: "100%",
    borderRadius: radius.card,
    borderCurve: "continuous",
    backgroundColor: color.well,
    overflow: "hidden",
  },
});
