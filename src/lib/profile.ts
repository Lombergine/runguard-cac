import { localDay, localDayOffset } from "./day";
import {
  getDb,
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
  plan: { days: PlanDay[]; taperMode: boolean; taperCountdown: number | null };
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

function connectedSources(a: AthleteRow, acts: ActivityRow[]): string[] {
  const out = new Set<string>();
  if (a.strava_athlete_id) out.add("Strava");
  for (const x of acts) {
    if (x.source === "healthkit" || x.source === "apple_export") out.add("Apple Watch");
    if (x.source === "strava") out.add("Strava");
  }
  if (out.size === 0) out.add("No data yet");
  return [...out];
}

export function buildProfile(athleteId: number, now: Date = new Date()): CoreProfile | null {
  const athlete = getAthlete(athleteId);
  if (!athlete) return null;

  const since = new Date(now.getTime() - 400 * DAY_MS).toISOString();
  const acts = activitiesForAthlete(athlete.id, since);
  const metrics = metricsForAthlete(athlete.id, since);
  const checkins = checkinsForAthlete(athlete.id, since);
  const results = raceResultsForAthlete(athlete.id);
  const injuries = injuriesForAthlete(athlete.id);
  const goals = goalsForAthlete(athlete.id);
  const races = upcomingRaces({ athleteId: athlete.id, teamId: athlete.team_id });

  // last 14 days of soreness reports — the risk engine reads the trend, not just today
  const soreReports = sorenessHistory(
    athlete.id,
    localDayOffset(13, now)
  ).map((s) => ({ date: s.date, body_part: s.body_part, severity: s.severity }));

  const risk = computeRisk(acts, metrics, now, soreReports, athlete);
  const restingHr = risk.recovery.restingHrBaseline ?? 55;
  const load = loadMetrics(acts, risk, restingHr);
  const patterns = detectPatterns(risk, metrics);
  const fitness = computeFitness(risk, metrics, acts);
  const predictions = predictRaces(fitness.vo2max, fitness.score);
  const prsMap = personalRecords(results);
  const illness = illnessFlag(risk);

  const todayIso = localDay(now);
  const todayCheckin = checkins.find((c) => c.date === todayIso) ?? null;
  const todaySoreness: SorenessEntry[] = sorenessForCheckin(athlete.id, todayIso).map((s) => ({
    part: s.body_part,
    severity: s.severity,
  }));

  const nextRace = races[0] ?? null;
  const daysToRace = nextRace
    ? Math.ceil((new Date(nextRace.date + "T12:00:00").getTime() - now.getTime()) / DAY_MS)
    : null;

  const statuses = new Map<string, string>(
    (getDb()
      .prepare("SELECT date, status FROM workout_status WHERE athlete_id = ?")
      .all(athlete.id) as { date: string; status: string }[]).map((r) => [r.date, r.status])
  );
  const plan = weeklyPlan(risk, predictions, nextRace, statuses, now);

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

  const chatQs = (getDb()
    .prepare(
      "SELECT text FROM chat_messages WHERE athlete_id = ? AND role = 'user' ORDER BY id DESC LIMIT 5"
    )
    .all(athlete.id) as { text: string }[]).map((r) => r.text);

  return {
    athlete: {
      id: athlete.id,
      name: athlete.name,
      grade: athlete.grade,
      school: (athlete.team_id ? getTeam(athlete.team_id)?.name : null) ?? "Independent",
      events: ["800m", "Mile", "5K", "XC 5K"],
      hue: athlete.avatar_hue,
      deviceToken: athlete.device_token,
      teamName: athlete.team_id ? getTeam(athlete.team_id)?.name ?? null : null,
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
        const d = Math.ceil((new Date(r.date + "T12:00:00").getTime() - now.getTime()) / DAY_MS);
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
