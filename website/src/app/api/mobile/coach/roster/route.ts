import { resolveCoachTeam } from "@/lib/apiAuth";
import { localDay, localDayOffset } from "@/lib/day";
import {
  athletesForTeam,
  activitiesForAthlete,
  metricsForAthlete,
  sorenessHistory,
  checkinsForAthlete,
  sorenessForCheckin,
  getTeam,
} from "@/lib/db";
import { computeRisk, sessionSpike } from "@/lib/risk";
import {
  computeFitness,
  illnessFlag,
  prePracticeFlag,
  readinessScore,
  type SorenessEntry,
} from "@/lib/engine";

/**
 * The coach's Roster tab.
 *
 * This is `/dashboard` without the HTML: same roster query, same `computeRisk`
 * / `computeFitness` / `sessionSpike` / `readinessScore` calls in the same
 * order. Nothing is re-derived here — a second implementation of readiness or
 * of the soreness flags is a second thing to keep in step, and the phone must
 * never show a coach a different state than the web does for the same athlete.
 *
 * WINDOW. 130 days of activities per athlete, which is what `fetchDays` gives
 * the dashboard at its default range: enough for the 28-day chronic baseline
 * ACWR needs and for the week-over-week comparison. `weekKm` is 7 days by
 * definition and does not move with it.
 *
 * NO RISK SCORE IS RETURNED, deliberately. `/dashboard` sorts alphabetically
 * and shows named flags rather than a number, and its own comment says why: a
 * ranked injury figure taught athletes to inflate their check-ins to stay off
 * the top of it, which corrupts self-report — the one signal RunGuard cannot
 * verify. Shipping `risk.score` to the phone would hand the app everything it
 * needs to build that leaderboard. `zone` is the coarse state the coach acts
 * on; `readiness` is the athlete's own number, already on their phone.
 */
export async function GET(request: Request) {
  const teamId = await resolveCoachTeam(request);
  if (teamId == null) {
    return Response.json({ error: "Invalid coach token" }, { status: 401 });
  }

  const now = new Date();
  const todayIso = localDay(now);
  const since = new Date(now.getTime() - 130 * 86400000).toISOString();
  const soreSince = localDayOffset(13, now);

  // Scoped in the query itself. There is no "all athletes" fallback anywhere on
  // this path: an unresolved team is a 401 above, never an unfiltered read.
  const [team, roster] = await Promise.all([getTeam(teamId), athletesForTeam(teamId)]);

  const athletes = await Promise.all(
    roster.map(async (a) => {
      const [acts, metrics, sore, checkins, todaySoreRows] = await Promise.all([
        activitiesForAthlete(a.id, since),
        metricsForAthlete(a.id, since),
        sorenessHistory(a.id, soreSince),
        checkinsForAthlete(a.id, todayIso),
        sorenessForCheckin(a.id, todayIso),
      ]);
      const soreReports = sore.map((s) => ({
        date: s.date,
        body_part: s.body_part,
        severity: s.severity,
      }));
      const risk = computeRisk(acts, metrics, now, soreReports, a);
      const fitness = computeFitness(risk, metrics, acts);
      const todayCheckin = checkins.find((c) => c.date === todayIso) ?? null;
      const todaySoreness: SorenessEntry[] = todaySoreRows.map((s) => ({
        part: s.body_part,
        severity: s.severity,
      }));
      const pre = prePracticeFlag(risk, illnessFlag(risk), todaySoreness);

      // The most recent run that was markedly longer than anything before it —
      // the dashboard's "needs a look" flag, same seven-run lookback.
      const spike =
        [...acts]
          .sort((x, y) => y.start_time.localeCompare(x.start_time))
          .slice(0, 7)
          .map((x) => sessionSpike(x, acts))
          .find((s) => s !== null) ?? null;

      /*
       * An EXPLICIT allow-list, never a spread of `a`.
       *
       * `athletesForTeam` returns whole `athletes` rows, and those carry the
       * athlete's email, their password hash, and the vestigial `device_token`
       * column. Spreading the row would put every one of those in a response the
       * coach's phone caches and any proxy could log. A payload is a thing that
       * gets written down, so no coach endpoint carries any of them.
       */
      return {
        id: a.id,
        name: a.name,
        grade: a.grade,
        hue: a.avatar_hue,
        readiness: readinessScore(risk, todayCheckin, todaySoreness),
        fitnessTier: fitness.tier,
        // `reason` only. `prePractice.athleteReason` is the same observation
        // reworded for the athlete's own screen; sending it to a coach app
        // invites it to be read out as if it were addressed to them.
        prePractice: { flag: pre.flag, reason: pre.reason },
        risk: {
          zone: risk.zone,
          zoneLabel: risk.zoneLabel,
          hasActivityHistory: risk.hasActivityHistory,
          weekKm: risk.weekKm,
          prevWeekKm: risk.prevWeekKm,
          acwr: risk.acwr,
          lastActivity: risk.lastActivity,
        },
        // Whole `SelfReport`: eight scalars, and each roster flag needs several
        // of them together (a part with no day count says nothing).
        selfReport: risk.selfReport,
        spike,
      };
    })
  );

  return Response.json({
    team: { id: teamId, name: team?.name ?? null },
    athletes,
  });
}
