import { localDay, localDayOffset } from "./day";
import { all } from "./db/driver";
import {
  getAthlete,
  getTeam,
  athletesForTeam,
  activitiesForAthlete,
  metricsForAthlete,
  checkinsForAthlete,
  sorenessForCheckin,
  sorenessHistory,
  raceResultsForAthlete,
  injuriesForAthlete,
  goalsForAthlete,
  upcomingRaces,
  teamPlanDays,
  AthleteRow,
  ActivityRow,
  CheckinRow,
  RaceRow,
} from "./db";
import {
  computeRisk,
  dailySeries,
  sessionSpike,
  detectEnergyDecline,
  DailyPoint,
  RiskSnapshot,
  SessionSpike,
  EnergyTrend,
} from "./risk";
import { paceTrend, personalStats, athleteInsights } from "./athleteView";
import {
  loadMetrics,
  detectPatterns,
  computeFitness,
  predictRaces,
  pacingStrategy,
  weeklyPlan,
  planAdjustment,
  prePracticeFlag,
  readinessScore,
  SorenessEntry,
  aiInsight,
  buildNotifications,
  computeBadges,
  compareToPeers,
  illnessFlag,
  personalRecords,
  sleepTrend,
  mentalTrend,
  fmtTime,
  EVENTS,
  EventName,
  LoadMetrics,
  Patterns,
  Fitness,
  Predictions,
  PlanDay,
  PlanAdjustment,
  PrePractice,
  Notification,
  Badge,
  Comparison,
  SleepDay,
  MentalDay,
} from "./engine";

const DAY_MS = 86400000;

export type PRRecord = { event: EventName; timeS: number; label: string } | { event: EventName; timeS: null; label: string };

export type CoreProfile = {
  athlete: { id: number; name: string; grade: number | null; school: string; events: string[]; hue: number; deviceToken: string | null; teamName: string | null };
  risk: RiskSnapshot;
  series: DailyPoint[];
  yearDays: { date: string; load: number; km: number }[];
  readiness: number;
  aiInsight: string;
  load: LoadMetrics;
  patterns: Patterns;
  fitness: Fitness;
  predictions: Predictions;
  prs: PRRecord[];
  plan: { days: PlanDay[]; taperMode: boolean; taperCountdown: number | null; adjustment: PlanAdjustment };
  prePractice: PrePractice;
  illness: boolean;
  notifications: Notification[];
  badges: Badge[];
  sleep30: SleepDay[];
  mental30: MentalDay[];
  paceSeason: { week: string; pace: number | null }[];
  weeks: { week: string; km: number }[];
  stats: ReturnType<typeof personalStats>;
  insights: string[];
  todayCheckin: CheckinRow | null;
  todaySoreness: SorenessEntry[];
  /** recent runs, newest first, with any single-session spike attached */
  recentRuns: { id: number; date: string; km: number; durationS: number; spike: SessionSpike | null }[];
  /** a run of consecutive check-ins with falling energy, or null */
  energyTrend: EnergyTrend | null;
  races: {
    upcoming: (RaceRow & { daysUntil: number; pacing: string[]; predicted: string; canEdit: boolean })[];
    history: {
      id: number;
      event: string;
      date: string;
      time: string;
      timeS: number;
      place: number | null;
      feel: string | null;
      splits: number[] | null;
      conditions: string | null;
      notes: string | null;
      isPr: boolean;
    }[];
    prProgression: Record<string, { date: string; timeS: number }[]>;
  };
  injuries: { id: number; date: string; body_part: string; note: string | null; resolved_at: string | null }[];
  goals: { event: string; target: number; targetLabel: string; predicted: string | null; onTrack: boolean | null }[];
  weeklyTargetKm: number;
  connectedSources: string[];
  chatSummary: string[];
};

/**
 * What is actually feeding this athlete's data.
 *
 * Everything arrives through Apple Health, either live from the iPhone app
 * (`healthkit`) or from a one-off export backfill (`apple_export`). There is no
 * third-party sync and no link column to read.
 *
 * `a` is still taken so callers do not have to change and so the athlete row is
 * at hand if a future source is stored as a column again.
 */
