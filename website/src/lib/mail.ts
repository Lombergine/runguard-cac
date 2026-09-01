/**
 * Outbound transactional email, over Resend's HTTP API.
 *
 * WHY HTTP AND NOT SMTP. A serverless function is torn down between requests, so
 * it cannot keep an SMTP connection alive; every send would pay a fresh TCP and
 * TLS handshake, and a hung one would burn the function's whole timeout. One
 * `fetch` has neither problem, which is also why there is no SDK here — the API
 * this needs is a single POST.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: throw. A caller sending a password-reset
 * mail must not be able to tell the requester whether the send worked, because
 * that answer doubles as "this address has an account". Failures are logged
 * server-side and reported as `false`; every caller is expected to return the
 * same response either way.
 *
 * NOTHING SECRET IS EVER LOGGED. The reset link contains a working credential,
 * so the failure log records the recipient and the provider's status and never
 * the body.
 */

const ENDPOINT = "https://api.resend.com/emails";

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  // Unconfigured is not a crash. Locally there is usually no key, and the
  // caller prints the link to the server log instead — see requestReset.
  if (!key || !from) return false;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text: opts.text }),
    });
    if (!res.ok) {
      // Status and recipient only. The body would echo the message, and the
      // message contains the reset link.
      console.error(`mail: ${res.status} sending to ${opts.to}`);
      return false;
    }
    return true;
  } catch {
    console.error(`mail: transport failure sending to ${opts.to}`);
    return false;
  }
}

/**
 * Plain text, not HTML, and that is a security choice rather than a shortcut.
 *
 * A password-reset mail is the single most impersonated message there is, so it
 * should look like the plainest possible thing and ask for nothing. No logo to
 * copy, no button hiding its destination, no tracking pixel. The address bar is
 * the only thing that can tell an athlete this is real, so the URL is shown in
 * full rather than wrapped in a link.
 */
export function resetEmail(link: string, expiresMinutes: number): { subject: string; text: string } {
  return {
    subject: "Reset your RunGuard password",
    text: [
      "Someone asked to reset the password for this RunGuard account.",
      "",
      "Open this link to choose a new one:",
      link,
      "",
      `The link stops working in ${expiresMinutes} minutes, and it can only be used once.`,
      "",
      "If this wasn't you, you can ignore this email — nothing has changed, and",
      "your current password still works. Nobody can see this link but you.",
      "",
      "RunGuard will never ask you for your password by email.",
    ].join("\n"),
  };
}
