import BrandMark from "@/components/brand-mark";
import CustomerSwitcher from "@/components/portal/customer-switcher";
import PortalNav from "@/components/portal/portal-nav";
import PortalSignOutButton from "@/components/portal/sign-out-button";
import type { PortalIdentity } from "@/lib/portal/types";
import { portalRoot } from "@/lib/portal/paths";

/**
 * Frame of every page inside the portal: a header with the mark, the
 * customer this visit is about and the way out, the sections below it, and
 * the page in one bounded column. Deliberately not the admin's sidebar: a
 * customer has a handful of things to look at, not a workbench.
 */
export default function PortalShell({ member, children }: { member: PortalIdentity; children: React.ReactNode }) {
  const several = member.memberships.length > 1;

  return (
    <div className="min-h-dvh bg-paper text-body">
      <header className="border-b border-line bg-surface">
        {/* One row on a desk; on a phone the company drops to its own line and the way out stays beside the mark. */}
        <div className="container-x flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
          <BrandMark href={portalRoot} className="order-1 h-7 w-[98px]" label="Klantportaal YM Creations" />
          <div className="order-3 w-full min-w-0 sm:order-2 sm:w-auto">
            {several ? (
              <CustomerSwitcher memberships={member.memberships} currentId={member.current.customerId} />
            ) : (
              <p className="truncate text-[0.9rem] text-muted">{member.current.companyName}</p>
            )}
          </div>
          <div className="order-2 ml-auto sm:order-3">
            <PortalSignOutButton className="text-[0.92rem]" />
          </div>
        </div>
        <div className="container-x mt-2">
          <PortalNav />
        </div>
      </header>
      <main id="main" className="container-x py-10 sm:py-14">
        <div className="max-w-[60rem]">{children}</div>
      </main>
      <footer className="container-x border-t border-line py-6 text-[0.82rem] text-muted">
        <p>Klantportaal van YM Creations. Vragen? Mail naar contact@ymcreations.com.</p>
      </footer>
    </div>
  );
}
