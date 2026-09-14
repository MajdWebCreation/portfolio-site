import { adminDb, failed } from "@/lib/admin/db";
import {
  collectionEventColumns,
  collectionEventFromRow,
  type CollectionEventRow,
} from "@/lib/payments/collection-mapper";
import type { CollectionEvent, CollectionState } from "@/lib/payments/collection-state";

/** Read access to the reminder administration; admins only, as elsewhere. */

/** Every reminder attempt for one invoice, oldest first. */
export async function listCollectionEventsForInvoice(invoiceId: string): Promise<CollectionEvent[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("invoice_collection_events")
    .select(collectionEventColumns)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  failed("Herinneringen van factuur laden", error);
  return ((data ?? []) as CollectionEventRow[]).map(collectionEventFromRow);
}

/** Every reminder attempt across every invoice, for the overview screens. */
export async function listCollectionEvents(): Promise<CollectionEvent[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("invoice_collection_events")
    .select(collectionEventColumns)
    .order("created_at", { ascending: true });
  failed("Herinneringen laden", error);
  return ((data ?? []) as CollectionEventRow[]).map(collectionEventFromRow);
}

/**
 * What a human decided about chasing an invoice. Absent means nobody has
 * intervened, which is the same thing as `active` -- so the caller gets
 * `undefined` and `invoiceCollectionView` fills in the default, rather than
 * this module inventing a row that does not exist.
 */
export async function getCollectionState(invoiceId: string): Promise<CollectionState | undefined> {
  const db = await adminDb();
  const { data, error } = await db
    .from("invoice_collections")
    .select("state")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  failed("Opvolgstatus laden", error);
  return data ? (data.state as CollectionState) : undefined;
}

/** The same, for every invoice at once. */
export async function listCollectionStates(): Promise<Map<string, CollectionState>> {
  const db = await adminDb();
  const { data, error } = await db.from("invoice_collections").select("invoice_id, state");
  failed("Opvolgstatussen laden", error);
  return new Map((data ?? []).map((row) => [row.invoice_id, row.state as CollectionState]));
}
