import type { Metadata } from "next";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { PageHeader } from "@/components/portal/portal-ui";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { readPortalCustomer } from "@/lib/portal/customers/read";

export const metadata: Metadata = { title: "Mijn gegevens" };

/** The customer's details as YM Creations has them now; the next document is addressed with these. */
export default async function PortalDetailsPage() {
  const member = await requirePortalMember();
  const customer = await orNoAccess(readPortalCustomer(member.current.customerId));

  return (
    <div>
      <PageHeader label="Mijn gegevens" title={customer.companyName}>
        <p>
          Zo staan uw gegevens bij YM Creations geregistreerd; nieuwe offertes en facturen worden hierop gericht. Klopt er iets
          niet? Mail de wijziging naar contact@ymcreations.com.
        </p>
      </PageHeader>

      <DetailList className="mt-10">
        <DetailRow term="Bedrijfsnaam">{customer.companyName}</DetailRow>
        <DetailRow term="Contactpersoon">{customer.contactName || "—"}</DetailRow>
        <DetailRow term="E-mailadres">{customer.email}</DetailRow>
        <DetailRow term="Telefoon">{customer.phone || "—"}</DetailRow>
        <DetailRow term="Adres">
          {customer.street}
          <span className="block">
            {customer.postalCode} {customer.city}
          </span>
          {customer.country ? <span className="block">{customer.country}</span> : null}
        </DetailRow>
        <DetailRow term="KvK-nummer">{customer.kvkNumber || "—"}</DetailRow>
        <DetailRow term="Btw-nummer">{customer.vatNumber || "—"}</DetailRow>
      </DetailList>
    </div>
  );
}
