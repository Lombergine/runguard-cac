import { redeemReset } from "@/lib/passwordReset";
import { checkRequestRate, tooManyRequests } from "@/lib/rateLimit";

/** Same floor the signup forms enforce. */
const MIN_PASSWORD = 8;

/**
 * Spend a reset link and set a new password.
 *
 * ONE MESSAGE FOR EVERY REJECTION. A wrong token, an expired one and one that
 * was already spent are indistinguishable in the response, because telling them
 * apart tells someone holding a stale link whether it was ever real — and
 * whether the account exists at all.
 *
 * NO SESSION IS ISSUED HERE. Redeeming sends the athlete back to the login form
 * to use the password they just chose. That is deliberate: signing in whoever
 * holds the link would make the emailed token a login credential rather than a
 * permission to change one, and an intercepted link would then hand over a live
 * session instead of announcing itself by breaking the real owner's password.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token || password.length < MIN_PASSWORD) {
    return Response.json(
      { error: `Choose a password of at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  // Keyed on the caller, not an account: at this point there is no account to
  // key on, and the token is what is being guessed. Guessing it is hopeless at
  // 256 bits, but an unauthenticated endpoint that writes should still have a
  // ceiling.
  const gate = await checkRequestRate(request, "password-reset", {
    max: 20,
    windowMs: 15 * 60_000,
  });
  if (!gate.allowed) return tooManyRequests(gate.retryAfter);

  const result = await redeemReset(token, password);
  if (!result) {
    return Response.json(
      { error: "That link has expired or has already been used. Request a new one." },
      { status: 400 }
    );
  }

  // `role` tells the page which login form to send them to. It reveals nothing:
  // the caller already held a valid, single-use token for this account.
  return Response.json({ ok: true, role: result.subject });
}
