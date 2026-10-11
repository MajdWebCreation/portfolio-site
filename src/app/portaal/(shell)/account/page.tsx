import type { Metadata } from "next";
import Link from "next/link";
import PortalSignOutButton from "@/components/portal/sign-out-button";
import { requirePortalMember } from "@/lib/portal/access";
import { portalChangePasswordPath } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Account" };

/** The account itself: the address it signs in with, the customers it may act for, the password. */
export default async function PortalAccountPage() {
  const member = await requirePortalMember();

  return (
    <div>
      <p className="label-mono">Account</p>
      <h1 className="display-md mt-4">Uw account</h1>

      <dl className="mt-8 border-t border-line">
        <div className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="text-[0.85rem] text-muted">E-mailadres</dt>
          <dd className="text-[0.95rem] text-ink">{member.email ?? "Onbekend"}</dd>
        </div>
        <div className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="text-[0.85rem] text-muted">Toegang tot</dt>
          <dd className="text-[0.95rem] text-ink">
            <ul className="space-y-1">
              {member.memberships.map((membership) => (
                <li key={membership.customerId}>
                  {membership.companyName}
                  {membership.customerId === member.current.customerId && member.memberships.length > 1 ? (
                    <span className="ml-2 text-[0.82rem] text-muted">huidig</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-wrap items-center gap-6 text-[0.95rem]">
        <Link href={portalChangePasswordPath} className="link-static text-ink">
          Wachtwoord wijzigen
        </Link>
        <PortalSignOutButton />
      </div>
    </div>
  );
}
