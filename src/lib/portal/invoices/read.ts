import { invoiceFromPortalRow, type PortalInvoice } from "@/lib/portal/invoices/model";
import { portalReader, portalResult, requireResourceId } from "@/lib/portal/rpc";

/** The invoices this customer received, newest first. Throws PortalDenied when the caller may not act for it. */
export async function readPortalInvoices(customerId: string): Promise<PortalInvoice[]> {
  const db = await portalReader();
  const rows = portalResult("Facturen laden", await db.rpc("portal_invoices", { p_customer_id: customerId }));
  return rows.map(invoiceFromPortalRow);
}

/** One of them. Throws PortalDenied for anything that is not this customer's visible invoice. */
export async function readPortalInvoice(customerId: string, invoiceId: string): Promise<PortalInvoice> {
  const db = await portalReader();
  const rows = portalResult("Factuur laden", await db.rpc("portal_invoice", { p_customer_id: customerId, p_invoice_id: requireResourceId(invoiceId) }));
  const row = rows[0];
  if (!row) throw new Error("Factuur laden: geen antwoord");
  return invoiceFromPortalRow(row);
}
