import { getAthleteByEmail, getTeamByCoachEmail } from "@/lib/db";
import { issueReset, RESET_TTL_MINUTES, type Subject } from "@/lib/passwordReset";
import { mailConfigured, resetEmail, sendMail } from "@/lib/mail";
import { checkAuthRate, tooManyAttempts } from "@/lib/rateLimit";

/**
 * Ask for a reset link.
 *
 * THE ANSWER IS ALWAYS THE SAME. Found or not found, sent or failed to send,
 * configured or not — this returns one identical 200. That is the whole security
 * property of this endpoint: any difference between the two cases turns it into
 * a membership oracle, and the membership in question is "which minors are on
 * this team". A visitor could otherwise walk a list of school addresses through
 * it and learn which children are registered, without ever signing in.
 *
 * Which means the caller must resist every instinct to be helpful here. No
 * "we don't have that email", no "check your spelling", and no reporting the
 * mail provider's failure. Timing is not equalised — the send is awaited only on
 * the hit — which is a known, accepted narrowing; the response body and status
 * are what a scripted enumeration reads.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role: Subject = body.role === "coach" ? "coach" : "athlete";

  // One wording for a malformed address, since that is a fact about the input
  // rather than about the database.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  // Before the lookup, so a throttled request never reaches the database and its
  // 429 says nothing about whether the address is registered.
  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) return tooManyAttempts(gate.retryAfter);

  const ok = { ok: true, message: "If that account exists, a reset link is on its way." };

  const subjectId =
    role === "coach"
      ? (await getTeamByCoachEmail(email))?.id
      : (await getAthleteByEmail(email))?.id;

  if (subjectId === undefined) return Response.json(ok);

  const token = await issueReset(role, subjectId);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${origin.replace(/\/$/, "")}/reset?token=${encodeURIComponent(token)}`;
  const { subject, text } = resetEmail(link, RESET_TTL_MINUTES);

  if (mailConfigured()) {
    await sendMail({ to: email, subject, text });
  } else if (process.env.DB_DRIVER !== "supabase" && process.env.NODE_ENV !== "production") {
    // Local development with no mail provider. Printing a working credential to
    // a terminal is only acceptable because this branch cannot run anywhere the
    // log is shared — it is fenced on the same two conditions `secret()` uses to
    // decide it is deployed, so a preview or production instance never reaches
    // it and simply sends nothing.
    console.log(`\n[dev] password reset for ${email}:\n${link}\n`);
  }

  return Response.json(ok);
}
