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
const DEV_TOKEN = process.env.EXPO_PUBLIC_DEV_TOKEN || null;

/** The stored token, or the dev fallback, or null. */
export async function getToken(): Promise<string | null> {
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(KEY);
  } catch {
    // SecureStore is unavailable on web and can reject on a locked keychain.
    // Swallow and fall through to the dev token rather than crashing at launch;
    // the error object could carry the key, so it is deliberately not surfaced.
    stored = null;
  }
  return stored ?? DEV_TOKEN;
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
