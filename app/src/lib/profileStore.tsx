/**
 * The profile store. One `/api/mobile/me` for the whole signed-in session.
 *
 * WHY THIS EXISTS. Five screens each fetched `/me` on their own — runs,
 * calendar, races, connect and profile — and `/me` is 57 KB. Opening three tabs
 * cost three copies of the same payload, and every screen re-derived its own
 * loading state, its own failure page, its own `alive` flag and its own 401
 * branch. Five copies of a security-critical branch is five chances to get it
 * wrong, and one of them already was: `calendar.tsx` checked `if (!alive)
 * return;` BEFORE `isUnauthorized(err)`, so a revoked token arriving after that
 * screen had been swiped away ended nothing and left the session open. There is
 * exactly one 401 path now, it lives below, and it is guarded by nothing.
 *
 * THE RULES THIS ENFORCES:
 *
 *  - LAZY. The first `useProfile()` consumer starts the fetch; mounting the
 *    provider does not. Home is the default tab and reads the 5.3 KB
 *    `/api/mobile/home`, so an eager provider would pull 57 KB on every cold
 *    start for data nobody had asked for.
 *  - ONE REQUEST. Two screens mounting together share the in-flight promise.
 *  - A REFETCH NEVER DESTROYS GOOD DATA. `refresh()` leaves `profile` exactly
 *    where it is and raises `refreshing`; a refetch that fails sets `state` to
 *    "failed" and still leaves `profile` alone. Under the old per-screen state
 *    a timed-out refetch replaced the whole screen — shared, that would have
 *    blown away a good profile for every other screen too.
 *  - ONE 401 PATH. `signOut()` from `useSession()`, from the catch below, and
 *    nowhere else.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getProfile, isUnauthorized } from "./api";
import { useSession } from "./session";
import type { Profile } from "./types";
import { useLiveRefresh } from "./useLiveRefresh";

/**
 * A coach's plan edit — or the athlete's own device finishing a sync — should
 * show up here without a pull-to-refresh. 25s, foreground-only; see
 * `useLiveRefresh`.
 */
const LIVE_REFRESH_MS = 25_000;

/** "idle" = nobody has asked yet. A screen sees it exactly as it sees "loading". */
export type ProfileState = "idle" | "loading" | "ready" | "failed";

export type ProfileValue = {
  /** null means never loaded — the screen owes the athlete a skeleton, never a dash. */
  profile: Profile | null;
  state: ProfileState;
  /** A refetch in flight over data already on the glass. */
  refreshing: boolean;
  /** Force a refetch. Keeps the current data visible throughout. */
  refresh: () => Promise<void>;
  /** Call after a write that changes what `/me` returns. */
  invalidate: () => void;
};

type Store = ProfileValue & { ensure: () => void };

const ProfileContext = createContext<Store | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { signOut } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<ProfileState>("idle");
  const [refreshing, setRefreshing] = useState(false);

  /** The one request in flight, if any. Every concurrent caller gets this. */
  const inFlight = useRef<Promise<void> | null>(null);
  /** Mirrors `profile` so the callbacks below never have to be re-created. */
  const held = useRef<Profile | null>(null);
  /** Whether any consumer has asked yet. The first one starts the load. */
  const started = useRef(false);

  const load = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    // Over data already on screen this is a refresh; with nothing on screen it
    // is the first load. Only the second one is allowed to move `state` off
    // whatever the screens are currently rendering from.
    if (held.current === null) setState("loading");
    else setRefreshing(true);

    const run = getProfile()
      .then((next) => {
        held.current = next;
        setProfile(next);
        setState("ready");
      })
      .catch((err: unknown) => {
        /*
         * DELIBERATELY FIRST, and deliberately unguarded. A revoked token has
         * to end the session whether or not the screen that triggered this
         * fetch is still mounted — `signOut()` sets state on the session
         * provider, not here, and the gate then unmounts this whole subtree.
         */
        if (isUnauthorized(err)) {
          void signOut();
          return;
        }
        // NEVER `setProfile(null)`. A transport failure is a fact about the
        // network, not about the athlete, and the numbers already on screen
        // were true when they were fetched.
        setState("failed");
      })
      .finally(() => {
        inFlight.current = null;
        setRefreshing(false);
      });

    inFlight.current = run;
    return run;
  }, [signOut]);

  const ensure = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    started.current = true;
    return load();
  }, [load]);

  const invalidate = useCallback(() => {
    // Nothing loaded means nothing to correct: the next consumer's lazy first
    // load runs after this write and gets the new value anyway.
    if (held.current === null) return;
    void load();
  }, [load]);

  const value = useMemo<Store>(
    () => ({ profile, state, refreshing, refresh, invalidate, ensure }),
    [profile, state, refreshing, refresh, invalidate, ensure]
  );

  // Still LAZY: `started` is read fresh on every tick rather than captured,
  // so a poll before any screen has asked for `/me` does nothing — the same
  // rule `ensure()` enforces, just checked here on a timer instead of on
  // mount. A refetch already in flight is a no-op too: `load()` returns the
  // same in-flight promise rather than starting a second request.
  useLiveRefresh(() => {
    if (started.current) void load();
  }, LIVE_REFRESH_MS);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/** Subscribes to the profile AND starts the first fetch if nobody has yet. */
export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext);
  const ensure = ctx?.ensure;
  useEffect(() => {
    ensure?.();
  }, [ensure]);
  if (!ctx) {
    // A screen rendering outside the provider would fetch nothing forever and
    // sit on its skeleton, which is indistinguishable from a slow network.
    throw new Error("useProfile must be used inside <ProfileProvider>.");
  }
  return ctx;
}

/**
 * `invalidate` on its own, for a screen that CHANGES what `/me` returns without
 * reading it.
 *
 * Home is the only one: it posts the check-in, and its own data comes from the
 * 5.3 KB `/home`. Reaching `invalidate` through `useProfile()` there would trip
 * the lazy first fetch and pull 57 KB on every cold start for a payload the
 * home screen never renders — the exact cost the lazy load exists to avoid.
 */
export function useInvalidateProfile(): () => void {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useInvalidateProfile must be used inside <ProfileProvider>.");
  }
  return ctx.invalidate;
}
