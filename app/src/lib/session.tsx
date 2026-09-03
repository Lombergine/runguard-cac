/**
 * The session gate. One source of truth for "is anyone signed in".
 *
 * WHY THIS EXISTS. Before it there was no route guard anywhere in the app: the
 * root layout never read the token, the tab navigator mounted unconditionally,
 * and every screen re-derived auth from its own caught error. Four of them
 * caught bare and rendered "Your runs could not be loaded" — the same sentence
 * an athlete sees when the Wi-Fi is down — with no way to sign in. A guard
 * assembled from fifteen independent catch blocks is not a guard.
 *
 * THE RULE THIS ENFORCES: with no session, the authed navigator does not mount.
 * Not hidden behind a conditional render, not covered by an overlay — not
 * mounted. A screen that never mounts cannot fetch, cannot hold state, and
 * cannot leave anything on the glass for the next person holding the phone.
 *
 * `signOut()` is the ONLY sanctioned way out. It clears every credential-adjacent
 * key, not just the token — see `clearAllStoredState`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clearAllStoredState, clearCoachToken, getCoachToken, getToken } from "./auth";

export type SessionStatus = "loading" | "in" | "out";

type SessionValue = {
  status: SessionStatus;
  /**
   * The COACH session, tracked independently of the athlete one.
   *
   * Two credentials, two gates, no coupling. A coach is usually not an athlete
   * and an athlete is never a coach, but one phone may legitimately hold both —
   * a coach who also runs — and neither signing in nor signing out of one side
   * may touch the other. Deriving coach status from `status` would mean a coach
   * with no athlete pairing had no way in at all.
   *
   * This exists on the SESSION rather than inside the coach screens because the
   * root layout's gate is a deny-list: an undeclared or unguarded route file is
   * reachable in every state. A coach route has to be guardable by the same
   * `Stack.Protected` mechanism as everything else, and that needs a boolean
   * here.
   */
  coachStatus: SessionStatus;
  /**
   * Re-reads the keychain. Call after a successful sign-in so the gate flips
   * without a relaunch.
   */
  refresh: () => Promise<void>;
  /**
   * Clears every stored key and flips the gate to "out".
   *
   * FAILS CLOSED. If the keychain write rejects — it can, on a locked device —
   * the status still becomes "out", so the UI never keeps showing athlete data
   * after someone asked to leave. `clearAllStoredState` reports whether the
   * erase actually succeeded, and callers that need to warn the user ("nothing
   * changed, the device is still paired") read that. What we do not do is stay
   * signed in because a delete failed.
   */
  signOut: () => Promise<{ erased: boolean }>;
  /** Re-reads the coach key. Call after a successful coach sign-in. */
  refreshCoach: () => Promise<void>;
  /**
   * Leaves the coach side only, and leaves any athlete session untouched.
   *
   * Fails closed exactly like `signOut`: the gate flips to "out" whether or not
   * the keychain delete succeeded, because a failed erase must never leave a
   * team's roster on the glass.
   */
  signOutCoach: () => Promise<{ erased: boolean }>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [coachStatus, setCoachStatus] = useState<SessionStatus>("loading");

  const resolve = useCallback(async () => {
    const token = await getToken();
    setStatus(token ? "in" : "out");
  }, []);

  const resolveCoach = useCallback(async () => {
    const token = await getCoachToken();
    setCoachStatus(token ? "in" : "out");
  }, []);

  useEffect(() => {
    let alive = true;
    getToken()
      .then((token) => {
        if (alive) setStatus(token ? "in" : "out");
      })
      // A keychain read that throws is not a session. Fail closed.
      .catch(() => {
        if (alive) setStatus("out");
      });
    getCoachToken()
      .then((token) => {
        if (alive) setCoachStatus(token ? "in" : "out");
      })
      .catch(() => {
        if (alive) setCoachStatus("out");
      });
    return () => {
      alive = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    const erased = await clearAllStoredState();
    setStatus("out");
    // `clearAllStoredState` erases EVERY key including the coach token, so the
    // coach gate has to follow or it would still read "in" against a key that
    // is gone. Signing out of the app signs out of both sides.
    setCoachStatus("out");
    return { erased };
  }, []);

  const signOutCoach = useCallback(async () => {
    const erased = await clearCoachToken();
    setCoachStatus("out");
    return { erased };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      coachStatus,
      refresh: resolve,
      refreshCoach: resolveCoach,
      signOut,
      signOutCoach,
    }),
    [status, coachStatus, resolve, resolveCoach, signOut, signOutCoach]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    // A screen rendering outside the provider would silently behave as though
    // signed in, which is the one failure mode this module exists to prevent.
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return ctx;
}
