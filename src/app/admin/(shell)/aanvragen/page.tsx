import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InquiriesList from "@/components/admin/inquiries/inquiries-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listInquiries } from "@/lib/admin/inquiries/repository";

export const metadata: Metadata = { title: "Aanvragen" };

export default async function InquiriesPage() {
  await requireAdminAccess();
  const inquiries = await listInquiries();
  const newCount = inquiries.filter((inquiry) => inquiry.status === "new").length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Aanvragen"
        text={`Binnengekomen via het contactformulier en de projectplanner. ${newCount} nieuw.`}
      />
      <InquiriesList inquiries={inquiries} />
    </div>
  );
}
