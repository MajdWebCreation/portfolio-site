import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import LeadForm from "@/components/admin/leads/lead-form";
import { requireAdminAccess } from "@/lib/admin/access";
import { toDateKey } from "@/lib/admin/format";

export const metadata: Metadata = { title: "Nieuwe lead" };

export default async function NewLeadPage() {
  await requireAdminAccess();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Leads"
        title="Nieuwe lead"
        text="Een prospect die je zelf hebt gevonden of benaderd."
        actions={
          <Link href="/admin/leads" className="link-static text-[0.92rem] text-ink">
            Alle leads
          </Link>
        }
      />
      <LeadForm todayKey={toDateKey(new Date())} />
    </div>
  );
}
