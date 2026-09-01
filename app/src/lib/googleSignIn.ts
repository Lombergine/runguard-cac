/**
 * Google sign-in for the app, over expo-auth-session.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: exchange the code. It hands the
 * authorization code and its PKCE verifier to `/api/mobile/google`, and the
 * server redeems them. The id_token never touches the phone.
 *
 * That is the whole security argument for this design. A server that accepts an
 * id_token posted by a client is accepting an attacker-supplied string, and
 * must do full JWKS signature verification to be safe. A server that redeems a
 * code itself receives the id_token over TLS from Google's own token endpoint,
 * inside a request it made — no signature check needed, no JWKS cache, no new
 * dependency. Sending the code costs nothing and removes that whole class.
 *
 * The code is single-use at Google's end and worthless without the verifier,
 * which never leaves this process until it is posted to our own server.
 *
 * NOTHING HERE IS PERSISTED. The verifier lives in the request object for the
 * duration of one prompt and dies with it. If that ever changes, the key MUST
 * be added to ALL_KEYS in lib/auth.ts — sign-out clears that list and nothing
 * else, which is exactly how `runguard.health.state` was once left behind on a
 * signed-out phone.
 */
import { useMemo } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

// Closes the browser sheet and delivers the result back to the app. Required at
// module scope, before any prompt is opened.
WebBrowser.maybeCompleteAuthSession();

/**
 * Hard-coded rather than fetched with `useAutoDiscovery`. These two endpoints
 * have not moved in a decade, and discovery would put a network round trip —
 * and a failure mode — in front of a button that is otherwise instant.
 */
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

/**
 * Static dot path, because Expo inlines EXPO_PUBLIC_* textually at build time —
 * a computed lookup reads as undefined in a release build.
 *
 * A client id is NOT a secret; it ships in every OAuth app's binary and is
 * visible in the authorization URL. The client SECRET is a different value and
 * must never appear here — the iOS client does not have one, which is why the
 * server does the exchange as a public client.
 */
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || null;

/**
 * Whether this build can offer Google at all.
 *
 * CALLERS MUST GATE THE COMPONENT, NOT THE BUTTON, on this. `useAuthRequest`
 * throws outright on an empty `redirectUri` — not a warning, a render error that
 * takes the whole login screen down — and a hook cannot be called conditionally.
 * So the only safe shape is to not mount the thing that calls it. Rendering a
 * hidden button from a mounted hook was tried; it broke sign-in entirely on
 * every build without a client id, which is every build until one is created.
 */
export const GOOGLE_CONFIGURED = Boolean(IOS_CLIENT_ID);

/**
 * Google requires an iOS client's redirect to be its own "reversed client id"
 * scheme — the app's own `runguard://` is refused.
 *
 * Derived from the client id rather than configured separately, because they
 * are the same value written backwards and two env vars that must agree is one
 * more thing to get wrong. The SAME string has to appear in app.json's
 * `ios.infoPlist.CFBundleURLTypes`, or iOS has nothing registered to hand the
 * redirect back to and the sheet closes onto nothing.
 */
function reversedClientScheme(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(".apps.googleusercontent.com", "")}`;
}

export type GoogleAttempt =
  | { kind: "success"; code: string; codeVerifier: string; redirectUri: string }
  | { kind: "cancelled" }
  | { kind: "failed" };

/** Only call this from a component mounted behind `GOOGLE_CONFIGURED`. */
export function useGoogleSignIn() {
  const redirectUri = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        native: `${reversedClientScheme(IOS_CLIENT_ID ?? "")}:/oauthredirect`,
      }),
    []
  );

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: IOS_CLIENT_ID ?? "",
      redirectUri,
      scopes: ["openid", "email"],
      // The code goes to our server; the phone never redeems it.
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    DISCOVERY
  );

  return {
    /** The request object is built asynchronously; the button waits for it. */
    ready: Boolean(request),

    async attempt(): Promise<GoogleAttempt> {
      if (!request?.codeVerifier) return { kind: "failed" };

      const result = await promptAsync();

      // Dismissing the sheet is a decision, not a fault. The caller resets
      // quietly — an error line under a form nobody submitted is noise.
      if (result.type === "cancel" || result.type === "dismiss") {
        return { kind: "cancelled" };
      }
      if (result.type !== "success" || !result.params.code) return { kind: "failed" };

      return {
        kind: "success",
        code: result.params.code,
        codeVerifier: request.codeVerifier,
        redirectUri,
      };
    },
  };
}
