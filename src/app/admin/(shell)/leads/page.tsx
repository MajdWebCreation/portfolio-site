import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import LeadsList from "@/components/admin/leads/leads-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { toDateKey } from "@/lib/admin/format";
import { listLeads } from "@/lib/admin/leads/repository";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  await requireAdminAccess();
  const leads = await listLeads();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Leads"
        text="Prospects die je zelf benadert. Gesorteerd op wie het eerst opvolging nodig heeft."
      />
      <LeadsList leads={leads} todayKey={toDateKey(new Date())} />
    </div>
  );
}
