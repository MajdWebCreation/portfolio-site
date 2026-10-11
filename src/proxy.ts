import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * The two areas with a session: the admin and the customer portal. The public
 * site has no session to keep alive, so it keeps rendering without a proxy
 * hop.
 */
export const config = {
  matcher: ["/admin/:path*", "/portaal/:path*"],
};
