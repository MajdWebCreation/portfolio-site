import type { PostgrestError } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * How the portal reads: the member's own cookie session, and nothing but
 * the portal_* functions on it.
 *
 * Every read names the customer it is for. That customer comes from the
 * request's identity (requirePortalMember), which picked it from the
 * memberships the database had just returned -- and the function asks the
 * database again anyway, so a stale or forged choice is refused there, not
 * trusted here. No service key, no table reads: the client handed out here
 * has nothing but the member's own rights, and those reach business data
 * only through the functions.
 */
export const portalReader = createSupabaseServerClient;

/**
 * The database said no: not a member of this customer, or the resource is
 * not this customer's, not visible, or not there. Deliberately one error --
 * the portal never learns, and so never tells, which of those it was.
 */
export class PortalDenied extends Error {
  constructor() {
    super("Geen toegang.");
    this.name = "PortalDenied";
  }
}

/** The payload of a portal function, or the reason there is none. */
export function portalResult<T>(operation: string, result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) {
    if (result.error.code === "42501") throw new PortalDenied();
    throw new Error(`${operation}: ${result.error.message}`);
  }
  if (result.data === null) throw new Error(`${operation}: geen antwoord`);
  return result.data;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An id from a URL, before it reaches a function: anything that is not a
 * uuid is refused the way a foreign id is, rather than as a cast error the
 * database would answer differently.
 */
export function requireResourceId(id: string): string {
  if (!uuidPattern.test(id)) throw new PortalDenied();
  return id;
}
