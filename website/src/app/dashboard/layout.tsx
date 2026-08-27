import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn, currentTeamId, isDemoSession } from "@/lib/session";
import DemoBanner from "@/components/DemoBanner";
import { getTeam } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isLoggedIn())) redirect("/login");
  // The badge said "Leland XC · Coach view" for every team that has ever signed
  // up, hardcoded. A coach at any other school opened the dashboard and saw
  // someone else's team name over their own roster.
  const teamId = await currentTeamId();
  const team = teamId != null ? await getTeam(teamId) : null;
  const demo = await isDemoSession();
  return (
    <div className="flex-1 flex flex-col">
      {demo && <DemoBanner />}
      <header
        className="sticky top-0 z-20 border-b glass"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
            <Logo />
            RunGuard
          </Link>
          <nav className="flex items-center gap-4 text-sm" style={{ color: "var(--ink-2)" }}>
            <Link href="/dashboard" className="hover:opacity-70">Roster</Link>
            <Link href="/dashboard/plan" className="hover:opacity-70">Training calendar</Link>
            <Link href="/dashboard/connect" className="hover:opacity-70">Data sources</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span
              className="hidden sm:inline text-xs px-2 py-1 rounded-full border"
              style={{ borderColor: "var(--hairline)", color: "var(--ink-muted)" }}
            >
              {team ? `${team.name} · ` : ""}{demo ? "Sample team" : "Coach view"}
            </span>
            <form action="/api/logout" method="post">
              <button
                className="hover:opacity-70 cursor-pointer"
                style={{ color: "var(--ink-muted)" }}
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">{children}</main>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20L4 9a2 2 0 012-2h12a2 2 0 012 2v11"
        stroke="var(--brand)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M8 13l3 3 5-6"
        stroke="var(--ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
