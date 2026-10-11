import { paymentsAdminClient } from "@/lib/payments/admin-client";

/**
 * Whether an address belongs to a portal account: some membership, active or
 * ended, was ever made for it. Asked before a reset link is minted, so the
 * portal's "wachtwoord vergeten" resets portal accounts and nothing else --
 * not an admin, not a stranger the Auth server happens to know.
 *
 * A visitor asking for a reset has no session, so this read cannot run as
 * them; it runs through the system client, reads one column of one table and
 * returns a boolean. The visitor's answer is the same whatever it says.
 */
export async function isPortalAccount(email: string): Promise<boolean> {
  const { data, error } = await paymentsAdminClient()
    .from("customer_users")
    .select("id")
    .eq("invited_email", email.trim().toLowerCase())
    .limit(1);
  if (error) {
    console.error("Portal account lookup failed", { error: error.message });
    return false;
  }
  return (data ?? []).length > 0;
}
