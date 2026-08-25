import { run } from "@/lib/db/driver";
import { checkAuthRate, recordAuthFailure } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }

  // Unauthenticated INSERT of attacker-supplied addresses — without a cap, one
  // script fills the table and turns our sending reputation into someone else's
  // mailing list. Gated and charged before the write; the shared per-IP bucket
  // is what bounds an address-rotating flood, since the tight bucket is keyed on
  // an address the caller chooses.
  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfter / 60);
    return Response.json(
      { ok: false, error: `Too many signups from here. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } }
    );
  }
  await recordAuthFailure(request, email);

  await run("INSERT INTO waitlist (email, role) VALUES (?, ?) ON CONFLICT DO NOTHING", [
    email,
    role,
  ]);
  return Response.json({ ok: true });
}
