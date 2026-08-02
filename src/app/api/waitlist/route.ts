import { getSql } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }
  await getSql()`
    insert into waitlist (email, role) values (${email}, ${role})
    on conflict (email) do nothing`;
  return Response.json({ ok: true });
}
