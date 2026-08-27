"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often the portal quietly re-checks the server while it's open. */
const INTERVAL_MS = 25_000;

/**
 * Keeps the athlete portal current without a manual reload.
 *
 * `AthletePortal` is a server component that reads `buildProfile()` once per
 * request — a coach writing today's session into the plan calendar
 * (`team_plan_days`) otherwise only shows up here the next time the athlete
 * happens to reload the page. This polls `router.refresh()`, which re-runs
 * that server read in place: no remount, no lost scroll position, no flash —
 * whichever tab is open just re-renders with whatever the server returns now.
 *
 * Paused whenever the tab is hidden, so a backgrounded browser tab is not
 * quietly re-fetching the whole portal on a timer nobody is looking at, and
 * it picks back up the moment the tab is foregrounded again rather than
 * waiting out the rest of a stale interval.
 *
 * Renders nothing — this component exists for its effect, not its output.
 */
export default function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (document.visibilityState === "visible") start();
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
