import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import CustomerDetail from "@/components/admin/customers/customer-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { getCustomer } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { getInquiry } from "@/lib/admin/inquiries/repository";
import { listInvoices } from "@/lib/admin/invoices/repository";
import { getLead } from "@/lib/admin/leads/repository";
import { listProjectsForCustomer } from "@/lib/admin/projects/repository";
import { listQuotes } from "@/lib/admin/quotes/repository";
import { activationSummaries } from "@/lib/payments/activation-view";
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

  const [sourceInquiry, sourceLead, quotes, invoices, projects, payments, recurringServices, prenotifications] =
    await Promise.all([
      customer.sourceInquiryId ? getInquiry(customer.sourceInquiryId) : undefined,
      customer.sourceLeadId ? getLead(customer.sourceLeadId) : undefined,
      listQuotes(),
      listInvoices(),
      listProjectsForCustomer(customer.id),
      listPaymentsForCustomer(customer.id),
      listRecurringServicesForCustomer(customer.id),
      listPrenotificationsForCustomer(customer.id),
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

  const activations = await activationSummaries(recurringServices);

  const financials = customerFinancials(
    invoices.filter((invoice) => invoice.customer.customerId === customer.id),
    payments,
    todayKey,
  );

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
        financials={financials}
        recurringServices={recurringServices}
        recurringOverviews={recurringOverviews}
        recurringActivations={activations}
        todayKey={todayKey}
      />
    </div>
  );
}
