/**
 * Credential storage. TWO credentials exist, and never at the same time.
 *
 * ATHLETE — a session token, `a.<athleteId>.<hmac>`
 * (`website/src/lib/session.ts`), obtained by signing in with an email and a
 * password and by no other means.
 *
 * It REPLACES `athletes.device_token`, which was `dt_` + 40 hex, never expired,
 * could not be revoked, and was the whole credential for a minor's health data.
 * That column is gone from the product: there is no pairing screen, no code to
 * paste, and nothing on any surface that can hand one out. What is stored here
 * is derived rather than permanent — signing out ends it.
 *
 * COACH — `<teamId>.<hmac>` (`signTeam()`, `website/src/lib/session.ts`), the
 * same signed value the web dashboard carries in its cookie. It is strictly
 * WORSE to leak than an athlete's: it reads the whole roster of minors. That
 * is why there is no dev fallback for it below, and why it never appears in a
 * `__DEV__` convenience of any kind.
 *
 * Consequences, for both:
 *
 *  - Keychain (`expo-secure-store`), never AsyncStorage.
 *  - Never log it, never put it in an error message, never send it to analytics.
 *    Nothing in this file prints a token, and nothing else should either.
 *
 * ONE ROLE AT A TIME. `setToken` and `setCoachToken` each delete the other key
 * before writing their own, and `getCredential()` refuses to answer if both are
 * somehow present. Two stored credentials would leave `lib/api.ts` choosing
 * which one to put in the Authorization header, and there is no correct way to
 * guess that.
 */
import * as SecureStore from "expo-secure-store";

/** Who a stored credential belongs to. One or the other, never both. */
export type Role = "athlete" | "coach";

/** A stored credential and whose it is. The token is for the header only. */
export type Credential = { role: Role; token: string };

const KEY = "runguard.sessionToken";
const COACH_KEY = "runguard.coachToken";

/**
 * The key this app used to store the athlete's device token under. NOTHING
 * READS IT — it is here only so `ALL_KEYS` erases it, because a phone upgrading
 * from a build that had one is still carrying that permanent credential in its
 * keychain and nothing else would ever take it off.
 */
const RETIRED_DEVICE_TOKEN_KEY = "runguard.deviceToken";

/**
 * Dev fallback so a dev build runs without typing an email and password every
 * launch. The VALUE is now a session token rather than a device token, which
 * changes nothing here: it is a string that goes in the Authorization header.
 *
 * Read as a STATIC dot path — Expo inlines `process.env.EXPO_PUBLIC_*` at build
 * time by textual substitution, so a computed lookup like `process.env[name]`
 * comes back undefined.
 *
 * Dev-only, and ONLY in a dev build. `__DEV__` is a compile-time constant, so in
 * a release bundle this whole expression folds to `null` and the token never
 * reaches the shipped JavaScript. That matters because of the same textual
 * substitution: a release build produced on a machine with the variable set
 * would otherwise bake a live session for a real athlete into the bundle.
 */
const DEV_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_DEV_TOKEN || null : null;

/**
 * Which role a dev token is for, read off the token itself.
 *
 * ONE variable rather than two, because two would reintroduce a state this file
 * works hard to make unreachable: `getCredential()` fails closed when both an
 * athlete and a coach credential exist, and a second env var would be exactly
 * that pair — with no setter in between to delete the other one.
 *
 * The two kinds are already distinguishable, and not by guesswork: an athlete
 * session is `a.<athleteId>.<hmac>`, a coach session `<teamId>.<hmac>`
 * (`website/src/lib/session.ts`). They sign different strings, so this only
 * chooses which header a dev build sends — a token in the wrong slot is refused
 * by the server rather than accepted as the other role.
 *
 * So moving the simulator between an athlete and a coach is one line of
 * `app/.env`, which is the whole ergonomic point of the fallback.
 */
function devRole(token: string): Role {
  return token.startsWith("a.") ? "athlete" : "coach";
}