function connectedSources(_a: AthleteRow, acts: ActivityRow[]): string[] {
  const out = new Set<string>();
  for (const x of acts) {
    if (x.source === "healthkit") out.add("Apple Watch");
    if (x.source === "apple_export") out.add("Apple Health");
  }
  if (out.size === 0) out.add("No data yet");
  return [...out];
}

export async function buildProfile(
  athleteId: number,
  now: Date = new Date()
): Promise<CoreProfile | null> {
  const athlete = await getAthlete(athleteId);
  if (!athlete) return null;

  const since = new Date(now.getTime() - 400 * DAY_MS).toISOString();
  const todayIso = localDay(now);

  // Every read here takes its arguments from `athlete` or from the clock — none
  // of them consumes another's result — so they are issued together rather than
  // one after the next. Under the SQLite driver this changes nothing —
  // better-sqlite3 is synchronous, so the queries still run in sequence — but
  // under the Supabase driver it collapses twelve sequential pooler round trips
  // into one, which is where the latency actually lives. Reads only, no writes,
  // so the interleaving carries no ordering risk.
  const [
    acts,
    metrics,
    checkins,
    results,
    injuries,
    goals,
    races,
    soreRows,
    todaySoreRows,
    statusRows,
    chatRows,
    team,
  ] = await Promise.all([
    activitiesForAthlete(athlete.id, since),
    metricsForAthlete(athlete.id, since),
    checkinsForAthlete(athlete.id, since),
    raceResultsForAthlete(athlete.id),
    injuriesForAthlete(athlete.id),
    goalsForAthlete(athlete.id),
    upcomingRaces({ athleteId: athlete.id, teamId: athlete.team_id }),
    // last 14 days of soreness reports — the risk engine reads the trend, not just today
    sorenessHistory(athlete.id, localDayOffset(13, now)),
    sorenessForCheckin(athlete.id, todayIso),
    all<{ date: string; status: string }>(
      "SELECT date, status FROM workout_status WHERE athlete_id = ?",
      [athlete.id]
    ),
    // The coach dashboard renders these VERBATIM, in quotes. Safety-intercepted
    // messages are excluded — an athlete who has just been told to talk to a
    // parent and a doctor should not then find that disclosure quoted on their
    // coach's screen.
    //
    // The `engine IS NULL` half is mandatory, not defensive: in SQLite
    // `NULL NOT LIKE 'safety:%'` evaluates to NULL rather than true, so without it
    // every pre-migration row would be excluded and this panel would silently
    // empty out.
    all<{ text: string }>(
      "SELECT text FROM chat_messages WHERE athlete_id = ? AND role = 'user' AND (engine IS NULL OR engine NOT LIKE 'safety:%') ORDER BY id DESC LIMIT 5",
      [athlete.id]
    ),
    athlete.team_id ? getTeam(athlete.team_id) : Promise.resolve(undefined),
  ]);

  const soreReports = soreRows.map((s) => ({
    date: s.date,
    body_part: s.body_part,
    severity: s.severity,
  }));

  const risk = computeRisk(acts, metrics, now, soreReports, athlete);
  const restingHr = risk.recovery.restingHrBaseline ?? 55;
  const load = loadMetrics(acts, risk, restingHr);
  const patterns = detectPatterns(risk, metrics);
  const fitness = computeFitness(risk, metrics, acts);
  const predictions = predictRaces(fitness.vo2max, fitness.score);
  const prsMap = personalRecords(results);
  const illness = illnessFlag(risk);

  const todayCheckin = checkins.find((c) => c.date === todayIso) ?? null;
  const todaySoreness: SorenessEntry[] = todaySoreRows.map((s) => ({
    part: s.body_part,
    severity: s.severity,
  }));

  const nextRace = races[0] ?? null;
  // The SAME off-by-one as `daysUntil` below, in a second place — see the long
  // note there. This one feeds `weeklyPlan`, so before local noon the taper
  // window and the race-day row both shifted a day: on race morning the plan
  // showed "Pre-race shakeout" for today and "RACE DAY" for tomorrow. Two
  // copies of one calculation is why the first fix did not cover it.
  const daysToRace = nextRace
    ? Math.round(
        (new Date(nextRace.date + "T12:00:00").getTime() -
          new Date(localDay(now) + "T12:00:00").getTime()) /
          DAY_MS
      )
    : null;

  const statuses = new Map<string, string>(statusRows.map((r) => [r.date, r.status]));
  // Recent runs, newest first, each rated against the athlete's own longest run
  // in the 30 days before it. This is the one load pattern the running evidence
  // supports, and it is reported against the session rather than the athlete.
  const recentRuns = [...acts]
    .filter((a) => a.distance_m > 0)
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      date: localDay(new Date(a.start_time)),
      km: Math.round((a.distance_m / 1000) * 10) / 10,
      durationS: a.duration_s,
      spike: sessionSpike(a, acts),
    }));

  const energyTrend: EnergyTrend | null = detectEnergyDecline(
    checkins.map((c) => ({ date: c.date, energy: c.energy })),
    now
  );

  // Plan volume responds only to signals that earned their place, and every
  // adjustment carries a reason the coach can read and disagree with.
  const recentSpike =
    recentRuns.find((r) => r.spike && r.date >= localDayOffset(7, now))?.spike ?? null;
  const adjustment = planAdjustment(risk, recentSpike, energyTrend);

  /*
   * The coach's calendar, for the Monday–Sunday week weeklyPlan is about to
   * build. Read for exactly that window rather than "recent days": the plan is
   * always this week, and pulling a wider range would put days on the wire that
   * nothing renders.
   *
   * An athlete with no team has no coach calendar, and the empty map is the
   * pre-calendar behaviour — every day generated. That is the same fallback an
   * athlete on a team whose coach has not written anything gets, which is why
   * there is no "has a plan" flag anywhere: a missing row IS the answer.
   */
  const weekMonday = new Date(now);
  weekMonday.setDate(weekMonday.getDate() - ((weekMonday.getDay() + 6) % 7));
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  const coachDays = athlete.team_id
    ? await teamPlanDays(athlete.team_id, localDay(weekMonday), localDay(weekSunday))
    : new Map();

  const plan = weeklyPlan(risk, predictions, nextRace, statuses, now, adjustment, coachDays);

  const lastActivityDaysAgo = risk.lastActivity
    ? Math.floor((now.getTime() - new Date(risk.lastActivity).getTime()) / DAY_MS)
    : null;

  const notifications = buildNotifications({
    risk,
    fitness,
    patterns,
    illness,
    nextRace,
    daysToRace,
    predictions,
    prs: prsMap,
    lastActivityDaysAgo,
  });

  const badges = computeBadges(risk.series, results, injuries, now);

  // Peer percentiles removed: ranking teenagers against each other on volume and
  // predicted times is social-comparison pressure in a sport that already carries
  // elevated disordered-eating risk, and it penalises later-maturing athletes for
  // being biologically younger.

  const weeks: { week: string; km: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const chunk = risk.series.slice(risk.series.length - (w + 1) * 7, risk.series.length - w * 7);
    weeks.push({
      week: chunk[0]
        ? new Date(chunk[0].date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "",
      km: Math.round(chunk.reduce((s, d) => s + d.km, 0) * 10) / 10,
    });
  }

  const prProgression: Record<string, { date: string; timeS: number }[]> = {};
  for (const ev of EVENTS) {
    let best = Infinity;
    const prog: { date: string; timeS: number }[] = [];
    for (const r of results.filter((x) => x.event === ev)) {
      if (r.time_s < best) {
        best = r.time_s;
        prog.push({ date: r.date, timeS: r.time_s });
      }
    }
    if (prog.length) prProgression[ev] = prog;
  }

  const history = [...results].reverse().map((r) => {
    const before = results.filter((x) => x.event === r.event && x.date < r.date);
    const isPr = before.every((x) => x.time_s > r.time_s);
    let splits: number[] | null = null;
    try {
      splits = r.splits ? (JSON.parse(r.splits) as number[]) : null;
    } catch {
      splits = null;
    }
    return {
      id: r.id,
      event: r.event,
      date: r.date,
      time: fmtTime(r.time_s),
      timeS: r.time_s,
      place: r.place,
      feel: r.feel,
      splits,
      conditions: r.conditions,
      notes: r.notes,
      isPr,
    };
  });


  const goalRows = goals
    .filter((g) => g.event !== "weekly_km")
    .map((g) => {
      const ev = g.event as EventName;
      const pred = EVENTS.includes(ev) ? predictions[ev] : null;
      return {
        event: g.event,
        target: g.target,
        targetLabel: fmtTime(g.target),
        predicted: pred ? pred.label : null,
        onTrack: pred ? pred.timeS <= g.target + 3 : null,
      };
    });
  const weeklyTargetKm =
    goals.find((g) => g.event === "weekly_km")?.target ??
    Math.max(Math.round(risk.weekKm * 1.05), 20);

  const chatQs = chatRows.map((r) => r.text);

  return {
    athlete: {
      id: athlete.id,
      name: athlete.name,
      grade: athlete.grade,
      school: team?.name ?? "Independent",
      events: ["800m", "Mile", "5K", "XC 5K"],
      hue: athlete.avatar_hue,
      deviceToken: athlete.device_token,
      teamName: team?.name ?? null,
    },
    risk,
    series: risk.series,
    yearDays: dailySeries(acts, 366).map(({ date, load: l, km }) => ({ date, load: l, km })),
    readiness: readinessScore(risk, todayCheckin, todaySoreness),
    aiInsight: aiInsight(risk, fitness, patterns),
    load,
    patterns,
    fitness,
    predictions,
    prs: EVENTS.map((ev) =>
      prsMap[ev] !== undefined
        ? { event: ev, timeS: prsMap[ev] as number, label: fmtTime(prsMap[ev] as number) }
        : { event: ev, timeS: null, label: "—" }
    ),
    plan,
    prePractice: prePracticeFlag(risk, illness, todaySoreness),
    illness,
    notifications,
    badges,
    sleep30: sleepTrend(metrics),
    mental30: mentalTrend(checkins),
    paceSeason: paceTrend(risk.series, acts),
    weeks,
    stats: personalStats(risk.series, acts),
    insights: athleteInsights(risk),
    todayCheckin,
    todaySoreness,
    recentRuns,
    energyTrend,
    races: {
      upcoming: races.map((r) => {
        /*
         * CALENDAR DAYS BETWEEN TWO DATES — not hours-until-noon, rounded up.
         *
         * This was `ceil((raceNoon - now) / DAY_MS)`, which mixes a date with a
         * clock: before local noon the race instant is still ahead of `now` on
         * the race's OWN day, so it ceils to 1. Every countdown was one too
         * large for the whole local morning, every morning.
         *
         * Measured at 10:32 on the dev server: a race 5 days out returned 6, one
         * 40 days out returned 41. On race day it returned 1 — so the app told
         * an athlete standing on the start line "tomorrow", right through the
         * 6am hour docs/visual-spec.md is explicitly designed for.
         *
         * It was not only a label. `IMMINENT_DAYS = 7` gates the ember strip and
         * the pre-race checklist, and `taperMode`/`taperCountdown` inherit this
         * number, so a race exactly a week out silently lost all of it until
         * noon.
         *
         * Both sides are anchored at local noon and then differenced, so the
         * result is whole days regardless of clock time, and noon keeps it clear
         * of the DST hour where a day is 23 or 25 hours long. Today is 0.
         */
        const d = Math.round(
          (new Date(r.date + "T12:00:00").getTime() -
            new Date(localDay(now) + "T12:00:00").getTime()) /
            DAY_MS
        );
        const ev = (EVENTS.includes(r.event as EventName) ? r.event : "5K") as EventName;
        return {
          ...r,
          daysUntil: d,
          pacing: pacingStrategy(ev, predictions[ev].timeS),
          predicted: predictions[ev].label,
          canEdit: r.created_by_athlete_id === athlete.id,
        };
      }),
      history,
      prProgression,
    },
    injuries: injuries.map((i) => ({ id: i.id, date: i.date, body_part: i.body_part, note: i.note, resolved_at: i.resolved_at })),
    goals: goalRows,
    weeklyTargetKm: Math.max(20, Math.round(weeklyTargetKm)),
    connectedSources: connectedSources(athlete, acts),
    chatSummary: chatQs,
  };
}
