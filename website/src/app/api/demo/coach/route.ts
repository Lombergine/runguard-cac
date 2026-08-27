import { redirect } from "next/navigation";
import { demoLogIn } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * One click into the coach view. No form, no credentials, nothing to read.
 *
 * A GET that sets a cookie is normally a smell — it is not idempotent and a
 * prefetch can fire it. Both are fine here and neither is an accident:
 *
 *  - It has to be a plain link. The whole point is that a coach clicks "see the
 *    demo" from an email on their phone and is looking at a roster. A POST needs
 *    a form and a button, which is a page, which is the thing being removed.
 *  - Opening a demo session twice is opening a demo session. There is nothing to
 *    duplicate, nothing to charge and nothing to delete, so a prefetch costs a
 *    cookie write.
 *
 * When the demo is switched off this 404s rather than redirecting to a sign-in
 * page. A disabled demo should be indistinguishable from a route that was never
 * built — a redirect would tell a prober that the feature exists and is merely
 * unconfigured.
 */
export async function GET() {
  const teamId = await demoLogIn();
  if (teamId === null) {
    return new Response("Not found", { status: 404 });
  }
  redirect("/dashboard");
}
