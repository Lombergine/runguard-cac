import { logIn } from "@/lib/session";
import { getTeamByCoachEmail, verifyPassword } from "@/lib/db";
import { checkAuthRate, recordAuthFailure, tooManyAttempts } from "@/lib/rateLimit";

/**
 * The password-only shortcut signs you in as the coach of team 1 — the seeded
 * demo team, which on a deployment is a real team with real athletes. It used to
 * fall back to the literal string "milemarker", which is published in this
 * repo, so an unconfigured deployment shipped a working coach login for anyone
 * who read the README.
 *
 * It now fails closed the same way `secret()` in src/lib/session.ts does: it
 * only exists against the local SQLite file, outside production, and only when
 * COACH_PASSWORD has been set deliberately. Unset means the path is gone, not
 * defaulted.
 */
function demoPassword(): string | null {
  const driver = process.env.DB_DRIVER;
  if (driver && driver !== "sqlite") return null;
  if (process.env.NODE_ENV === "production") return null;
  const p = process.env.COACH_PASSWORD;
  return p ? p : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  // Demo shortcut: password-only login drops you into the demo team.
  const demo = demoPassword();
  if (!email && demo !== null && password) {
    // Still a password being guessed, so it is counted like any other. The
    // bucket is a fixed label because this branch has no account name.
    const gate = await checkAuthRate(request, "demo-coach");
    if (!gate.allowed) return tooManyAttempts(gate.retryAfter);
    if (password === demo) {
      await logIn(1);
      return Response.json({ ok: true, demo: true });
    }
    await recordAuthFailure(request, "demo-coach");
    // falls through to the same 400 a password-only attempt always produced
  }

  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }
  // Checked before the lookup, so a throttled attempt never reaches scrypt and
  // its 429 says nothing about whether the address is a registered coach.
  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) return tooManyAttempts(gate.retryAfter);

  const team = await getTeamByCoachEmail(email);
  // Evaluated before the guard on purpose: short-circuiting on a missing team
  // would skip scrypt and time-leak which coach emails are registered.
  const ok = verifyPassword(password, team?.coach_password_hash);
  if (!team || !ok) {
    await recordAuthFailure(request, email);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  await logIn(team.id);
  return Response.json({ ok: true, team: team.name });
}
