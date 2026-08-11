/**
 * Device-token storage.
 *
 * The token is `dt_` + 40 hex (`newDeviceToken()`, `website/src/lib/db.ts`). It
 * NEVER EXPIRES and cannot be revoked, so a leak is permanent access to that
 * athlete's health data until someone edits the database by hand. Consequences:
 *
 *  - Keychain (`expo-secure-store`), never AsyncStorage.
 *  - Never log it, never put it in an error message, never send it to analytics.
 *    Nothing in this file prints a token, and nothing else should either.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "runguard.deviceToken";

/**
 * Dev fallback so a dev build runs with no pairing step. Read as a STATIC dot
 * path: Expo inlines `process.env.EXPO_PUBLIC_*` at build time by textual
 * substitution, so a computed lookup like `process.env[name]` comes back
 * undefined.
 */
/**
 * Dev-only, and ONLY in a dev build.
 *
 * `__DEV__` is a compile-time constant, so in a release bundle this whole
 * expression folds to `null` and the token never reaches the shipped JavaScript.
 * That matters because Expo inlines `EXPO_PUBLIC_*` by TEXTUAL SUBSTITUTION: a
 * release build produced on a machine with the variable set would otherwise bake
 * a live, non-expiring device token for a real athlete into the bundle.
 */
const DEV_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_DEV_TOKEN || null : null;

/**
 * Set once someone signs out in this process, to stop the dev fallback signing
 * them straight back in.
 *
 * Without it the Unpair button was theatre on a dev build: `clearToken()`
 * deleted the keychain entry, the next `getToken()` returned `DEV_TOKEN`, and
 * the app was authenticated again — which also meant every signed-out state in
 * the app was unreachable during testing, and so untested.
 */
let devFallbackRevoked = false;

/** The stored token, or the dev fallback, or null. */
export async function getToken(): Promise<string | null> {
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(KEY);
  } catch {
    // SecureStore is unavailable on web and can reject on a locked keychain.
    // Swallow rather than crashing at launch; the error object could carry the
    // key, so it is deliberately not surfaced.
    stored = null;
  }
  if (stored) return stored;
  return devFallbackRevoked ? null : DEV_TOKEN;
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
  // A real sign-in re-arms the dev fallback for the next sign-out cycle.
  devFallbackRevoked = false;
}

/**
 * Every SecureStore key this app writes. Signing out clears ALL of them.
 *
 * `runguard.health.state` was the miss: `clearToken()` deleted only the token,
 * so a signed-out phone still rendered the previous athlete's last-sync date
 * and their workout and metric counts on the Connect screen. Two timestamps and
 * four integers are not health data, but they are athlete-derived and they were
 * outliving the credential that produced them.
 *
 * Anything added here must be added to this list. That is the whole contract.
 */
const ALL_KEYS = [KEY, "runguard.health.state"] as const;

/** @deprecated Use `clearAllStoredState`, or `signOut()` from lib/session. */
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/**
 * Erase every stored key. Returns whether all of them actually went.
 *
 * Never throws: the caller's job is to end the session regardless, and a
 * rejected delete must not leave the UI showing athlete data. `erased: false`
 * lets a screen add "nothing changed — this device is still paired" without
 * that decision changing whether the gate closes.
 */
export async function clearAllStoredState(): Promise<boolean> {
  const results = await Promise.all(
    ALL_KEYS.map((k) =>
      SecureStore.deleteItemAsync(k).then(
        () => true,
        () => false
      )
    )
  );
  devFallbackRevoked = true;
  return results.every(Boolean);
}
