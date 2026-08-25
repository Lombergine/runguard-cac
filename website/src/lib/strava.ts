import crypto from "crypto";
import { getAthlete, insertActivity, AthleteRow } from "./db";
import { one, run } from "./db/driver";
import { secret } from "./session";

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

export function stravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

/**
 * The OAuth `state`, which is the only thing standing between a stranger and
 * an athlete's Strava tokens: whatever athlete the callback reads out of it is
 * the row the callback writes an access token onto.
 *
 * It used to be a 16-hex-char (64-bit) HMAC over the athlete id, with no
 * expiry and no record of ever having been spent. Three consequences, all
 * fixed below:
 *
 *   - 64 bits is a forgeable tag, and the message space is tiny (the id is a
 *     small integer), so a single leaked state also leaked a verifier for
 *     offline grinding. The HMAC is now full length and compared with
 *     timingSafeEqual, the same way verifyCoachCookie does in session.ts.
 *   - It never expired. A `state` is in flight for one browser redirect chain;
 *     ten minutes is generous for that and bounds how long a leaked one is
 *     worth anything.
 *   - It was replayable forever. Anyone who saw one callback URL — referrer,
 *     proxy log, a shared browser's history — could re-fire it repeatedly and
 *     each replay would rewrite that athlete's tokens with whichever Strava
 *     account they had authorised, and backfill that account's history into a
 *     minor's training record.
 *
 * Single use cannot be expressed in a self-contained token: something on the
 * server has to remember that this one was spent. That memory is the
 * strava_oauth_states row, which doubles as the permission itself — it is
 * created only after /api/strava/connect has authenticated the caller, and the
 * callback takes the athlete id from the row rather than from the URL.
 */
const STATE_TTL_S = 600;

function stateSig(iat: number, nonce: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`strava:${iat}:${nonce}`)
    .digest("hex");
}

/** Record a pending handshake and return the `state` that redeems it. */
async function issueState(athleteId: number): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString("hex");
  // Handshakes that were started and abandoned would otherwise accumulate
  // forever; sweeping here keeps the table the size of what is actually in
  // flight without needing a scheduled job.
  await run("DELETE FROM strava_oauth_states WHERE expires_at <= ?", [iat]);
  await run(
    "INSERT INTO strava_oauth_states (nonce, athlete_id, expires_at) VALUES (?, ?, ?)",
    [nonce, athleteId, iat + STATE_TTL_S]
  );
  return `${iat}.${nonce}.${stateSig(iat, nonce)}`;
}

/**
 * Redeem a `state`. Returns the athlete id it was issued for, or null — and
 * consumes it, so a second call with the same value returns null.
 */
export async function verifyState(state: string): Promise<number | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [rawIat, nonce, sig] = parts;
  const iat = Number(rawIat);
  if (!Number.isInteger(iat)) return null;

  const expected = stateSig(iat, nonce);
  try {
    // Throws on a length mismatch, which is why it is inside the try — an
    // attacker-supplied sig is any length at all.
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (iat > now + 60 || now - iat > STATE_TTL_S) return null;

  // Read and consume in one statement. Two concurrent replays both reach this
  // line; only one DELETE can match a given row, so only one gets a row back.
  const row = await one<{ athlete_id: number }>(
    "DELETE FROM strava_oauth_states WHERE nonce = ? AND expires_at > ? RETURNING athlete_id",
    [nonce, now]
  );
  if (!row) return null;
  const athleteId = Number(row.athlete_id);
  return Number.isInteger(athleteId) ? athleteId : null;
}

export async function authorizeUrl(athleteId: number, origin: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${origin}/api/strava/callback`,
    approval_prompt: "auto",
    scope: "activity:read_all",
    state: await issueState(athleteId),
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`);
  return res.json();
}

async function freshToken(athlete: AthleteRow): Promise<string> {
  if (
    athlete.strava_expires_at &&
    athlete.strava_expires_at * 1000 > Date.now() + 60000 &&
    athlete.strava_access_token
  ) {
    return athlete.strava_access_token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: athlete.strava_refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`);
  const tok = (await res.json()) as TokenResponse;
  await run(
    "UPDATE athletes SET strava_access_token=?, strava_refresh_token=?, strava_expires_at=? WHERE id=?",
    [tok.access_token, tok.refresh_token, tok.expires_at, athlete.id]
  );
  return tok.access_token;
}

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  distance: number;
  moving_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
};

function storeActivity(athleteId: number, act: StravaActivity): Promise<boolean> {
  return insertActivity({
    athlete_id: athleteId,
    source: "strava",
    external_id: String(act.id),
    name: act.name,
    type: act.sport_type || act.type,
    start_time: act.start_date,
    distance_m: act.distance,
    duration_s: act.moving_time,
    avg_hr: act.average_heartrate ?? null,
    max_hr: act.max_heartrate ?? null,
    elevation_gain_m: act.total_elevation_gain ?? null,
  });
}

/**
 * Pull activities for one athlete. By default the trailing `days` window
 * (120d); pass `after`/`before` (unix seconds) to bound an initial historical
 * backfill to a specific date range instead. Returns count imported.
 */
export async function syncAthlete(
  athleteId: number,
  opts: { days?: number; after?: number; before?: number } = {}
): Promise<number> {
  const athlete = await getAthlete(athleteId);
  if (!athlete?.strava_refresh_token) return 0;
  const token = await freshToken(athlete);
  const after = opts.after ?? Math.floor((Date.now() - (opts.days ?? 120) * 86400000) / 1000);
  const before = opts.before;
  let page = 1;
  let imported = 0;
  for (;;) {
    const res = await fetch(
      `${API}/athlete/activities?after=${after}${before ? `&before=${before}` : ""}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Strava activities fetch failed: ${res.status}`);
    const batch = (await res.json()) as StravaActivity[];
    for (const act of batch) {
      if (await storeActivity(athlete.id, act)) imported++;
    }
    if (batch.length < 100) break;
    page++;
  }
  return imported;
}

/** Handle a webhook "new activity" event. */
export async function importOneActivity(
  stravaAthleteId: string,
  activityId: string
): Promise<void> {
  const athlete = await one<AthleteRow>(
    "SELECT * FROM athletes WHERE strava_athlete_id = ?",
    [stravaAthleteId]
  );
  if (!athlete) return;
  const token = await freshToken(athlete);
  const res = await fetch(`${API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  await storeActivity(athlete.id, (await res.json()) as StravaActivity);
}
