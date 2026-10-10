import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import CustomerDetail from "@/components/admin/customers/customer-detail";
import StatusBadge from "@/components/admin/status-badge";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCommunicationsForCustomer } from "@/lib/admin/communications/repository";
import { customerStatusLabels, customerStatusTone } from "@/lib/admin/customers/types";
import { toDateKey } from "@/lib/admin/format";
import { listInvoicesForCustomer } from "@/lib/admin/invoices/repository";
import { listProjectsForCustomer } from "@/lib/admin/projects/repository";
import { listQuotesForCustomer } from "@/lib/admin/quotes/repository";
import { readCustomer, readInquiry, readLead } from "@/lib/admin/readers";
import { firstCollectionDate } from "@/lib/payments/collection-start";
import { directDebitView } from "@/lib/payments/direct-debit-view";
import { customerFinancials, customerPaymentStatusLabels, customerPaymentStatusTone } from "@/lib/payments/customer-status";
import { formatCents } from "@/lib/money";
import { recurringOverview, type RecurringOverview } from "@/lib/payments/prenotification";
import { recurringManagement, type RecurringManagement } from "@/lib/payments/recurring-management";
import {
  listPaymentsForCustomer,
  listPrenotificationsForCustomer,
  listPriceChangesOfCustomer,
  listRecurringServicesForCustomer,
} from "@/lib/payments/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const customer = await readCustomer(id);
  return { title: customer ? `${customer.companyName} · Klanten` : "Klant" };
}

export default async function CustomerPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const customer = await readCustomer(id);

  if (!customer) {
    notFound();
  }

  /*
    Everything the page shows hangs off this one customer, so once the record
    is in hand every other read can go out together. The mandate question is
    asked here as well, alongside the services it will be matched with, rather
    than after them.
  */
  const [
    sourceInquiry,
    sourceLead,
    quotes,
    invoices,
    projects,
    payments,
    recurringServices,
    prenotifications,
    communications,
    directDebit,
    priceChanges,
  ] = await Promise.all([
    customer.sourceInquiryId ? readInquiry(customer.sourceInquiryId) : undefined,
    customer.sourceLeadId ? readLead(customer.sourceLeadId) : undefined,
    listQuotesForCustomer(customer.id),
    listInvoicesForCustomer(customer.id),
    listProjectsForCustomer(customer.id),
    listPaymentsForCustomer(customer.id),
    listRecurringServicesForCustomer(customer.id),
    listPrenotificationsForCustomer(customer.id),
    listCommunicationsForCustomer(customer.id),
    directDebitView(customer.id),
    listPriceChangesOfCustomer(customer.id),
  ]);

  const todayKey = toDateKey(new Date());
  // Read from the financial data itself, every time the page renders.
  /*
    The next collection per service, worked out from the service's anchor and
    the periods its invoices already cover. No second calendar is consulted.
  */
  const billedPeriodStarts = (serviceId: string) =>
    invoices
      .filter((invoice) => invoice.recurringServiceId === serviceId && invoice.billingPeriodStart)
      .map((invoice) => invoice.billingPeriodStart!);
  const changesOf = (serviceId: string) => priceChanges.filter((change) => change.recurringServiceId === serviceId);

  const recurringOverviews: Record<string, RecurringOverview> = Object.fromEntries(
    recurringServices.map((service) => [
      service.id,
      recurringOverview(
        { service, billedPeriodStarts: billedPeriodStarts(service.id), priceChanges: changesOf(service.id) },
        prenotifications,
        todayKey,
      ),
    ]),
  );

  /*
    What the admin may do with each service -- change its price, end it, take
    either back -- and what each would mean, worked out here from the same
    facts, so the screen can only offer what the actions will accept.
  */
  const recurringManagements: Record<string, RecurringManagement> = Object.fromEntries(
    recurringServices.map((service) => [
      service.id,
      recurringManagement({
        service,
        priceChanges: changesOf(service.id),
        billedPeriodStarts: billedPeriodStarts(service.id),
        overview: recurringOverviews[service.id]!,
        todayKey,
      }),
    ]),
  );

  /*
    For every service that does not collect yet: the earliest first collection,
    from the same rule the start action applies -- after every billed period,
    and far enough ahead to be announced.
  */
  const firstCollections: Record<string, string> = Object.fromEntries(
    recurringServices
      .filter((service) => !service.mollie.subscriptionId && service.status !== "canceled")
      .map((service) => [
        service.id,
        firstCollectionDate({
          ...(service.startsOn ? { startsOn: service.startsOn } : {}),
          billedPeriodStarts: invoices
            .filter((invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart)
            .map((invoice) => invoice.billingPeriodStart!),
          todayKey,
        }),
      ]),
  );

  // The invoices and payments read above are this customer's already, so
  // there is nothing left to filter out here.
  const financials = customerFinancials(invoices, payments, todayKey);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Klant · ${customer.id}`}
        title={customer.companyName}
        meta={
          <>
            <StatusBadge tone={customerStatusTone[customer.status]}>{customerStatusLabels[customer.status]}</StatusBadge>
            <StatusBadge tone={customerPaymentStatusTone[financials.status]}>
              {customerPaymentStatusLabels[financials.status]}
            </StatusBadge>
            {financials.outstandingCents > 0 ? (
              <span className="tabular text-[0.85rem] text-muted">{formatCents(financials.outstandingCents)} openstaand</span>
            ) : null}
          </>
        }
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
        projects={projects}
        communications={communications}
        financials={financials}
        recurringServices={recurringServices}
        recurringOverviews={recurringOverviews}
        recurringManagements={recurringManagements}
        directDebit={directDebit}
        firstCollections={firstCollections}
        todayKey={todayKey}
      />
    </div>
  );
}
