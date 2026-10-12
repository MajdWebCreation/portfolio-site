import type { Metadata } from "next";
import Link from "next/link";
import RequestForm from "@/components/portal/request-form";
import { PageHeader } from "@/components/portal/portal-ui";
import { requirePortalMember } from "@/lib/portal/access";
import { portalRequestsPath } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Nieuw verzoek" };

export default async function PortalNewRequestPage() {
  const member = await requirePortalMember();

  return (
    <div>
      <p className="text-[0.9rem]">
        <Link href={portalRequestsPath} className="link-static text-muted">
          ← Verzoeken
        </Link>
      </p>
      <div className="mt-6">
        <PageHeader label="Nieuw verzoek" title="Wat kunnen we voor u doen?">
          <p>Beschrijf zo concreet mogelijk wat u wilt. U kunt foto&apos;s, screenshots of een PDF meesturen.</p>
        </PageHeader>
      </div>
      <RequestForm key={member.current.customerId} customerId={member.current.customerId} />
    </div>
  );
}
