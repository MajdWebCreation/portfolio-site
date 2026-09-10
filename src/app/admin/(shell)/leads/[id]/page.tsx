import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import LeadDetail from "@/components/admin/leads/lead-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { getCustomerIdForSource } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { getLead } from "@/lib/admin/leads/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const lead = await getLead(id);
  return { title: lead ? `${lead.companyName} · Leads` : "Lead" };
}

export default async function LeadPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const lead = await getLead(id);

  if (!lead) {
    notFound();
  }

  const customerId = await getCustomerIdForSource("lead", lead.id);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Lead"
        title={lead.companyName}
        text={lead.contactName}
        actions={
          <Link href="/admin/leads" className="link-static text-[0.92rem] text-ink">
            Alle leads
          </Link>
        }
      />
      <LeadDetail lead={lead} todayKey={toDateKey(new Date())} customerId={customerId} />
    </div>
  );
}
