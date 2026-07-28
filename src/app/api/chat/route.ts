import { resolveAthlete } from "@/lib/apiAuth";
import { buildProfile } from "@/lib/profile";
import { answer, logChat, chatHistory } from "@/lib/chat";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });
  const q = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!q) return Response.json({ error: "Empty message" }, { status: 400 });

  const profile = buildProfile(athlete.id);
  if (!profile) return Response.json({ error: "No athlete" }, { status: 404 });

  logChat(athlete.id, "user", q);
  const reply = await answer(q, profile);
  logChat(athlete.id, "assistant", reply);
  return Response.json({ reply });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const athlete = await resolveAthlete(request, Number(url.searchParams.get("athleteId")) || null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });
  return Response.json({ history: chatHistory(athlete.id) });
}
