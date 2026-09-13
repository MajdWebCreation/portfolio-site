import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InvoiceBuilder from "@/components/admin/invoices/invoice-builder";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listProjects } from "@/lib/admin/projects/repository";
import { readInvoice, readQuote } from "@/lib/admin/readers";
import { invoiceActivation } from "@/lib/payments/activation-view";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const item = await readInvoice(id);
  return { title: item ? `${item.number.value} · Facturen` : "Factuur" };
}

export default async function InvoicesDetailPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  /* The selectable customers and projects have nothing to do with which
     invoice this is, so they are read alongside it rather than after it. */
  const [item, customers, projects] = await Promise.all([readInvoice(id), listCustomers(), listProjects()]);

  if (!item) {
    notFound();
  }

  /*
    An invoice that follows from a quote may only sit in that quote's project;
    the database refuses any other pair. The builder needs to know which one
    that is, so it can offer that project and nothing else.

    That question and the activation state both depend on the invoice and on
    nothing else, so they are asked at the same time.
  */
  const [quote, activation] = await Promise.all([
    item.quoteId ? readQuote(item.quoteId) : undefined,
    invoiceActivation({ id: item.id, customerId: item.customer.customerId, status: item.status }),
  ]);

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
        projects={projects}
        quoteProjectId={quote?.projectId}
        activation={activation}
        todayKey={toDateKey(new Date())}
      />
    </div>
  );
}
