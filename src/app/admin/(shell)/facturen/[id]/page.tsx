import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import InvoiceBuilder from "@/components/admin/invoices/invoice-builder";
import InvoiceIssued from "@/components/admin/invoices/invoice-issued";
import InvoiceCollection from "@/components/admin/payments/invoice-collection";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listProjects } from "@/lib/admin/projects/repository";
import { readInvoice, readQuote, readRecurringServicesForCustomer } from "@/lib/admin/readers";
import { invoiceActivation } from "@/lib/payments/activation-view";
import { getCollectionState, listCollectionEventsForInvoice } from "@/lib/payments/collection-repository";
import { invoiceCollectionView } from "@/lib/payments/collection-state";
import { listPaymentsForInvoice } from "@/lib/payments/repository";
import { isCollecting } from "@/lib/payments/types";
import { invoiceStatusLabels } from "@/lib/admin/invoices/types";

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

    That question, the activation state, the payments and the reminder ladder
    all depend on the invoice and on nothing else, so they are asked at the
    same time. The activation state needs the customer's recurring services,
    and so does the direct-debit question below; both read them through the
    request-scoped reader, so the two callers share one query.
  */
  const [quote, activation, payments, events, collectionState, services] = await Promise.all([
    item.quoteId ? readQuote(item.quoteId) : undefined,
    invoiceActivation({ id: item.id, customerId: item.customer.customerId, status: item.status }),
    listPaymentsForInvoice(item.id),
    listCollectionEventsForInvoice(item.id),
    getCollectionState(item.id),
    readRecurringServicesForCustomer(item.customer.customerId),
  ]);

  /*
    Where this invoice stands in the reminder ladder. Derived here from the
    same inputs the daily job derives it from, so the screen and the job can
    never say different things about what happens next.
  */
  const todayKey = toDateKey(new Date());
  const collection = invoiceCollectionView({
    invoice: item,
    payments,
    events,
    ...(collectionState ? { state: collectionState } : {}),
    directDebit: services.some((service) => service.id === item.recurringServiceId && isCollecting(service)),
    todayKey,
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`${invoiceStatusLabels[item.status]} · ${item.number.value}`}
        title={item.customer.companyName}
        text={item.paymentReference}
        actions={
          <Link href="/admin/facturen" className="link-static text-[0.92rem] text-ink">
            Alle facturen
          </Link>
        }
      />
      {/*
        Two screens, one page. A concept is something to write, so it gets the
        builder; a numbered invoice is something to check and send, so it
        gets the document. Which of the two is not a matter of taste: the
        database refuses every edit from the moment the number is taken, and
        a form that cannot save is worse than no form. That moment is
        `finalizingAt`, which is also set on an invoice whose PDF still has
        to be stored -- that one is shown as unfinished, with the way to
        finish it.
      */}
      {item.finalizingAt ? (
        <InvoiceIssued invoice={item} />
      ) : (
        /* Keyed on what issuing changes; see the quote page. */
        <InvoiceBuilder
          key={`${item.number.value}-${item.status}`}
          stored={item}
          customers={customers}
          projects={projects}
          quoteProjectId={quote?.projectId}
          activation={activation}
          todayKey={todayKey}
        />
      )}

      {/*
        Only for an invoice that actually went out. A concept has not been
        charged, so there is nothing to follow up and an empty section would
        only be noise on the screen where invoices are written.
      */}
      {item.sentAt ? (
        <AdminSection id="collection" title="Betalingsopvolging" note="Automatische herinneringen">
          <InvoiceCollection invoiceId={item.id} view={collection} />
        </AdminSection>
      ) : null}
    </div>
  );
}
