import { adminDb, failed } from "@/lib/admin/db";
import { creditNoteColumns, creditNoteFromRow, refundColumns, refundFromRow, type CreditNoteRow } from "@/lib/admin/credit-notes/mapper";
import type { CreditNote, Refund } from "@/lib/admin/credit-notes/types";

/** Read access to credit notes and refunds; admins only, as elsewhere. */
export async function listCreditNotes(): Promise<CreditNote[]> {
  const db = await adminDb();
  const { data, error } = await db.from("credit_notes").select(creditNoteColumns).order("issue_date", { ascending: false }).order("created_at", { ascending: false });
  failed("Creditnota's laden", error);
  return ((data ?? []) as unknown as CreditNoteRow[]).map(creditNoteFromRow);
}

export async function listCreditNotesForCustomer(customerId: string): Promise<CreditNote[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("credit_notes")
    .select(creditNoteColumns)
    .eq("customer_id", customerId)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  failed("Creditnota's van klant laden", error);
  return ((data ?? []) as unknown as CreditNoteRow[]).map(creditNoteFromRow);
}

export async function listCreditNotesForInvoice(invoiceId: string): Promise<CreditNote[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("credit_notes")
    .select(creditNoteColumns)
    .eq("invoice_id", invoiceId)
    .order("issue_date", { ascending: true })
    .order("created_at", { ascending: true });
  failed("Creditnota's van factuur laden", error);
  return ((data ?? []) as unknown as CreditNoteRow[]).map(creditNoteFromRow);
}

export async function getCreditNote(id: string): Promise<CreditNote | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("credit_notes").select(creditNoteColumns).eq("id", id).maybeSingle();
  failed("Creditnota laden", error);
  return data ? creditNoteFromRow(data as unknown as CreditNoteRow) : undefined;
}

export async function listRefunds(): Promise<Refund[]> {
  const db = await adminDb();
  const { data, error } = await db.from("refunds").select(refundColumns).order("created_at", { ascending: false });
  failed("Terugbetalingen laden", error);
  return (data ?? []).map(refundFromRow);
}

export async function listRefundsForCustomer(customerId: string): Promise<Refund[]> {
  const db = await adminDb();
  const { data, error } = await db.from("refunds").select(refundColumns).eq("customer_id", customerId).order("created_at", { ascending: false });
  failed("Terugbetalingen van klant laden", error);
  return (data ?? []).map(refundFromRow);
}

export async function listRefundsForInvoice(invoiceId: string): Promise<Refund[]> {
  const db = await adminDb();
  const { data, error } = await db.from("refunds").select(refundColumns).eq("invoice_id", invoiceId).order("created_at", { ascending: true });
  failed("Terugbetalingen van factuur laden", error);
  return (data ?? []).map(refundFromRow);
}
