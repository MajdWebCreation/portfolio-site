import { portalReader, portalResult } from "@/lib/portal/rpc";
import { serviceFromPortalRow, type PortalService } from "@/lib/portal/services/model";

/** The monthly services of this customer. Throws PortalDenied when the caller may not act for it. */
export async function readPortalServices(customerId: string): Promise<PortalService[]> {
  const db = await portalReader();
  const rows = portalResult("Diensten laden", await db.rpc("portal_services", { p_customer_id: customerId }));
  return rows.map(serviceFromPortalRow);
}
