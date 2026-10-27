import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";

/**
 * The demo is read-only, and this is where that is true.
 *
 * WHY HERE AND NOT IN EACH ROUTE. A per-route check is a convention: it holds
 * until someone adds the next route and does not think about the demo, and the
 * failure is silent — a visitor quietly writing into the roster every coach is
 * being shown. Middleware inverts the default. A new API route is refused for a
 * demo session unless it is deliberately listed below, so forgetting means "too
 * strict", which someone notices, rather than "wide open", which nobody does.
 *
 * WHAT COUNTS AS A WRITE. Every method except GET and HEAD. Not a list of
 * mutating routes — a list is the same convention problem one level up.
 *
 * THE SIGNATURE IS NOT CHECKED HERE, deliberately. This runs on the edge
 * runtime with no database and no node crypto, and it only ever WITHHOLDS. A
 * visitor who forges `rg_demo` has locked themselves out of writing; that is
 * not an attack, and it is the only direction this can be wrong in. Anything
 * that grants rather than withholds is verified server-side in
 * `isDemoSession()`.
 */

/**
 * The writes a demo visitor is allowed, and why each one.
 *
 * Every entry is a route whose entire purpose is to let someone STOP being a
 * demo visitor, or to tell us they are interested. Refusing these would trap a
 * coach inside the demo with no way to become a customer — which is the one
 * outcome that would make the demo worse than not having one.
 */
const ALLOWED_WRITES = [
  "/api/waitlist",       // the whole point of showing a coach the demo
  "/api/signup",         // create a real team
  "/api/login",          // sign in to a real team
  "/api/logout",         // leave the demo
  "/api/athlete-signup",
  "/api/athlete-login",
  "/api/athlete-logout",
  /*
   * Chat is allowed to REPLY but not to REMEMBER. The route itself skips every
   * `logChat` call for a demo session (see api/chat/route.ts), so a visitor can
   * ask the AI coach anything — which is the feature most worth showing — while
   * nothing they type survives into the transcript the next visitor opens.
   *
   * That distinction cannot be made here: middleware can only allow or refuse
   * the whole request. So this line allows it and the route is responsible for
   * the rest, which is the one place in this file where a route carries part of
   * the rule.
   */
  "/api/chat",
];

/**
 * Keep API responses out of every cache, including the browser's disk.
 *
 * `/api/mobile/me` and `/api/mobile/home` return an athlete's whole record, and
 * the default header on them is `no-cache, must-revalidate`. `no-cache` does not
 * mean "do not store" — it means "store it, but revalidate before reusing it" —
 * and without `private` an intermediary may keep a copy of its own. `no-store`
 * is the directive that forbids writing it down at all.
 *
 * Set here rather than per route for the same reason the demo gate is: a
 * per-route header is a convention, and the next route added would not have it.
 *
 * PAGES ARE NOT COVERED BY THIS, and cannot be from middleware. Next.js sets its
 * own Cache-Control on a rendered page response and overwrites whatever
 * middleware put there — measured, not assumed: with this function matching
 * /dashboard, the page still came back `no-cache, must-revalidate` while
 * /api/mobile/me came back `private, no-store`. Matching page routes therefore
 * costs an invocation per navigation and changes nothing, so it does not.
 *
 * That leaves one open question worth checking against a real deployment: Next
 * emits a stricter header for dynamic responses in production than the dev
 * server shows, and it may already include `no-store`. If it does not, the fix
 * belongs wherever the platform lets a page header be overridden — not here.
 * Until then the residual risk is a browser disk-caching a signed-in page, which
 * matters because this is used on shared school computers.
 */
function uncacheable(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, must-revalidate");
  return response;
}

export function middleware(request: NextRequest) {
  const { method, nextUrl } = request;
  if (method === "GET" || method === "HEAD") return uncacheable(NextResponse.next());
  if (request.cookies.get(DEMO_COOKIE)?.value !== "1") return uncacheable(NextResponse.next());

  const path = nextUrl.pathname;
  if (ALLOWED_WRITES.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) {
    return uncacheable(NextResponse.next());
  }

  // A sentence for a person, in the shape every form in this app already reads
  // (`{ error }` lifted onto the message it shows), so a refused save explains
  // itself where the athlete or coach is looking instead of failing silently.
  return uncacheable(
    NextResponse.json(
      {
        error:
          "This is the read-only demo, so nothing you change here is saved. The sample team stays the same for the next person. Create a free team and everything on this screen becomes yours to edit.",
        demo: true,
      },
      { status: 403 }
    )
  );
}

/**
 * API routes only.
 *
 * Page navigations are GETs and would pass anyway, but matching them would put
 * this function on the hot path of every image and font request for no reason —
 * and, as the note above records, would not even set the header, because Next
 * overwrites it on page responses.
 */
export const config = {
  matcher: "/api/:path*",
};
