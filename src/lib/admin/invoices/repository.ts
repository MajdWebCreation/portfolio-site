import { adminDb, failed } from "@/lib/admin/db";
import { linesFromRows, snapshotFromRow, type LineRow } from "@/lib/admin/documents/mapper";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";

/** Read access to invoices; see quotes/repository.ts. */
const columns = `
  id, number_value, number_provisional, status,
  customer_id, customer_company_name, customer_contact_name, customer_email,
  customer_street, customer_postal_code, customer_city, customer_country,
  customer_kvk_number, customer_vat_number,
  issue_date, due_date, payment_reference, notes, quote_id, sent_at, recipient_email, created_at, updated_at,
  invoice_lines ( id, position, description, quantity_hundredths, unit_price_cents, vat_rate )
`;

type InvoiceWithLines = Parameters<typeof invoiceFromRow>[0];

function invoiceFromRow(row: {
  id: string;
  number_value: string;
  number_provisional: boolean;
  status: string;
  customer_id: string;
  customer_company_name: string;
  customer_contact_name: string;
  customer_email: string;
  customer_street: string;
  customer_postal_code: string;
  customer_city: string;
  customer_country: string;
  customer_kvk_number: string | null;
  customer_vat_number: string | null;
  issue_date: string;
  due_date: string;
  payment_reference: string;
  notes: string;
  quote_id: string | null;
  sent_at: string | null;
  recipient_email: string | null;
  updated_at: string;
  invoice_lines: LineRow[];
}): Invoice {
  return {
    id: row.id,
    number: { value: row.number_value, provisional: row.number_provisional },
    status: row.status as InvoiceStatus,
    customer: snapshotFromRow(row),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paymentReference: row.payment_reference,
    lines: linesFromRows(row.invoice_lines ?? []),
    notes: row.notes,
    updatedAt: row.updated_at,
    ...(row.quote_id ? { quoteId: row.quote_id } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.recipient_email ? { recipientEmail: row.recipient_email } : {}),
  };
}

export async function listInvoices(): Promise<Invoice[]> {
  const db = await adminDb();
  const { data, error } = await db.from("invoices").select(columns).order("updated_at", { ascending: false });
  failed("Facturen laden", error);
  return ((data ?? []) as unknown as InvoiceWithLines[]).map(invoiceFromRow);
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("invoices").select(columns).eq("id", id).maybeSingle();
  failed("Factuur laden", error);
  return data ? invoiceFromRow(data as unknown as InvoiceWithLines) : undefined;
}
