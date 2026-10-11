import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import CustomerSwitcher from "@/components/portal/customer-switcher";
import PortalSignOutButton from "@/components/portal/sign-out-button";
import type { PortalIdentity } from "@/lib/portal/types";
import { portalAccountPath, portalRoot } from "@/lib/portal/paths";

/**
 * Frame of every page inside the portal: a single header with the mark, the
 * customer this visit is about, two links and the way out; the page below in
 * one bounded column. Deliberately not the admin's sidebar: a customer has a
 * handful of things to look at, not a workbench.
 */
export default function PortalShell({ member, children }: { member: PortalIdentity; children: React.ReactNode }) {
  const several = member.memberships.length > 1;

  return (
    <div className="min-h-dvh bg-paper text-body">
      <header className="border-b border-line bg-surface">
        <div className="container-x flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-4">
          <div className="flex items-center gap-6">
            <BrandMark href={portalRoot} className="h-7 w-[98px]" label="Klantportaal YM Creations" />
            {several ? (
              <CustomerSwitcher memberships={member.memberships} currentId={member.current.customerId} />
            ) : (
              <p className="text-[0.9rem] text-muted">{member.current.companyName}</p>
            )}
          </div>
          <nav aria-label="Portaal" className="flex items-center gap-5 text-[0.92rem]">
            <Link href={portalRoot} className="link-static text-ink">
              Overzicht
            </Link>
            <Link href={portalAccountPath} className="link-static text-ink">
              Account
            </Link>
            <PortalSignOutButton />
          </nav>
        </div>
      </header>
      <main id="main" className="container-x py-10 sm:py-14">
        <div className="max-w-[48rem]">{children}</div>
      </main>
      <footer className="container-x border-t border-line py-6 text-[0.82rem] text-muted">
        <p>Klantportaal van YM Creations. Vragen? Mail naar contact@ymcreations.com.</p>
      </footer>
    </div>
  );
}
