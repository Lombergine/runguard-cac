import { redirect } from "next/navigation";
import { athletesForTeam } from "@/lib/db";
import { demoAthleteId } from "@/lib/demo";
import { demoLogIn, athleteLogIn } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * One click into the athlete view, as a runner on the demo team.
 *
 * The athlete session is their device token in a cookie, so this has to pick an
 * athlete and read their token. Two rules make that safe:
 *
 *  - The athlete is chosen from `athletesForTeam(demoTeamId)` — the demo team
 *    and no other. `DEMO_ATHLETE_ID` narrows it to a specific runner, but it is
 *    CHECKED against that roster rather than trusted, so pointing it at an
 *    athlete on someone else's team falls back to the demo roster instead of
 *    handing out that athlete's credential.
 *  - The token is never rendered. It goes straight into an httpOnly cookie, the
 *    same way `athleteLogIn` handles a real one.
 *
 * `demoLogIn()` runs first and its return value is the enabled check — it also
 * sets the marker cookie middleware reads, which is what makes this session
 * read-only. Without that call the athlete cookie alone would be a writable
 * session for a real athlete row.
 */
export async function GET() {
  const teamId = await demoLogIn();
  if (teamId === null) {
    return new Response("Not found", { status: 404 });
  }

  const roster = await athletesForTeam(teamId);
  const wanted = demoAthleteId();
  // Alphabetical, so an unconfigured demo always opens on the same runner
  // rather than on whoever the database happens to return first.
  const byName = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  const athlete =
    (wanted !== null ? byName.find((a) => a.id === wanted) : undefined) ?? byName[0];

  if (!athlete?.device_token) {
    // A demo team with no athletes, or one whose athletes have no tokens
    // (`npm run seed` without --demo-tokens). Say which, because the fix is a
    // one-line command and a generic 500 would send someone reading code.
    return new Response(
      "The demo team has no athlete with a device token. Re-seed with `npm run seed -- --demo-tokens`.",
      { status: 503 }
    );
  }

  await athleteLogIn(athlete.device_token);
  redirect("/athlete");
}
