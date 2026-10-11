import { adminDb, failed } from "@/lib/admin/db";
import type { PortalMember } from "@/lib/admin/portal-members/types";

/**
 * The portal members of one customer, read as the admin under the admin
 * policy. The member's e-mail is the address the invitation went to, kept on
 * the row because auth.users is not readable from the application.
 */
export async function listPortalMembersForCustomer(customerId: string): Promise<PortalMember[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("customer_users")
    .select("id, user_id, invited_email, role, invited_at, accepted_at, revoked_at")
    .eq("customer_id", customerId)
    .order("invited_at", { ascending: false });
  failed("Portaalleden laden", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.invited_email,
    role: row.role,
    invitedAt: row.invited_at,
    ...(row.accepted_at ? { acceptedAt: row.accepted_at } : {}),
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  }));
}
