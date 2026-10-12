import { requestFromRow, requestSummaryFromRow, type PortalRequest, type PortalRequestSummary } from "@/lib/portal/requests/model";
import { portalReader, portalResult, requireResourceId } from "@/lib/portal/rpc";

/** This customer's requests, newest first. Throws PortalDenied when the caller may not act for it. */
export async function readPortalRequests(customerId: string): Promise<PortalRequestSummary[]> {
  const db = await portalReader();
  const rows = portalResult("Verzoeken laden", await db.rpc("portal_requests", { p_customer_id: customerId }));
  return rows.map(requestSummaryFromRow);
}

/** One of them, with its attachments. Throws PortalDenied for anything else. */
export async function readPortalRequest(customerId: string, requestId: string): Promise<PortalRequest> {
  const db = await portalReader();
  const rows = portalResult("Verzoek laden", await db.rpc("portal_request", { p_customer_id: customerId, p_request_id: requireResourceId(requestId) }));
  const row = rows[0];
  if (!row) throw new Error("Verzoek laden: geen antwoord");
  return requestFromRow(row);
}

export const requestAttachmentBucket = "request-attachments";
