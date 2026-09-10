import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase client for server components, server actions and route handlers.
 * It carries the caller's cookies, so every query runs as that user and row
 * level security applies. It never has more rights than the visitor has.
 *
 * One client per request; do not hoist it into a module-level constant, or
 * one visitor's session would be handed to the next.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot write cookies. Harmless: the middleware
          // refreshes the session for those requests, so the rotated token is
          // still persisted.
        }
      },
    },
  });
}
