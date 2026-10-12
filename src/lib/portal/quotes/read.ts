import { quoteDetailFromPortalRow, quoteFromPortalRow, type PortalQuote, type PortalQuoteDetail } from "@/lib/portal/quotes/model";
import { portalReader, portalResult, requireResourceId } from "@/lib/portal/rpc";

/** The quotes this customer received, newest first. Throws PortalDenied when the caller may not act for it. */
export async function readPortalQuotes(customerId: string): Promise<PortalQuote[]> {
  const db = await portalReader();
  const rows = portalResult("Offertes laden", await db.rpc("portal_quotes", { p_customer_id: customerId }));
  return rows.map(quoteFromPortalRow);
}

/** One of them, with the versions of its chain. Throws PortalDenied for anything else. */
export async function readPortalQuote(customerId: string, quoteId: string): Promise<PortalQuoteDetail> {
  const db = await portalReader();
  const rows = portalResult("Offerte laden", await db.rpc("portal_quote", { p_customer_id: customerId, p_quote_id: requireResourceId(quoteId) }));
  const row = rows[0];
  if (!row) throw new Error("Offerte laden: geen antwoord");
  return quoteDetailFromPortalRow(row);
}
