import crypto from "crypto";
import { getSql, getAthlete, insertActivity, AthleteRow } from "./db";

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

export function stravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function signState(athleteId: number): string {
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "milemarker-dev-secret")
    .update(String(athleteId))
    .digest("hex")
    .slice(0, 16);
  return `${athleteId}.${sig}`;
}

export function verifyState(state: string): number | null {
  const [id] = state.split(".");
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  return signState(n) === state ? n : null;
}

export function authorizeUrl(athleteId: number, origin: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${origin}/api/strava/callback`,
    approval_prompt: "auto",
    scope: "activity:read_all",
    state: signState(athleteId),
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
  await getSql()`
    update athletes set
      strava_access_token = ${tok.access_token},
      strava_refresh_token = ${tok.refresh_token},
      strava_expires_at = ${tok.expires_at}
    where id = ${athlete.id}`;
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

async function storeActivity(athleteId: number, act: StravaActivity): Promise<boolean> {
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
  const rows = (await getSql()`
    select * from athletes where strava_athlete_id = ${stravaAthleteId}`) as unknown as AthleteRow[];
  const athlete = rows[0];
  if (!athlete) return;
  const token = await freshToken(athlete);
  const res = await fetch(`${API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  await storeActivity(athlete.id, (await res.json()) as StravaActivity);
}
