import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { adminLoginPath } from "@/lib/admin/modules";
import { isPortalPath, isPortalPublicPath, portalLoginPath } from "@/lib/portal/paths";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Runs before every /admin and /portaal request (see src/proxy.ts). It does
 * two things:
 *
 *  1. Refreshes the Supabase session. Server components cannot write cookies,
 *     so without this the rotated access token would never be stored and a
 *     session would end at the first expiry instead of being renewed.
 *  2. Sends a request without a session straight to that area's login page.
 *     The portal's public pages -- signing in, asking for a reset, the page
 *     a mailed link lands on -- are the exception: they are for people
 *     without a session.
 *
 * The second is a shortcut, not the protection. It only asks whether someone
 * is signed in, never whether they are an admin or a member, and it can be
 * skipped by any path that does not run middleware. The real decision is made
 * per render: `lib/admin/access.ts` for the admin, `lib/portal/access.ts`
 * for the portal. The two areas share these cookies and nothing else.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const signedIn = await hasVerifiedSession(supabase);
  const pathname = request.nextUrl.pathname;
  const loginPath = isPortalPath(pathname) ? portalLoginPath : adminLoginPath;
  const open = isPortalPath(pathname) ? isPortalPublicPath(pathname) : pathname === adminLoginPath;

  if (!signedIn && !open) {
    const target = request.nextUrl.clone();
    target.pathname = loginPath;
    // No return path is carried along: a redirect target taken from the URL
    // is a way to bounce visitors off the site. Signing in lands on the area's home.
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

/** The admin's name for the same proxy; kept so existing imports and tests read as before. */
export const updateAdminSession = updateSession;

/**
 * Is there a session whose token has been verified?
 *
 * Answered with `getClaims()` first. It loads the session from the cookies,
 * refreshes it against the Auth server only when the access token is about to
 * expire (the same refresh `getUser()` performed here before), and then checks
 * the token's signature on this server against the project's public signing
 * keys. Those keys are asymmetric (ES256) and are cached in memory for ten
 * minutes, so a request carrying a valid, current token costs no round trip
 * here. That matters because this runs for every admin request, the router's
 * prefetches included; before, each of them went to the Auth server.
 *
 * It answers the same yes-or-no as before -- is someone signed in -- and
 * nothing more. No claim is read to decide who is an admin: that is decided
 * per render from the Auth server plus `admin_profiles` (lib/admin/auth.ts),
 * and this function cannot widen it.
 *
 * Whenever the local check does not produce a verified answer for a request
 * that does carry a session -- a signature that does not verify, a refresh
 * that failed, signing keys that could not be fetched, a runtime without
 * WebCrypto -- the question goes to the Auth server with `getUser()`, which
 * is what every request used to do. A request without a session is answered
 * without a round trip, as before.
 */
export async function hasVerifiedSession(supabase: Pick<SupabaseClient<Database>, "auth">): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getClaims();

    if (data?.claims.sub) {
      return true;
    }

    if (!error) {
      // No session in the cookies. The Auth server has nothing to add.
      return false;
    }
  } catch {
    // Verification itself failed (keys unreachable, no WebCrypto). Ask the
    // Auth server instead of guessing.
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return Boolean(user);
}
