"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase client for the browser. It reads the session from the same cookies
 * the server writes, so a client component sees the user the server saw.
 *
 * Authentication itself does not go through here: signing in and out are
 * server actions, so the session cookies are set by the server and never
 * assembled in client JavaScript. This client is the entry point for the
 * client-side reads that later phases need.
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
