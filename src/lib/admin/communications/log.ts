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
 *
 * Returns the id of the row it wrote, so a caller that keeps its own record
 * of the send -- a reminder event, say -- can point at the same communication
 * instead of describing it a second time. Absent when nothing was written.
 */
/**
 * The retention side of the log, kept here because this module is the one
 * place that writes the table. The daily job (lib/retention) asks which
 * rows are old enough -- identifiers, category and timestamps only, never a
 * body -- and then has the bodies of the rows the policy selected replaced by
 * a marker. The rows themselves stay: that a mail went out, to whom and when
 * remains on record; what it said does not.
 */
export type CommunicationRetentionCandidate = {
  id: string;
  category: string;
  created_at: string;
  sent_at: string | null;
  body_text: string;
};

export async function listCommunicationsOlderThan(
  db: CommunicationClient,
  cutoff: string,
  categories: readonly string[],
): Promise<CommunicationRetentionCandidate[]> {
  const { data, error } = await db
    .from("customer_communications")
    .select("id, category, created_at, sent_at, body_text")
    .in("category", [...categories])
    .lt("created_at", cutoff);
  if (error) throw new Error(`Communicatie laden: ${error.message}`);
  return data;
}

export async function redactCommunicationBodies(db: CommunicationClient, ids: string[], marker: string): Promise<void> {
  const { error } = await db
    .from("customer_communications")
    .update({ body_text: marker, body_html: null })
    .in("id", ids);
  if (error) throw new Error(`Communicatie redigeren: ${error.message}`);
}

export async function recordCommunication(
  context: CommunicationContext,
  delivery: CommunicationDelivery,
): Promise<string | undefined> {
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
    const { data, error } = await context.db
      .from("customer_communications")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error) {
      // Identifiers and the category only: never the body, the subject or the
      // address, which is customer data and does not belong in a server log.
      console.error("Communication log write failed", {
        customerId: context.customerId,
        category: context.category,
        error: error.message,
      });
      return undefined;
    }
    return data?.id;
  } catch (error) {
    console.error("Communication log write threw", {
      customerId: context.customerId,
      category: context.category,
      error,
    });
    return undefined;
  }
}
