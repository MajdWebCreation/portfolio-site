import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalFrame from "@/components/portal/portal-frame";
import PortalSignOutButton from "@/components/portal/sign-out-button";
import { getPortalAccess } from "@/lib/portal/auth";
import { portalLoginPath, portalRoot } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Geen toegang" };

/**
 * Signed in, but no active membership: an admin without a customer, a member
 * whose access was ended, or an account that was never invited. Saying so
 * plainly beats a 404, and it reveals nothing the visitor does not know. The
 * way out is signing out.
 */
export default async function NoAccessPage() {
  const access = await getPortalAccess();
  if (access.state === "anonymous") redirect(portalLoginPath);
  if (access.state === "member") redirect(portalRoot);

  return (
    <PortalFrame title="Geen toegang">
      <div className="mt-6 border-l-2 border-danger pl-4">
        <p className="text-[0.95rem] text-body">
          {access.email ? `U bent ingelogd als ${access.email}, maar dit` : "Dit"} account heeft op dit moment geen toegang
          tot een klantportaal.
        </p>
        <p className="mt-3 text-[0.9rem] text-muted">
          Verwacht u wel toegang? Neem dan contact op met YM Creations via contact@ymcreations.com.
        </p>
        <PortalSignOutButton className="mt-4 inline-block text-[0.92rem]" />
      </div>
    </PortalFrame>
  );
}
