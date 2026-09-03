"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The coach's tab bar.
 *
 * A Client Component only because the active tab needs the current path, and
 * the layout that renders it is a Server Component. It holds no state of its
 * own beyond that.
 *
 * ── WHY AN ATHLETE PAGE LIGHTS UP "ROSTER" ─────────────────────────────────
 * `/dashboard/athlete/12` is not its own tab — it is where the roster leads.
 * Leaving every tab unlit there would tell a coach three levels into a
 * scrolling detail page that they are nowhere, which is the same failure the
 * sticky athlete header exists to prevent.
 *
 * ── AND WHY THE MATCH IS NOT `startsWith` ──────────────────────────────────
 * Every route here begins with `/dashboard`, so a prefix test would light the
 * overview tab on all of them. The overview is matched exactly; the others
 * match their own subtree.
 */
const TABS = [
  { href: "/dashboard", label: "Dashboard", match: (p: string) => p === "/dashboard" },
  {
    href: "/dashboard/roster",
    label: "Roster",
    match: (p: string) => p.startsWith("/dashboard/roster") || p.startsWith("/dashboard/athlete"),
  },
  {
    href: "/dashboard/plan",
    label: "Training calendar",
    match: (p: string) => p.startsWith("/dashboard/plan"),
  },
  {
    href: "/dashboard/connect",
    label: "Data sources",
    match: (p: string) => p.startsWith("/dashboard/connect"),
  },
];

export default function DashboardNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
            style={{
              /*
                Weight and a filled well carry the active state, not colour
                alone — the tab bar sits on glass over a cream page, where a
                hue shift alone is the first thing to disappear.
              */
              color: active ? "var(--ink)" : "var(--ink-2)",
              fontWeight: active ? 600 : 400,
              background: active ? "var(--surface-2)" : "transparent",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
