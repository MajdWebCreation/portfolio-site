import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The Supabase client for system actions that belong to no user.
 *
 * A Mollie webhook and a direct debit activation carry no admin session, so
 * the ordinary server client -- which runs as the caller and is bound by row
 * level security -- has no rights there. The alternative, giving `anon` write
 * access to the payment tables, would make internal financial administration
 * publicly writable, so it is not on the table.
 *
 * Deliberately separate from lib/supabase/server.ts: that helper reads cookies
 * and can adopt a visitor's session, and the two must never be confused. This
 * client reads no cookies, keeps no session, refreshes no token and looks for
 * none in the URL. It is built per call and thrown away.
 *
 * The secret key is read here and in no other module. It never reaches the
 * browser (the guard below turns that mistake into a crash), is never written
 * to the database, never logged and never put in a mail or a URL.
 */
export class SecretKeyNotConfigured extends Error {
  constructor() {
    super("Verwerking van betalingen is niet geconfigureerd. Zet SUPABASE_SECRET_KEY, zie .env.example.");
    this.name = "SecretKeyNotConfigured";
  }
}

/** True when system actions can run at all; lets callers refuse cleanly. */
export function hasPaymentsAdminAccess(): boolean {
  return typeof window === "undefined" && Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function paymentsAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("The payments admin client was constructed in the browser. It is server-only.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) throw new SecretKeyNotConfigured();

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
