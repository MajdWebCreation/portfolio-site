import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who may enter the admin.
 *
 * Two separate questions, deliberately kept apart:
 *
 *  1. Authentication — is there a valid Supabase session? Answered by
 *     `auth.getUser()`, which revalidates the token against the Auth server.
 *     `getSession()` is not used: it trusts the cookie as it was handed in.
 *  2. Authorization — is this user an admin? Answered only by an active row
 *     in `admin_profiles`. Being signed in grants nothing on its own, and no
 *     e-mail address, domain or JWT claim is consulted.
 *
 * Everything that needs to know reads it here, so there is one answer to the
 * second question and one place to get it wrong.
 */
export type AdminIdentity = {
  userId: string;
  email: string | null;
  displayName: string | null;
};

export type AdminAccess =
  | { state: "anonymous" }
  | { state: "denied"; email: string | null }
  | { state: "admin"; admin: AdminIdentity };

export type AdminProfile = Database["public"]["Tables"]["admin_profiles"]["Row"];

type Client = SupabaseClient<Database>;

/**
 * The active admin row for a user, or null. Null covers every way this can
 * fail — no row, a deactivated row, a query that errored — because none of
 * them is a reason to let someone in.
 *
 * The query runs as the signed-in user, so row level security already limits
 * it to that user's own row. The `.eq` states the same restriction a second
 * time, in the application, on purpose.
 */
export async function readActiveAdminProfile(
  supabase: Client,
  userId: string,
): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("user_id, display_name, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  return data;
}

/** The decision itself, separated from where the client comes from. */
export async function resolveAdminAccess(supabase: Client): Promise<AdminAccess> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { state: "anonymous" };
  }

  const profile = await readActiveAdminProfile(supabase, user.id);

  if (!profile) {
    return { state: "denied", email: user.email ?? null };
  }

  return {
    state: "admin",
    admin: {
      userId: profile.user_id,
      email: user.email ?? null,
      displayName: profile.display_name,
    },
  };
}

/**
 * Cached for the length of one request: a layout, its pages and the
 * repositories they call each ask independently, but the Auth server and the
 * database are consulted once.
 */
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const supabase = await createSupabaseServerClient();
  return resolveAdminAccess(supabase);
});
