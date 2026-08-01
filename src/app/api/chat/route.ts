import { resolveAthlete, resolveAthleteWithPath } from "@/lib/apiAuth";
import { buildProfile } from "@/lib/profile";
import { answer, logChat, chatHistory, lastUserEngine, isFollowUp } from "@/lib/chat";
import { safetyIntercept, replyFor } from "@/lib/safety";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });
  const q = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!q) return Response.json({ error: "Empty message" }, { status: 400 });

  // SAFETY FIRST — before buildProfile, before the intent engine, before any
  // future model. Pure regex with no I/O, so it fires identically whether
  // everything downstream is healthy or dead. Both rows are tagged, including
  // the athlete's own message, which is what keeps it off the coach's screen.
  const safe = safetyIntercept(q);
  if (safe) {
    logChat(athlete.id, "user", q, `safety:${safe.id}`);
    logChat(athlete.id, "assistant", safe.reply, `safety:${safe.id}`);
    return Response.json({ reply: safe.reply });
  }

  // A thin follow-up after a safety reply must not fall through to the intent
  // engine. "why?" after a crisis disclosure has no trigger words of its own, so
  // it would score on `mental` and return race-nerves advice — reinstating, one
  // turn later, the exact bug the intercept above exists to fix.
  const prev = lastUserEngine(athlete.id);
  if (prev?.startsWith("safety:") && isFollowUp(q)) {
    const reply = replyFor(prev.slice("safety:".length));
    if (reply) {
      logChat(athlete.id, "user", q, prev);
      logChat(athlete.id, "assistant", reply, prev);
      return Response.json({ reply });
    }
  }

  const profile = buildProfile(athlete.id);
  if (!profile) return Response.json({ error: "No athlete" }, { status: 404 });

  logChat(athlete.id, "user", q);
  const reply = await answer(q, profile);
  logChat(athlete.id, "assistant", reply, "rules");
  return Response.json({ reply });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const r = await resolveAthleteWithPath(
    request,
    Number(url.searchParams.get("athleteId")) || null
  );
  if (!r) return Response.json({ error: "Not authorized" }, { status: 401 });
  // A coach opening this athlete's chat tab gets the same exclusion the summary
  // panel does. Filtering chatSummary alone would have left the full transcript
  // one tab away, which is not a privacy fix.
  return Response.json({
    history: chatHistory(r.athlete.id, 30, { includeSafety: r.via !== "coach" }),
  });
}
