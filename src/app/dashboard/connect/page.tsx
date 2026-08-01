import { athletesForTeam } from "@/lib/db";
import { stravaConfigured } from "@/lib/strava";
import { currentTeamId } from "@/lib/session";
import Avatar from "@/components/Avatar";
import ConnectControls, { AppleImportForm } from "./controls";

export const dynamic = "force-dynamic";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const teamId = await currentTeamId();
  // Fail closed. This page renders every listed athlete's device_token — their
  // Bearer credential — so the `: listAthletes()` fallback handed out the whole
  // database's credentials to any session whose team id was falsy. team 0 is a
  // valid HMAC-signed value and is falsy.
  const athletes = teamId ? athletesForTeam(teamId) : [];
  const configured = stravaConfigured();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data sources</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          Connect each athlete&apos;s Strava, import Apple Health exports, or use the
          iPhone app with their device token.
        </p>
      </div>

      {sp.connected && (
        <Banner good>Strava connected — history is syncing in.</Banner>
      )}
      {sp.error && (
        <Banner>Strava connection was cancelled or failed. Try again.</Banner>
      )}
      {!configured && (
        <Banner>
          Strava isn&apos;t configured yet. Create a (free) API app at
          strava.com/settings/api, then put STRAVA_CLIENT_ID and
          STRAVA_CLIENT_SECRET in your .env file and restart the server.
        </Banner>
      )}

      <section
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">Athletes</h2>
        </div>
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
                  {a.strava_athlete_id ? (
                    <span style={{ color: "var(--status-good)" }}>✓ Strava linked</span>
                  ) : (
                    "Not linked"
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <ConnectControls
                    athleteId={a.id}
                    linked={Boolean(a.strava_athlete_id)}
                    configured={configured}
                    deviceToken={a.device_token}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section
        className="rounded-2xl border p-5 space-y-3"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <h2 className="text-sm font-semibold">Import Apple Health export</h2>
        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>
          On the athlete&apos;s iPhone: Health app → profile picture → Export All Health
          Data. AirDrop the export.zip here and upload it. Runs and workouts are
          pulled into their training history automatically.
        </p>
        <AppleImportForm athletes={athletes.map((a) => ({ id: a.id, name: a.name }))} />
      </section>
    </div>
  );
}

function Banner({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm"
      style={{
        borderColor: good ? "var(--status-good)" : "var(--status-warning)",
        color: "var(--ink-2)",
        background: "var(--surface)",
      }}
    >
      {children}
    </div>
  );
}