/**
 * Set once someone signs out in this process, to stop the dev fallback signing
 * them straight back in.
 *
 * Without it the Sign out button was theatre on a dev build: erasing the
 * keychain entry left the next `getToken()` returning `DEV_TOKEN`, and the app
 * was authenticated again — which also meant every signed-out state in the app
 * was unreachable during testing, and so untested.
 *
 * PROCESS-LIFETIME ONLY. Killing and relaunching a dev build after a sign-out
 * re-arms the fallback. That is dev-only by construction (`DEV_TOKEN` folds to
 * null in a release bundle), but it does mean "signed out" is not durable on a
 * machine with `EXPO_PUBLIC_DEV_TOKEN` set.
 */
let devFallbackRevoked = false;

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // SecureStore is unavailable on web and can reject on a locked keychain.
    // Swallow rather than crashing at launch; the error object could carry the
    // key, so it is deliberately not surfaced.
    return null;
  }
}

/**
 * The one credential this device holds, or null. THE single resolution point —
 * `getToken()` and `lib/api.ts` both go through it, so nothing downstream has to
 * work out which token to send.
 *
 * Both keys present is a state the setters below make unreachable, so if it
 * happens a delete failed halfway through a role switch. FAILS CLOSED: no
 * session at all, rather than picking one at random and authenticating as
 * whoever the coin landed on. Signing in again overwrites both keys and
 * recovers.
 *
 * The dev fallback comes LAST and only when nothing is stored. Otherwise a dev
 * build with `EXPO_PUBLIC_DEV_TOKEN` set would resolve two credentials for a
 * signed-in coach after every relaunch (the revocation below is process
 * lifetime only) and lock them out by the rule above.
 */
export async function getCredential(): Promise<Credential | null> {
  const [athlete, coach] = await Promise.all([read(KEY), read(COACH_KEY)]);
  if (athlete && coach) return null;
  if (athlete) return { role: "athlete", token: athlete };
  if (coach) return { role: "coach", token: coach };
  const dev = devFallbackRevoked ? null : DEV_TOKEN;
  return dev ? { role: devRole(dev), token: dev } : null;
}

/**
 * The athlete's token, or the dev fallback, or null — and null while a COACH is
 * signed in, which is why this reads through `getCredential()` rather than the
 * key directly. An athlete-only caller must not be handed a coach's token
 * because it happens to be the string that is there.
 */
export async function getToken(): Promise<string | null> {
  const credential = await getCredential();
  return credential?.role === "athlete" ? credential.token : null;
}

/**
 * Sign in as an athlete. Clears the coach key FIRST, so there is no instant at
 * which both are on disk: a rejected delete throws before anything is written,
 * and the caller reports a storage failure instead of half-switching role.
 */
export async function setToken(token: string): Promise<void> {
  await SecureStore.deleteItemAsync(COACH_KEY);
  await SecureStore.setItemAsync(KEY, token);
  // A real sign-in re-arms the dev fallback for the next sign-out cycle.
  devFallbackRevoked = false;
}

/**
 * Sign in as a coach. Mirror of `setToken`: the athlete key goes first.
 *
 * It also REVOKES the dev fallback, which is not symmetry — it is the only way
 * a coach session is single-credential on a dev machine. `DEV_TOKEN` is
 * athlete-only and needs no stored key to resolve, so leaving it armed would
 * mean `getCredential()` saw an athlete token and a coach token at once.
 */
export async function setCoachToken(token: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  await SecureStore.setItemAsync(COACH_KEY, token);
  devFallbackRevoked = true;
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
 *
 * `COACH_KEY` is in it for the same reason the athlete's session is, one step
 * worse: a signed-out phone that kept it would still be holding a credential for
 * every athlete on the roster, not just one.
 *
 * `RETIRED_DEVICE_TOKEN_KEY` is in it because RENAMING `KEY` orphans whatever
 * the previous build wrote. Dropping the old spelling from this list is the bug
 * the paragraph above describes, in its worst form: the value left behind is the
 * non-expiring device token the product just removed, and it would sit in the
 * keychain of every upgraded phone forever.
 */
const ALL_KEYS = [KEY, COACH_KEY, RETIRED_DEVICE_TOKEN_KEY, "runguard.health.state"] as const;

/**
 * Erase every stored key. Returns whether all of them actually went.
 *
 * Never throws: the caller's job is to end the session regardless, and a
 * rejected delete must not leave the UI showing athlete data. `erased: false`
 * lets a screen add "the sign-in is still on this phone" without that decision
 * changing whether the gate closes.
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
