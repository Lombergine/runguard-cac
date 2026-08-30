import { athletesForTeam, lastSyncForTeam } from "@/lib/db";
import { currentTeamId } from "@/lib/session";
import Avatar from "@/components/Avatar";
import { AppleImportForm, TokenButton } from "./controls";

export const dynamic = "force-dynamic";

/**
 * Data sources.
 *
 * Apple Health is the only live source. It arrives two ways: continuously,
 * through the RunGuard iPhone app authenticated by the athlete's device token,
 * or as a one-off backfill from an Apple Health export.
 *
 * There is deliberately no third-party OAuth path here. The one this page used
 * to carry was the only thing on it that could show a coach a red
 * "not configured" banner, and it duplicated data the phone already sends.
 * Android arrives through Health Connect after the iOS launch.
 */
export default async function ConnectPage() {
  const teamId = await currentTeamId();
  // Fail closed. This page renders every listed athlete's device_token — their
  // Bearer credential — so the `: await listAthletes()` fallback handed out the whole
  // database's credentials to any session whose team id was falsy. team 0 is a
  // valid HMAC-signed value and is falsy.
  const athletes = teamId ? await athletesForTeam(teamId) : [];
  const lastSync = teamId ? await lastSyncForTeam(teamId) : new Map<number, string>();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data sources</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          Runs arrive from Apple Health — Apple Watch, Garmin, anything that writes
          to it. Athletes sign in to the RunGuard iPhone app with the token below,
          and workouts flow in the moment they finish.
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
        {athletes.length === 0 ? (
          <p className="px-5 pb-5 text-sm" style={{ color: "var(--ink-muted)" }}>
            No athletes yet. Add them from the roster and their tokens appear here.
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
                  <td className="px-5 py-3 text-right">
                    <TokenButton deviceToken={a.device_token} />
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
