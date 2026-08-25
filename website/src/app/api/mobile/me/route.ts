import { getAthleteByToken } from "@/lib/db";
import { buildProfile } from "@/lib/profile";

/** The iOS app fetches the athlete's complete RunGuard profile here. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const athlete = token ? await getAthleteByToken(token) : undefined;
  if (!athlete) {
    return Response.json({ error: "Invalid device token" }, { status: 401 });
  }
  const profile = await buildProfile(athlete.id);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  // The athlete, WITHOUT `deviceToken`. `buildProfile` puts it on the object
  // because the coach dashboard renders it as a pairing code, and this route
  // used to spread the profile wholesale — so the app's own bearer credential
  // came back inside every profile response it made. Self-authenticated, so it
  // was never a cross-athlete leak, but `CLAUDE.md` is unconditional: a token is
  // never rendered and never logged, and a payload is a thing that gets logged.
  const { deviceToken: _token, ...athleteFields } = profile.athlete;

  /*
   * An EXPLICIT allow-list, not `...rest`.
   *
   * The spread meant every field `CoreProfile` grew was published to the phone
   * the moment it existed — no decision, no review. That is how the token got
   * here, and `chatSummary` and `prePractice` are on the wire today for the same
   * reason: nothing chose to send them, nothing chose not to.
   *
   * These are exactly the keys the route already sent, minus the token, so the
   * app sees no change. What changes is the default: a new field on
   * `CoreProfile` is now invisible to the phone until someone adds it here, and
   * adding it is the moment to ask whether an athlete's app should carry it.
   *
   * Keep this list and `app/src/lib/types.ts`'s `Profile` in step — that type is
   * the app's statement of what it needs, and it is the checklist to diff
   * against when changing this.
   */
  return Response.json({
    athlete: athleteFields,
    readiness: profile.readiness,
    aiInsight: profile.aiInsight,
    risk: profile.risk,
    load: profile.load,
    patterns: profile.patterns,
    fitness: profile.fitness,
    predictions: profile.predictions,
    prs: profile.prs,
    plan: profile.plan,
    prePractice: profile.prePractice,
    illness: profile.illness,
    notifications: profile.notifications,
    badges: profile.badges,
    sleep30: profile.sleep30,
    mental30: profile.mental30,
    paceSeason: profile.paceSeason,
    weeks: profile.weeks,
    stats: profile.stats,
    insights: profile.insights,
    todayCheckin: profile.todayCheckin,
    todaySoreness: profile.todaySoreness,
    recentRuns: profile.recentRuns,
    energyTrend: profile.energyTrend,
    races: profile.races,
    injuries: profile.injuries,
    goals: profile.goals,
    weeklyTargetKm: profile.weeklyTargetKm,
    connectedSources: profile.connectedSources,
    chatSummary: profile.chatSummary,

    // Trimmed to keep the payload phone-friendly. NOTE the app's load charts
    // read `risk.series`, not this one: the four fields below drop `acute` and
    // `chronic`, so a chart wired to this copy draws empty EWMA lines.
    series: profile.series.slice(-60).map(({ date, load, km, acwr }) => ({ date, load, km, acwr })),
    calendar: profile.yearDays,
  });
}
