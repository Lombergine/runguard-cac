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
 * The COACH session token, for the coach side of the app.
 *
 * A different credential to a different thing, so a different key. The athlete
 * token reaches one person's health data; this one reaches an entire team's —
 * every athlete's soreness, sleep and heart rate — which makes it the most
 * sensitive string this app can hold.
 *
 * Its value is the same signed `teamId.hmac` the web coach session carries
 * (`website/src/lib/session.ts` → `mintCoachToken`), so it cannot be forged
 * without `SESSION_SECRET`, and rotating that secret invalidates it everywhere
 * at once. It also cannot be revoked individually — there is no per-device row
 * to delete — so on a lost phone the only lever is rotating the secret, which
 * signs every coach out. Same rules as the athlete token otherwise: Keychain
 * only, never logged, never rendered, cleared on sign-out.
 *
 * DELETING THE APP IS NOT SIGNING OUT. Measured on the simulator: uninstall,
 * reinstall, deep-link to /coach, and the roster came straight back with no
 * sign-in. SecureStore is the iOS Keychain, and Keychain items outlive the app
 * that wrote them. So `signOutCoach()` is the only thing that actually ends a
 * coach session — telling someone to "just delete the app" leaves a working
 * credential for a whole team's health data on a phone they no longer own.
 * (The guard itself is sound: with the key genuinely absent, /coach does not
 * mount. The persistence is the finding, not a hole.)
 */
const COACH_KEY = "runguard.coachToken";

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
 * Which side of the app a dev token signs in, read off the token itself.
 *
 * `website/scripts/dev-token.ts` mints EITHER role into `EXPO_PUBLIC_DEV_TOKEN`
 * and says the app reads which from the shape. It did not: the value was only
 * ever offered as an ATHLETE token, so `dev-token.ts coach 1` put a coach
 * session in the athlete slot, `/api/mobile/me` refused it, and the app landed
 * on the athlete tabs reading "this device isn't signed in yet" — with no way
 * to reach the coach screens at all on a dev build.
 *
 * The forms are domain-separated at the signature (`coach:<teamId>` versus
 * `athlete:<athleteId>`), so neither verifier can accept the other's value.
 * The `a.` prefix on an athlete token is what makes them tellable apart here
 * without trying to verify anything — see `signAthleteToken` in
 * website/src/lib/session.ts.
 */
const DEV_TOKEN_IS_COACH = DEV_TOKEN !== null && !DEV_TOKEN.startsWith("a.");

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

/**
 * Drop a stored athlete token the server has refused.
 *
 * A stored token SHADOWS the dev fallback — `getToken` returns it first — so a
 * keychain entry the server no longer accepts left the app permanently
 * "signed in" to an account every request 401s on: Home rendered its
 * signed-out copy while the session said otherwise, and no dev token could get
 * past it. iOS keychain items outlive the app that wrote them, so reinstalling
 * did not clear it either.
 *
 * The device-token era ended when `/api/mobile/me` moved to a signed athlete
 * session, which makes every token minted before that switch exactly this
 * case.
 */
export async function clearStaleToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing to do: the entry is unreadable, which is indistinguishable from
    // absent for every caller.
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
  // A real sign-in re-arms the dev fallback for the next sign-out cycle.
  devFallbackRevoked = false;
}

/**
 * The coach token, or null.
 *
 * Deliberately has NO dev fallback. `getToken()` has one so a dev build runs
 * without a pairing step, and that is a reasonable trade for one athlete's
 * seeded data. The coach equivalent would hand a whole team's records to any
 * build that happened to have an env var set, and — unlike the athlete
 * fallback, which `__DEV__` folds away — there is no version of that which is
 * worth the convenience. A coach signs in.
 */
export async function getCoachToken(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(COACH_KEY);
    if (stored) return stored;
    return DEV_TOKEN_IS_COACH ? DEV_TOKEN : null;
  } catch {
    // Same reasoning as getToken: a locked keychain must not crash launch, and
    // the error object could carry the key, so it is not surfaced.
    return null;
  }
}

export async function setCoachToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(COACH_KEY, token);
}

/**
 * End the coach session only, leaving any athlete session alone.
 *
 * The two are separate credentials and one phone may legitimately hold both —
 * a coach who also runs. `clearAllStoredState()` is still what sign-out calls;
 * this is for leaving the coach side specifically.
 */
export async function clearCoachToken(): Promise<boolean> {
  return SecureStore.deleteItemAsync(COACH_KEY).then(
    () => true,
    () => false
  );
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
const ALL_KEYS = [KEY, COACH_KEY, "runguard.health.state"] as const;

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
