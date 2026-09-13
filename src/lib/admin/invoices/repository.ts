import { adminDb, failed } from "@/lib/admin/db";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";

/** Read access to invoices; see quotes/repository.ts. The row mapping lives in mapper.ts. */
export async function listInvoices(): Promise<Invoice[]> {
  const db = await adminDb();
  const { data, error } = await db.from("invoices").select(invoiceColumns).order("updated_at", { ascending: false });
  failed("Facturen laden", error);
  return ((data ?? []) as unknown as InvoiceRow[]).map(invoiceFromRow);
}

/**
 * The invoices of one customer, newest change first -- the order the invoice
 * list uses, so a customer page shows them the way the module does.
 *
 * Scoped in the query rather than filtered afterwards: the customer page used
 * to read every invoice in the database to show the handful that belong to one
 * customer. `invoices_customer_idx` is the index for it.
 */
export async function listInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("invoices")
    .select(invoiceColumns)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });
  failed("Facturen van klant laden", error);
  return ((data ?? []) as unknown as InvoiceRow[]).map(invoiceFromRow);
}

/** The invoices filed under one project, newest issue date first. */
export async function listInvoicesForProject(projectId: string): Promise<Invoice[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("invoices")
    .select(invoiceColumns)
    .eq("project_id", projectId)
    .order("issue_date", { ascending: false });
  failed("Facturen van project laden", error);
  return ((data ?? []) as unknown as InvoiceRow[]).map(invoiceFromRow);
}

/** The invoices that bill one recurring service, newest issue date first. */
export async function listInvoicesForRecurringService(recurringServiceId: string): Promise<Invoice[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("invoices")
    .select(invoiceColumns)
    .eq("recurring_service_id", recurringServiceId)
    .order("issue_date", { ascending: false });
  failed("Facturen van dienst laden", error);
  return ((data ?? []) as unknown as InvoiceRow[]).map(invoiceFromRow);
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("invoices").select(invoiceColumns).eq("id", id).maybeSingle();
  failed("Factuur laden", error);
  return data ? invoiceFromRow(data as unknown as InvoiceRow) : undefined;
}
