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

import { clearAllStoredState, getToken } from "./auth";
import { exitDemo } from "./demo";

export type SessionStatus = "loading" | "in" | "out";

type SessionValue = {
  status: SessionStatus;
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
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");

  const resolve = useCallback(async () => {
    const token = await getToken();
    setStatus(token ? "in" : "out");
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
    return () => {
      alive = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    const erased = await clearAllStoredState();
    /*
     * The demo overlay goes with everything else. It holds no athlete data —
     * only the writes the demo pretended to make — but leaving it behind would
     * let a real pairing inherit a demo check-in, and "signed out clears
     * everything" is a rule worth having no exceptions to.
     */
    exitDemo();
    setStatus("out");
    return { erased };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, refresh: resolve, signOut }),
    [status, resolve, signOut]
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
