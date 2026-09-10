import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InquiryDetail from "@/components/admin/inquiries/inquiry-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { getCustomerIdForSource } from "@/lib/admin/customers/repository";
import { getInquiry } from "@/lib/admin/inquiries/repository";
import { inquiryOriginLabels } from "@/lib/admin/inquiries/types";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const inquiry = await getInquiry(id);
  return { title: inquiry ? `${inquiry.name} · Aanvragen` : "Aanvraag" };
}

export default async function InquiryPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const inquiry = await getInquiry(id);

  if (!inquiry) {
    notFound();
  }

  const customerId = await getCustomerIdForSource("inquiry", inquiry.id);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`${inquiryOriginLabels[inquiry.origin]} · ${inquiry.id}`}
        title={inquiry.company ? `${inquiry.name}, ${inquiry.company}` : inquiry.name}
        actions={
          <Link href="/admin/aanvragen" className="link-static text-[0.92rem] text-ink">
            Alle aanvragen
          </Link>
        }
      />
      <InquiryDetail inquiry={inquiry} customerId={customerId} />
    </div>
  );
}
