import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase client for the public site: pricing, published articles and the
 * intake of a contact or planner request.
 *
 * It carries no session and stores none, so every query runs as `anon` and
 * gets exactly what the row level security policies allow that role: reading
 * active pricing, reading published articles, and inserting the eight columns
 * of an inquiry. Nothing here can widen that, because the rights are attached
 * to the role and not to this code.
 *
 * Deliberately not the cookie-carrying server client from `server.ts`: a
 * public page has no business touching a visitor's session, and a signed-in
 * admin browsing the public site should see the same site as everyone else.
 *
 * The service role key is not used here or anywhere else in this codebase.
 */
export function createSupabasePublicClient() {
  const { url, publishableKey } = getSupabaseEnv();

  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
