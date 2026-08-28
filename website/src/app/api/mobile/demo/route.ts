import { athletesForTeam } from "@/lib/db";
import { demoAthleteId, demoTeamId } from "@/lib/demo";
import { resolveDemoAthlete } from "@/lib/demoAthlete";

export const dynamic = "force-dynamic";

/**
 * One tap into the app as the demo runner.
 *
 * The web demo (`/api/demo/athlete`) cannot serve the phone: it works by
 * putting the athlete's token in an httpOnly COOKIE and letting middleware
 * refuse every non-GET for cookie sessions. The app does not use cookies — it
 * sends `Authorization: Bearer <device_token>` — so none of that machinery
 * applies to it. This route is the phone's equivalent, and the read-only half
 * is enforced somewhere else entirely: see `lib/demoAthlete.ts`, which makes
 * `resolveAthleteWithPath` refuse to resolve this athlete for any write, on
 * every route at once.
 *
 * WHAT THIS HANDS OUT. A real, permanent device token for a real row. That is
 * the same grant the public web demo already makes, and it carries the same
 * standing condition, stated in `lib/demo.ts`: **the demo team must contain
 * only seeded data.** The moment a real athlete joins it, every visitor is
 * reading a real minor's health record. Nothing in code can check that.
 *
 * The token is returned in the body because the phone has to store it in the
 * Keychain — there is no cookie to hide it in. The app treats it exactly like
 * any other pairing: written straight to SecureStore, never rendered, never
 * logged (`app/src/lib/auth.ts`).
 */
export async function GET() {
  const teamId = demoTeamId();
  // Off unless configured, and indistinguishable from a route that was never
  // built — the same posture as the web demo routes.
  if (teamId === null) return new Response("Not found", { status: 404 });

  const athlete = resolveDemoAthlete(
    await athletesForTeam(teamId),
    demoAthleteId()
  );

  if (!athlete?.device_token) {
    return new Response(
      "The demo team has no athlete with a device token. Re-seed with `npm run seed -- --demo-tokens`.",
      { status: 503 }
    );
  }

  return Response.json({
    token: athlete.device_token,
    name: athlete.name,
  });
}
