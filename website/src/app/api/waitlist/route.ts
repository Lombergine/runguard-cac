import { run } from "@/lib/db/driver";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }
  await run("INSERT INTO waitlist (email, role) VALUES (?, ?) ON CONFLICT DO NOTHING", [
    email,
    role,
  ]);
  return Response.json({ ok: true });
}
