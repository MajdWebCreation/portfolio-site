import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import CustomerDetail from "@/components/admin/customers/customer-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { getCustomer } from "@/lib/admin/customers/repository";
import { getInquiry } from "@/lib/admin/inquiries/repository";
import { listInvoices } from "@/lib/admin/invoices/repository";
import { getLead } from "@/lib/admin/leads/repository";
import { listQuotes } from "@/lib/admin/quotes/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const customer = await getCustomer(id);
  return { title: customer ? `${customer.companyName} · Klanten` : "Klant" };
}

export default async function CustomerPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const customer = await getCustomer(id);

  if (!customer) {
    notFound();
  }

  const [sourceInquiry, sourceLead, quotes, invoices] = await Promise.all([
    customer.sourceInquiryId ? getInquiry(customer.sourceInquiryId) : undefined,
    customer.sourceLeadId ? getLead(customer.sourceLeadId) : undefined,
    listQuotes(),
    listInvoices(),
  ]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Klant · ${customer.id}`}
        title={customer.companyName}
        text={customer.contactName}
        actions={
          <Link href="/admin/klanten" className="link-static text-[0.92rem] text-ink">
            Alle klanten
          </Link>
        }
      />
      <CustomerDetail
        customer={customer}
        sourceInquiry={sourceInquiry}
        sourceLead={sourceLead}
        quotes={quotes}
        invoices={invoices}
      />
    </div>
  );
}
