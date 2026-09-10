import type { NextRequest } from "next/server";
import { updateAdminSession } from "@/lib/supabase/session";

export function proxy(request: NextRequest) {
  return updateAdminSession(request);
}

/**
 * Only the admin. The public site has no session to keep alive, so it keeps
 * rendering without a proxy hop.
 */
export const config = {
  matcher: ["/admin/:path*"],
};
