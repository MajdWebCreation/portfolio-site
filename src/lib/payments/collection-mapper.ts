import type { CollectionEvent, CollectionState } from "@/lib/payments/collection-state";
import type { ReminderStage } from "@/lib/payments/collection-policy";
import type { Database } from "@/lib/supabase/database.types";

export type CollectionEventRow = Database["public"]["Tables"]["invoice_collection_events"]["Row"];
export type InvoiceCollectionRow = Database["public"]["Tables"]["invoice_collections"]["Row"];

export const collectionEventColumns =
  "id, invoice_id, customer_id, stage, eligible_on, days_overdue, recipient, subject, status, provider_message_id, communication_id, error, claimed_at, sent_at, created_at";

export const invoiceCollectionColumns = "invoice_id, state, note, created_at, updated_at";

export function collectionEventFromRow(row: CollectionEventRow): CollectionEvent {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    customerId: row.customer_id,
    stage: row.stage as ReminderStage,
    eligibleOn: row.eligible_on,
    daysOverdue: row.days_overdue,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status as CollectionEvent["status"],
    claimedAt: row.claimed_at,
    createdAt: row.created_at,
    ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
    ...(row.communication_id ? { communicationId: row.communication_id } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
  };
}

export function collectionStateFromRow(row: Pick<InvoiceCollectionRow, "state">): CollectionState {
  return row.state as CollectionState;
}
