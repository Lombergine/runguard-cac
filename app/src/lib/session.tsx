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
 *
 * TWO KINDS OF SESSION now come through here, an athlete's and a coach's, and
 * `role` says which. The gate itself does not change shape: there is still one
 * credential on the device at a time (`lib/auth.ts`), so "is anyone signed in"
 * still has one answer, and "as whom" is a second field rather than a second
 * gate. Signing in either way overwrites the other, and signing out erases both.
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

import { clearAllStoredState, getCredential, type Role } from "./auth";
import { exitDemo } from "./demo";

export type SessionStatus = "loading" | "in" | "out";

/**
 * Whose session this is. Re-exported from `auth` so a screen asking "am I a
 * coach" does not have to reach into the credential store to find out.
 */
export type SessionRole = Role;

type SessionValue = {
  status: SessionStatus;
  /**
   * Which of the two credentials the gate opened on, and null whenever
   * `status` is not "in".
   *
   * There is exactly one at a time (`lib/auth.ts` deletes the other key before
   * writing either), so this is a fact read off the keychain rather than a
   * preference: an athlete session and a coach session cannot overlap, and a
   * consumer branching on it is branching on which token `lib/api.ts` will
   * send.
   */
  role: SessionRole | null;
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

/**
 * Status and role move TOGETHER, in one state object.
 *
 * Two `useState`s would render once in between — signed in with the outgoing
 * role, or the incoming role with the outgoing status — and that frame is
 * exactly long enough to mount an athlete tab bar for a coach, or to key the
 * profile store (app/_layout.tsx) on a pair that never really existed.
 */
type Gate = { status: SessionStatus; role: SessionRole | null };

const SessionContext = createContext<SessionValue | null>(null);

function gateFor(credential: { role: SessionRole } | null): Gate {
  return credential ? { status: "in", role: credential.role } : { status: "out", role: null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ status: "loading", role: null });

  const resolve = useCallback(async () => {
    setGate(gateFor(await getCredential()));
  }, []);

  useEffect(() => {
    let alive = true;
    getCredential()
      .then((credential) => {
        if (alive) setGate(gateFor(credential));
      })
      // A keychain read that throws is not a session. Fail closed.
      .catch(() => {
        if (alive) setGate({ status: "out", role: null });
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
    setGate({ status: "out", role: null });
    return { erased };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status: gate.status, role: gate.role, refresh: resolve, signOut }),
    [gate, resolve, signOut]
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
