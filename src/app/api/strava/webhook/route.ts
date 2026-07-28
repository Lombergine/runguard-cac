import { importOneActivity } from "@/lib/strava";

/** Strava webhook subscription validation. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.STRAVA_VERIFY_TOKEN || "milemarker";
  if (mode === "subscribe" && token === expected && challenge) {
    return Response.json({ "hub.challenge": challenge });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Strava pushes new-activity events here — this is the real-time sync. */
export async function POST(request: Request) {
  const event = await request.json().catch(() => null);
  if (
    event &&
    event.object_type === "activity" &&
    (event.aspect_type === "create" || event.aspect_type === "update")
  ) {
    // Respond fast; do the import without blocking Strava's 2s timeout.
    importOneActivity(String(event.owner_id), String(event.object_id)).catch(
      () => {}
    );
  }
  return Response.json({ ok: true });
}
