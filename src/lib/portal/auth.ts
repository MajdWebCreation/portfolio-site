import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import type { PortalAccess, PortalMembership } from "@/lib/portal/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who may enter the portal, and for which customer.
 *
 * Two questions, kept apart the way the admin keeps them apart:
 *
 *  1. Authentication: is there a valid Supabase session? `auth.getUser()`,
 *     which revalidates the token against the Auth server.
 *  2. Authorization: which customers does this user belong to? Answered only
 *     by `portal_memberships()`, which reads active rows in customer_users
 *     for auth.uid() and nothing else. No e-mail address, no claim, no
 *     cookie decides it. An admin without a membership gets no customers.
 *
 * A user with several customers works for one at a time. Which one is a
 * preference remembered in a cookie, and the cookie is never trusted on its
 * own: the value is looked up in the memberships the database just returned,
 * and a value that is not among them is ignored.
 */
export type { PortalAccess, PortalIdentity, PortalMembership } from "@/lib/portal/types";

/** The cookie that remembers which customer a multi-customer user picked. A preference, not a credential. */
export const portalCustomerCookie = "ym_portal_customer";

type Client = SupabaseClient<Database>;

export async function readPortalMemberships(supabase: Client): Promise<PortalMembership[] | null> {
  const { data, error } = await supabase.rpc("portal_memberships");
  if (error || !data) return null;
  return data.map((row) => ({
    customerId: row.customer_id,
    companyName: row.company_name,
    role: row.role,
    acceptedAt: row.accepted_at,
  }));
}

/** Picks the current customer: the remembered one if it is really one of theirs, otherwise the first. */
export function pickCurrentMembership(memberships: PortalMembership[], remembered: string | null | undefined): PortalMembership | undefined {
  return memberships.find((membership) => membership.customerId === remembered) ?? memberships[0];
}

/** The decision itself, separated from where the client and the cookie come from. */
export async function resolvePortalAccess(supabase: Client, rememberedCustomerId: string | null | undefined): Promise<PortalAccess> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { state: "anonymous" };

  const memberships = await readPortalMemberships(supabase);
  const current = memberships ? pickCurrentMembership(memberships, rememberedCustomerId) : undefined;

  if (!memberships || !current) {
    return { state: "no_membership", userId: user.id, email: user.email ?? null };
  }

  return {
    state: "member",
    member: { userId: user.id, email: user.email ?? null, memberships, current },
  };
}

/**
 * Cached for the length of one request: the layout, the page and every
 * action they call each ask, and the Auth server and the database answer
 * once.
 */
export const getPortalAccess = cache(async (): Promise<PortalAccess> => {
  const [supabase, cookieStore] = await Promise.all([createSupabaseServerClient(), cookies()]);
  return resolvePortalAccess(supabase, cookieStore.get(portalCustomerCookie)?.value);
});
