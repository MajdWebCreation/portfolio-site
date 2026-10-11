import PortalShell from "@/components/portal/portal-shell";
import { requirePortalMember } from "@/lib/portal/access";

/**
 * Frame for every page inside the portal. Without a session or a membership
 * the request never gets here; each page repeats the check, see
 * lib/portal/access.ts.
 */
export default async function PortalShellLayout({ children }: { children: React.ReactNode }) {
  const member = await requirePortalMember();
  return <PortalShell member={member}>{children}</PortalShell>;
}
