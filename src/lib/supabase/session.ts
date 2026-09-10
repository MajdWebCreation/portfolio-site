import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminLoginPath } from "@/lib/admin/modules";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Runs before every /admin request (see src/proxy.ts). It does two things:
 *
 *  1. Refreshes the Supabase session. Server components cannot write cookies,
 *     so without this the rotated access token would never be stored and a
 *     session would end at the first expiry instead of being renewed.
 *  2. Sends a request without a session straight to the login page.
 *
 * The second is a shortcut, not the protection. It only asks whether someone
 * is signed in, never whether they are an admin, and it can be skipped by any
 * path that does not run middleware. The real decision is made per render, in
 * the admin layout, in every page and in every repository — see
 * `lib/admin/access.ts`.
 */
export async function updateAdminSession(request: NextRequest): Promise<NextResponse> {
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

  // Revalidates the token against the Auth server, and rotates it when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname !== adminLoginPath) {
    const target = request.nextUrl.clone();
    target.pathname = adminLoginPath;
    // No return path is carried along: a redirect target taken from the URL
    // is a way to bounce visitors off the site. Signing in lands on /admin.
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}
