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
 * Without it the Unpair button was theatre on a dev build: erasing the keychain
 * entry left the next `getToken()` returning `DEV_TOKEN`, and the app was
 * authenticated again — which also meant every signed-out state in the app was
 * unreachable during testing, and so untested.
 *
 * PROCESS-LIFETIME ONLY. Killing and relaunching a dev build after a sign-out
 * re-arms the fallback. That is dev-only by construction (`DEV_TOKEN` folds to
 * null in a release bundle), but it does mean "signed out" is not durable on a
 * machine with `EXPO_PUBLIC_DEV_TOKEN` set.
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
 * `runguard.health.state` was the miss: the old token-only erase deleted just
 * `KEY`, so a signed-out phone still rendered the previous athlete's last-sync
 * date and their workout and metric counts on the Connect screen. Two
 * timestamps and four integers are not health data, but they are
 * athlete-derived and they were outliving the credential that produced them.
 *
 * Anything added here must be added to this list. That is the whole contract,
 * and it is a convention rather than a structure: `runguard.health.state` is
 * spelled independently here and at `lib/health.ts` (`STATE_KEY`), so a rename
 * there would orphan this entry with no type error.
 */
const ALL_KEYS = [KEY, "runguard.health.state"] as const;

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
