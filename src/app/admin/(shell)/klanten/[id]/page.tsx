import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import CustomerDetail from "@/components/admin/customers/customer-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCommunicationsForCustomer } from "@/lib/admin/communications/repository";
import { toDateKey } from "@/lib/admin/format";
import { listInvoicesForCustomer } from "@/lib/admin/invoices/repository";
import { listProjectsForCustomer } from "@/lib/admin/projects/repository";
import { listQuotesForCustomer } from "@/lib/admin/quotes/repository";
import { readCustomer, readInquiry, readLead } from "@/lib/admin/readers";
import { activationSummaries, mandateByCustomer } from "@/lib/payments/activation-view";
import { customerFinancials } from "@/lib/payments/customer-status";
import { recurringOverview, type RecurringOverview } from "@/lib/payments/prenotification";
import {
  listPaymentsForCustomer,
  listPrenotificationsForCustomer,
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
    mandates,
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
    mandateByCustomer([customer.id]),
  ]);

  const todayKey = toDateKey(new Date());
  // Read from the financial data itself, every time the page renders.
  /*
    The next collection per service, worked out from the service's anchor and
    the periods its invoices already cover. No second calendar is consulted.
  */
  const recurringOverviews: Record<string, RecurringOverview> = Object.fromEntries(
    recurringServices.map((service) => [
      service.id,
      recurringOverview(
        {
          service,
          billedPeriodStarts: invoices
            .filter((invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart)
            .map((invoice) => invoice.billingPeriodStart!),
        },
        prenotifications,
        toDateKey(new Date()),
      ),
    ]),
  );

  // The customer's own invoices include every activation invoice its services
  // can name, and the mandates were read above: no further round trip.
  const activations = await activationSummaries(recurringServices, { customerIds: [customer.id], mandates, invoices });

  // The invoices and payments read above are this customer's already, so
  // there is nothing left to filter out here.
  const financials = customerFinancials(invoices, payments, todayKey);

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
        projects={projects}
        communications={communications}
        financials={financials}
        recurringServices={recurringServices}
        recurringOverviews={recurringOverviews}
        recurringActivations={activations}
        todayKey={todayKey}
      />
    </div>
  );
}
