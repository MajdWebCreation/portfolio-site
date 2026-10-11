import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalMember } from "@/lib/portal/access";
import { portalAccountPath } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Overzicht" };

/**
 * The portal's first page. In this phase it says who is signed in and for
 * which customer, and nothing more: what a customer can see of their quotes,
 * invoices and services arrives in the next phase, through its own,
 * customer-scoped reads. The name shown here comes from the membership
 * function, not from a read of the customer record.
 */
export default async function PortalHomePage() {
  const member = await requirePortalMember();

  return (
    <div>
      <p className="label-mono">{member.current.companyName}</p>
      <h1 className="display-md mt-4">Welkom in je klantportaal</h1>
      <p className="mt-5 max-w-prose text-[1.02rem] leading-relaxed text-body">
        Dit is de plek waar u binnenkort uw offertes, facturen en diensten bij YM Creations terugvindt. Op dit moment
        is uw account ingericht; de inhoud volgt stap voor stap.
      </p>
      <p className="mt-6 text-[0.95rem]">
        <Link href={portalAccountPath} className="link-static text-ink">
          Uw account en wachtwoord
        </Link>
      </p>
    </div>
  );
}
