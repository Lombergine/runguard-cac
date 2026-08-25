import { resolveAthleteWithPath } from "@/lib/apiAuth";
import { buildProfile } from "@/lib/profile";
import { logChat, chatHistory, lastUserEngine, isFollowUp } from "@/lib/chat";
import { safetyIntercept, replyFor } from "@/lib/safety";
import { coachAnswer } from "@/lib/coach";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await resolveAthleteWithPath(request, body.athleteId ?? null);
  if (!auth) return Response.json({ error: "Not authorized" }, { status: 401 });
  // A coach may READ a redacted transcript (see GET) but may never WRITE to it.
  // The coach path reaching this handler meant a coach could type into the
  // athlete's chat tab, receive a crisis intercept on their own screen, and have
  // both rows written into the athlete's private transcript tagged
  // `safety:<id>` — as if the athlete had disclosed it. `includeSafety: false`
  // does nothing here; only refusing the write does. Rejected before the message
  // is even read, so no coach text ever reaches safetyIntercept or logChat.
  if (auth.via === "coach") {
    return Response.json(
      { error: "This is the athlete's private chat. Coaches can't post to it." },
      { status: 403 }
    );
  }
  const athlete = auth.athlete;
  const q = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!q) return Response.json({ error: "Empty message" }, { status: 400 });

  // SAFETY FIRST — before buildProfile, before the intent engine, before any
  // future model. Pure regex with no I/O, so it fires identically whether
  // everything downstream is healthy or dead. Both rows are tagged, including
  // the athlete's own message, which is what keeps it off the coach's screen.
  const safe = safetyIntercept(q);
  if (safe) {
    await logChat(athlete.id, "user", q, `safety:${safe.id}`);
    await logChat(athlete.id, "assistant", safe.reply, `safety:${safe.id}`);
    return Response.json({ reply: safe.reply, safety: true });
  }

  // A thin follow-up after a safety reply must not fall through to the intent
  // engine. "why?" after a crisis disclosure has no trigger words of its own, so
  // it would score on `mental` and return race-nerves advice — reinstating, one
  // turn later, the exact bug the intercept above exists to fix.
  const prev = await lastUserEngine(athlete.id);
  if (prev?.startsWith("safety:") && isFollowUp(q)) {
    const reply = replyFor(prev.slice("safety:".length));
    if (reply) {
      await logChat(athlete.id, "user", q, prev);
      await logChat(athlete.id, "assistant", reply, prev);
      return Response.json({ reply, safety: true });
    }
  }

  const profile = await buildProfile(athlete.id);
  if (!profile) return Response.json({ error: "No athlete" }, { status: 404 });

  await logChat(athlete.id, "user", q);
  // The local model, if one is configured. Every failure inside coachAnswer —
  // model down, timeout, busy, unsafe output, a number it wasn't given — returns
  // the rule engine's answer, so this can only ever be as bad as before.
  const r = await coachAnswer(q, profile);
  await logChat(athlete.id, "assistant", r.text, r.engine);
  // The rule engine and the local model both land here, and neither is a safety
  // intercept — those returned above. A client can therefore trust `safety` to
  // mean "this reply came from safety.ts", not "this reply mentions something
  // serious".
  return Response.json({ reply: r.text, safety: false });
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
    history: await chatHistory(r.athlete.id, 30, { includeSafety: r.via !== "coach" }),
  });
}
