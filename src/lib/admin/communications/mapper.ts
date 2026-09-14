import type {
  CommunicationCategory,
  CommunicationStatus,
  CustomerCommunication,
} from "@/lib/admin/communications/types";
import type { Database } from "@/lib/supabase/database.types";

export type CustomerCommunicationRow = Database["public"]["Tables"]["customer_communications"]["Row"];
export type CustomerCommunicationInsert = Database["public"]["Tables"]["customer_communications"]["Insert"];

/**
 * The stored row as the admin reads it. Same shape as the other mappers:
 * optional columns are omitted rather than carried as null, so the domain
 * has one way to say "absent".
 */
export function communicationFromRow(row: CustomerCommunicationRow): CustomerCommunication {
  return {
    id: row.id,
    customerId: row.customer_id,
    channel: "email",
    direction: "outbound",
    category: row.category as CommunicationCategory,
    recipient: row.recipient,
    subject: row.subject,
    bodyText: row.body_text,
    status: row.status as CommunicationStatus,
    createdAt: row.created_at,
    ...(row.body_html ? { bodyHtml: row.body_html } : {}),
    ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.invoice_id ? { invoiceId: row.invoice_id } : {}),
    ...(row.quote_id ? { quoteId: row.quote_id } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.recurring_service_id ? { recurringServiceId: row.recurring_service_id } : {}),
  };
}
