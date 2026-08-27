/**
 * Calls `fn` on an interval while the app is in the foreground, so a coach's
 * plan edit or a completed sync shows up without the athlete pulling to
 * refresh.
 *
 * Paused the instant the app backgrounds — `AppState` going anything other
 * than `"active"` stops the timer rather than letting it fire into a
 * suspended app — and it does not fire immediately on mount: the first tick
 * lands after `intervalMs`, since every caller of this hook already has its
 * own first-load effect and an immediate tick would just double it.
 */
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

export function useLiveRefresh(fn: () => void, intervalMs: number): void {
  // A ref, not a dependency: `fn` is a fresh closure on every render in every
  // caller here, and putting it in the effect's deps would tear the interval
  // down and rebuild it every render instead of just calling the latest fn.
  // Written from its own effect (no deps, so it runs after every render)
  // rather than during render itself — mutating a ref's `.current` while
  // rendering is what `react-hooks/refs` exists to catch.
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => latest.current(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs]);
}
