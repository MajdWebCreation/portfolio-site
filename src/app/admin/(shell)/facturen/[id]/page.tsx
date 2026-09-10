import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InvoiceBuilder from "@/components/admin/invoices/invoice-builder";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { getInvoice } from "@/lib/admin/invoices/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const item = await getInvoice(id);
  return { title: item ? `${item.number.value} · Facturen` : "Factuur" };
}

export default async function InvoicesDetailPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const item = await getInvoice(id);
  const customers = await listCustomers();

  if (!item) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Factuur · ${item.number.value}`}
        title={item.customer.companyName}
        text={item.paymentReference}
        actions={
          <Link href="/admin/facturen" className="link-static text-[0.92rem] text-ink">
            Alle facturen
          </Link>
        }
      />
      {/* Keyed on what sending changes; see the quote page. */}
      <InvoiceBuilder
        key={`${item.number.value}-${item.status}`}
        stored={item}
        customers={customers}
        todayKey={toDateKey(new Date())}
      />
    </div>
  );
}
