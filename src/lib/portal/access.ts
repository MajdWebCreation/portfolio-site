import { notFound, redirect } from "next/navigation";
import { getPortalAccess } from "@/lib/portal/auth";
import type { PortalIdentity } from "@/lib/portal/types";
import { portalLoginPath, portalNoAccessPath } from "@/lib/portal/paths";
import { PortalDenied } from "@/lib/portal/rpc";

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
 * Deliberately no database client is handed out here. A member reads
 * nothing but the portal functions, through the readers under lib/portal,
 * each of which names the customer and is checked again by the database.
 */
export async function requirePortalMember(): Promise<PortalIdentity> {
  const access = await getPortalAccess();

  if (access.state === "member") return access.member;
  if (access.state === "no_membership") redirect(portalNoAccessPath);
  redirect(portalLoginPath);
}

/**
 * A portal read on a list page. A refusal there means the membership ended
 * between the guard and the read -- the same "geen toegang" the guard gives.
 */
export async function orNoAccess<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof PortalDenied) redirect(portalNoAccessPath);
    throw error;
  }
}

/**
 * A portal read of one resource by id. Another customer's, a concept, or
 * nothing at all: the database gives one answer, and so does the page -- not
 * found.
 */
export async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof PortalDenied) notFound();
    throw error;
  }
}
