import { getDb, AthleteRow } from "@/lib/db";
import { buildProfile } from "@/lib/profile";

/** The iOS app fetches the athlete's complete RunGuard profile here. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const athlete = token
    ? (getDb()
        .prepare("SELECT * FROM athletes WHERE device_token = ?")
        .get(token) as AthleteRow | undefined)
    : undefined;
  if (!athlete) {
    return Response.json({ error: "Invalid device token" }, { status: 401 });
  }
  const profile = buildProfile(athlete.id);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
  // keep the payload phone-friendly
  const { series, yearDays, ...rest } = profile;
  return Response.json({
    ...rest,
    series: series.slice(-60).map(({ date, load, km, acwr }) => ({ date, load, km, acwr })),
    calendar: yearDays,
  });
}
