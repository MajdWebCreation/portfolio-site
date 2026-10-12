import { paymentContextFromRow, type PortalPaymentContext } from "@/lib/portal/payments/model";
import { portalReader, portalResult } from "@/lib/portal/rpc";

/** Direct debit status and the invoices it collects. Throws PortalDenied when the caller may not act for this customer. */
export async function readPortalPaymentContext(customerId: string): Promise<PortalPaymentContext> {
  const db = await portalReader();
  const rows = portalResult("Betaalgegevens laden", await db.rpc("portal_payment_context", { p_customer_id: customerId }));
  const row = rows[0];
  if (!row) throw new Error("Betaalgegevens laden: geen antwoord");
  return paymentContextFromRow(row);
}
