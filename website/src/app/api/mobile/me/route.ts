import { buildProfile } from "@/lib/profile";
import { verifyAthleteToken } from "@/lib/session";

/** The iOS app fetches the athlete's complete RunGuard profile here. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const athleteId = auth.startsWith("Bearer ") ? await verifyAthleteToken(auth.slice(7)) : null;
  if (athleteId === null) {
    return Response.json({ error: "Invalid session token" }, { status: 401 });
  }
  const profile = await buildProfile(athleteId);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  // `profile.athlete` no longer carries a `deviceToken` at all — `buildProfile`
  // stopped selecting it when athletes moved to signed sessions, so there is no
  // key left here to strip. The reason it had to be stripped is still the rule:
  // `CLAUDE.md` is unconditional that a token is never rendered and never
  // logged, and a payload is a thing that gets logged.

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
    athlete: profile.athlete,
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
    // RunGuard 2.0 (CAC 2026): the self-audit bundle. See DISCLOSURE.md.
    audit: profile.audit,
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
