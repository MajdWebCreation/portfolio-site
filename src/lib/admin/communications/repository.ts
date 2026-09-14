import { adminDb, failed } from "@/lib/admin/db";
import { communicationFromRow } from "@/lib/admin/communications/mapper";
import type { CustomerCommunication } from "@/lib/admin/communications/types";

/** Read access to the communication log; admins only, as everywhere else. */
const communicationColumns =
  "id, customer_id, channel, direction, category, recipient, subject, body_text, body_html, status, provider_message_id, error, invoice_id, quote_id, project_id, recurring_service_id, sent_at, created_at";

/**
 * One customer's outbound mail, newest first.
 *
 * Ordered in the database on the index the migration creates, so the page
 * does not sort a list it did not need to load in full. `created_at` breaks
 * ties: two mails in the same second -- an invoice and the activation link
 * that follows it -- still come out in the order they were written.
 */
export async function listCommunicationsForCustomer(customerId: string): Promise<CustomerCommunication[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("customer_communications")
    .select(communicationColumns)
    .eq("customer_id", customerId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  failed("Communicatie van klant laden", error);
  return (data ?? []).map(communicationFromRow);
}
