import { redirect } from "next/navigation";
import { getPortalAccess } from "@/lib/portal/auth";
import type { PortalIdentity } from "@/lib/portal/types";
import { portalLoginPath, portalNoAccessPath } from "@/lib/portal/paths";

/**
 * The portal's guard. Call it in the shell layout AND in every portal page
 * and server action: layouts and pages render in parallel, so a check in
 * the layout alone would still let a page's payload be rendered. Cached per
 * request, so repeating it costs nothing.
 *
 * Three outcomes, three places: no session goes to the login, a session
 * without an active membership goes to the "geen toegang" page, and a member
 * gets their identity with the customer this request acts for.
 *
 * Deliberately no database client is handed out here. In this phase a member
 * reads nothing but the portal functions, and the projection a later phase
 * adds will come with its own, customer-scoped reader.
 */
export async function requirePortalMember(): Promise<PortalIdentity> {
  const access = await getPortalAccess();

  if (access.state === "member") return access.member;
  if (access.state === "no_membership") redirect(portalNoAccessPath);
  redirect(portalLoginPath);
}
