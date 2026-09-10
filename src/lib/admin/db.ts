import { requireAdminAccess } from "@/lib/admin/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The Supabase client every admin repository and server action uses.
 *
 * Two independent boundaries, on purpose:
 *
 *  1. `requireAdminAccess()` refuses before a query is ever sent, so an
 *     unauthenticated or non-admin caller never reaches the database.
 *  2. The client carries the caller's own session, so row level security
 *     decides again on the server. The policies allow only active admins.
 *
 * No service role key is involved: the admin has exactly the rights its own
 * session has, and a mistake in this layer cannot widen them.
 */
export async function adminDb() {
  await requireAdminAccess();
  return createSupabaseServerClient();
}

/** Turns a PostgrestError into a thrown Error, so callers can stay terse. */
export function failed(operation: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

/** Optional text column: the domain omits empty values, the database stores null. */
export function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
