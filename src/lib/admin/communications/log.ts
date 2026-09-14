import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerCommunicationInsert } from "@/lib/admin/communications/mapper";
import type { CommunicationCategory, CommunicationLinks } from "@/lib/admin/communications/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Writing down that a mail went out.
 *
 * Deliberately not a client of its own. Two kinds of caller send customer
 * mail and they have different rights: a server action runs as the admin who
 * pressed the button and is bound by row level security, while the Mollie
 * webhook and the daily job carry no session at all and use the elevated
 * server-side client. Picking one here would either break the jobs or hand
 * the admin flows rights they should not have, so the caller passes the
 * client it is already using and the log inherits exactly those rights.
 */
export type CommunicationClient = Pick<SupabaseClient<Database>, "from">;

/**
 * Everything the log needs that the message itself does not say: who it was
 * for, which flow sent it, and what it was about.
 */
export type CommunicationContext = CommunicationLinks & {
  db: CommunicationClient;
  customerId: string;
  category: CommunicationCategory;
};

/** What the provider told us about the send that is worth keeping. */
export type CommunicationDelivery = {
  recipient: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  /** ISO timestamp of the moment the provider accepted the message. */
  sentAt: string;
  providerMessageId?: string;
};

/**
 * Appends one communication.
 *
 * Never throws and never fails a send. By the time this runs the customer has
 * the mail: refusing to return, or bubbling a database error up through the
 * mail flow, would turn a bookkeeping problem into a second mail on the next
 * retry. A lost row is logged for the server operator and nothing else
 * changes.
 */
export async function recordCommunication(
  context: CommunicationContext,
  delivery: CommunicationDelivery,
): Promise<void> {
  const row: CustomerCommunicationInsert = {
    customer_id: context.customerId,
    channel: "email",
    direction: "outbound",
    category: context.category,
    recipient: delivery.recipient,
    subject: delivery.subject,
    body_text: delivery.bodyText,
    status: "sent",
    sent_at: delivery.sentAt,
    ...(delivery.bodyHtml ? { body_html: delivery.bodyHtml } : {}),
    ...(delivery.providerMessageId ? { provider_message_id: delivery.providerMessageId } : {}),
    ...(context.invoiceId ? { invoice_id: context.invoiceId } : {}),
    ...(context.quoteId ? { quote_id: context.quoteId } : {}),
    ...(context.projectId ? { project_id: context.projectId } : {}),
    ...(context.recurringServiceId ? { recurring_service_id: context.recurringServiceId } : {}),
  };

  try {
    const { error } = await context.db.from("customer_communications").insert(row);
    if (error) {
      // Identifiers and the category only: never the body, the subject or the
      // address, which is customer data and does not belong in a server log.
      console.error("Communication log write failed", {
        customerId: context.customerId,
        category: context.category,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Communication log write threw", {
      customerId: context.customerId,
      category: context.category,
      error,
    });
  }
}
