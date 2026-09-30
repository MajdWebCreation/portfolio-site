import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InquiryDetail from "@/components/admin/inquiries/inquiry-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { getCustomerIdForSource } from "@/lib/admin/customers/repository";
import { listInquiryStatusEvents, loadInquiryValuePrefill } from "@/lib/admin/inquiries/repository";
import { suggestServiceInterest } from "@/lib/admin/inquiries/service-interest";
import { inquiryOriginLabels } from "@/lib/admin/inquiries/types";
import { readInquiry } from "@/lib/admin/readers";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const inquiry = await readInquiry(id);
  return { title: inquiry ? `${inquiry.name} · Aanvragen` : "Aanvraag" };
}

export default async function InquiryPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const inquiry = await readInquiry(id);

  if (!inquiry) {
    notFound();
  }

  const customerId = await getCustomerIdForSource("inquiry", inquiry.id);
  /* The history and the value proposals need nothing from each other. */
  const [events, prefill] = await Promise.all([listInquiryStatusEvents(inquiry.id), loadInquiryValuePrefill(customerId)]);
  const suggestedService = suggestServiceInterest(inquiry);

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
      <InquiryDetail inquiry={inquiry} customerId={customerId} prefill={prefill} suggestedService={suggestedService} events={events} />
    </div>
  );
}
