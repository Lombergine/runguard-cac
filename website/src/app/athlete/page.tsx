import { chatTabLabel } from "@/lib/ai";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAthleteByToken } from "@/lib/db";
import { athleteTokenFromCookie, isDemoSession } from "@/lib/session";
import DemoBanner from "@/components/DemoBanner";
import { buildProfile } from "@/lib/profile";
import Avatar from "@/components/Avatar";
import LiveRefresh from "@/components/athlete/LiveRefresh";
import {
  HomeTab,
  TrainingTab,
  StatsTab,
  RecoveryTab,
  RaceTab,
  ChatTab,
  ProfileTab,
} from "@/components/athlete/tabs";

export const dynamic = "force-dynamic";

/*
 * The tab IDS are stable and the LABEL for the chat tab is not — see lib/ai.ts.
 *
 * Keeping the id fixed matters: it is what `?tab=` carries, so a link someone
 * saved must not stop working because a model was switched on. Only the word on
 * screen changes.
 */
const TABS = ["Home", "Training", "Stats", "Recovery", "Race", "Chat", "Profile"] as const;

function tabLabel(tab: (typeof TABS)[number]): string {
  return tab === "Chat" ? chatTabLabel() : tab;
}

export default async function AthletePortal({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const token = await athleteTokenFromCookie();
  const athlete = token ? await getAthleteByToken(token) : undefined;
  if (!athlete) redirect("/athlete/login");

  const { tab } = await searchParams;
  const activeTab = TABS.includes(tab as (typeof TABS)[number])
    ? (tab as (typeof TABS)[number])
    : "Home";

  const p = await buildProfile(athlete.id);
  if (!p) redirect("/athlete/login");

  const unread = p.notifications.length;
  const demo = await isDemoSession();

  return (
    <div className="flex-1 flex flex-col">
      <LiveRefresh />
      {demo && <DemoBanner />}
      {/* athlete header */}
      <header
        className="sticky top-0 z-20 border-b glass"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center gap-3">
          <span className="flex items-center gap-2 font-bold tracking-tight">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 20L4 9a2 2 0 012-2h12a2 2 0 012 2v11" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M8 13l3 3 5-6" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            RunGuard
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full border hidden sm:inline"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-muted)" }}
          >
            {unread > 0 ? `${unread} alert${unread === 1 ? "" : "s"}` : "all clear"}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/athlete?tab=Profile" className="flex items-center gap-2 text-sm hover:opacity-70" style={{ color: "var(--ink-2)" }}>
              <Avatar name={p.athlete.name} hue={p.athlete.hue} size={26} />
              <span className="hidden sm:inline">{p.athlete.name.split(" ")[0]}</span>
            </Link>
            <form action="/api/athlete-logout" method="post">
              <button className="text-sm hover:opacity-70 cursor-pointer" style={{ color: "var(--ink-muted)" }}>
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 flex-1 space-y-5">
        {/* tab bar */}
        <div
          className="flex flex-wrap gap-1.5 rounded-2xl border p-1.5 sticky top-16 z-10 glass"
          style={{ borderColor: "var(--hairline)" }}
        >
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/athlete?tab=${encodeURIComponent(t)}`}
              className="rounded-xl px-3.5 py-2 text-sm font-medium"
              style={
                t === activeTab
                  ? { background: "var(--ember)", color: "#000", boxShadow: "0 2px 12px rgba(245,158,11,0.25)" }
                  : { color: "var(--ink-2)" }
              }
            >
              {tabLabel(t)}
            </Link>
          ))}
        </div>

        {activeTab === "Home" && <HomeTab p={p} />}
        {activeTab === "Training" && <TrainingTab p={p} />}
        {activeTab === "Stats" && <StatsTab p={p} />}
        {activeTab === "Recovery" && <RecoveryTab p={p} />}
        {activeTab === "Race" && <RaceTab p={p} />}
        {activeTab === "Chat" && <ChatTab p={p} />}
        {activeTab === "Profile" && <ProfileTab p={p} />}

        <p className="text-xs text-center pb-4" style={{ color: "var(--ink-muted)" }}>
          Data syncs from Apple Health through the RunGuard iPhone app — Apple Watch,
          Garmin, anything that writes to Health. Add RunGuard to your home screen for
          the full app feel.
        </p>
      </main>
    </div>
  );
}
