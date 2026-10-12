import type { Metadata } from "next";
import ProfileForm from "@/components/portal/profile-form";
import { PageHeader } from "@/components/portal/portal-ui";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { readPortalProfile } from "@/lib/portal/profile/read";

export const metadata: Metadata = { title: "Mijn gegevens" };

/**
 * The customer's details as YM Creations has them now, editable. A change
 * reaches the next quote, invoice and mail; documents that already exist
 * keep the details they were made with.
 */
export default async function PortalDetailsPage() {
  const member = await requirePortalMember();
  const profile = await orNoAccess(readPortalProfile(member.current.customerId));

  return (
    <div>
      <PageHeader label="Mijn gegevens" title={profile.fields.companyName}>
        <p>
          Zo staan uw gegevens bij YM Creations geregistreerd. Wijzigt u iets, dan gebruiken wij dat voor nieuwe offertes,
          facturen en berichten. Documenten die u al heeft ontvangen, blijven zoals ze zijn.
        </p>
      </PageHeader>

      <ProfileForm key={member.current.customerId} customerId={member.current.customerId} fields={profile.fields} version={profile.version} />
    </div>
  );
}
