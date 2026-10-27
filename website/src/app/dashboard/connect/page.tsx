import { athletesForTeam, getTeam, lastSyncForTeam } from "@/lib/db";
import { currentTeamId } from "@/lib/session";
import Avatar from "@/components/Avatar";
import { AppleImportForm } from "./controls";

export const dynamic = "force-dynamic";

/**
 * Data sources.
 *
 * Apple Health is the only live source. It arrives two ways: continuously,
 * through the RunGuard iPhone app, which the athlete signs in to with their own
 * email and password, or as a one-off backfill from an Apple Health export.
 *
 * THERE IS NO CREDENTIAL ON THIS PAGE. It used to render every listed athlete's
 * `device_token` behind a "Copy app token" button — a permanent, unrevocable
 * Bearer credential for a minor's health data, handed to an adult to carry
 * around. Pairing is now the athlete signing in, so the coach has nothing to
 * pass on and nothing to lose: what is left here is the join code they already
 * share, and an honest answer to "is this athlete actually connected?".
 *
 * There is deliberately no third-party OAuth path here. The one this page used
 * to carry was the only thing on it that could show a coach a red
 * "not configured" banner, and it duplicated data the phone already sends.
 * Android arrives through Health Connect after the iOS launch.
 */
export default async function ConnectPage() {
  const teamId = await currentTeamId();
  // Fail closed, still. This page no longer renders a credential, but it renders
  // a roster and a join code, and the `: await listAthletes()` fallback it used
  // to have showed the whole database to any session whose team id was falsy.
  // team 0 is a valid HMAC-signed value and is falsy.
  const athletes = teamId ? await athletesForTeam(teamId) : [];
  const lastSync = teamId ? await lastSyncForTeam(teamId) : new Map<number, string>();
  const team = teamId ? await getTeam(teamId) : undefined;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data sources</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          Runs arrive from Apple Health. Apple Watch, Garmin, anything that writes
          to it. Athletes install the RunGuard iPhone app and sign in with their own
          email and password, and workouts flow in the moment they finish.
        </p>
      </div>

      <section
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <div className="px-5 py-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Athletes</h2>
          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
            {athletes.length} on the roster
          </span>
        </div>
        <p className="px-5 pb-4 text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>
          {team ? (
            <>
              An athlete connects by signing up at <b>/athlete/signup</b> with your team code{" "}
              <b style={{ color: "var(--ink-2)" }}>{team.join_code}</b>, then signing in to the app with
              that same email and password. You never handle their login.
            </>
          ) : (
            <>An athlete connects by signing up and joining your team with your team code.</>
          )}
        </p>
        {athletes.length === 0 ? (
          <p className="px-5 pb-5 text-sm" style={{ color: "var(--ink-muted)" }}>
            No athletes yet. Share your team code and they appear here as they sign up.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {athletes.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={a.name} hue={a.avatar_hue} size={30} />
                      <span className="font-medium">{a.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--ink-muted)" }}>
                    {lastSync.has(a.id) ? (
                      <span style={{ color: "var(--status-good)" }}>
                        ✓ Last run {lastSync.get(a.id)!.slice(0, 10)}
                      </span>
                    ) : (
                      "Waiting for first sync"
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-xs" style={{ color: "var(--ink-muted)" }}>
                    {/*
                      An athlete row with no email was created on the roster and has
                      never signed up, so nothing can sign in as them yet. Saying so
                      is the honest replacement for the token button: a blank here
                      would read as "connected", and a blank must never read as a
                      healthy value.
                    */}
                    {a.email ? "Has an app account" : "No account yet"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section
        className="rounded-2xl border p-5 space-y-3"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <h2 className="text-sm font-semibold">Backfill from an Apple Health export</h2>
        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>
          For history from before an athlete installed the app. On their iPhone:
          Health → profile picture → Export All Health Data. AirDrop the export.zip
          here and upload it. Runs and workouts land in their training history; the
          app keeps syncing everything after that on its own.
        </p>
        <AppleImportForm athletes={athletes.map((a) => ({ id: a.id, name: a.name }))} />
      </section>

      <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>
        Android support arrives through Health Connect after the iOS launch.
      </p>
    </div>
  );
}
