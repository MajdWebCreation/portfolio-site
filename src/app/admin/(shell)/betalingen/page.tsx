import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import StatusBadge from "@/components/admin/status-badge";
import CollectionFollowUp, { type FollowUpRow } from "@/components/admin/payments/collection-follow-up";
import CustomerBalances, { type CustomerBalance } from "@/components/admin/payments/customer-balances";
import MollieCheck from "@/components/admin/payments/mollie-check";
import PaymentsList from "@/components/admin/payments/payments-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { mollieMode } from "@/lib/mollie/config";
import { toDateKey } from "@/lib/admin/format";
import { listInvoices } from "@/lib/admin/invoices/repository";
import { customerFinancials } from "@/lib/payments/customer-status";
import { prenotificationStateLabels, prenotificationStateTone, recurringOverview } from "@/lib/payments/prenotification";
import { listCollectionEvents, listCollectionStates } from "@/lib/payments/collection-repository";
import { invoiceCollectionViews } from "@/lib/payments/collection-state";
import { listPayments, listPrenotifications, listRecurringServices } from "@/lib/payments/repository";
import { isCollecting, recurringStatusLabels, recurringStatusTone } from "@/lib/payments/types";
import { formatDate } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Betalingen" };

export default async function PaymentsPage() {
  await requireAdminAccess();

  const [customers, invoices, payments, services, prenotifications, collectionEvents, collectionStates] =
    await Promise.all([
      listCustomers(),
      listInvoices(),
      listPayments(),
      listRecurringServices(),
      listPrenotifications(),
      listCollectionEvents(),
      listCollectionStates(),
    ]);

  const todayKey = toDateKey(new Date());

  // Derived here and nowhere stored: the invoices and the payments are the
  // truth, and this is a reading of them.
  const balances: CustomerBalance[] = customers.map((customer) => ({
    customer,
    financials: customerFinancials(
      invoices.filter((invoice) => invoice.customer.customerId === customer.id),
      payments.filter((payment) => payment.customerId === customer.id),
      todayKey,
    ),
  }));

  const outstanding = balances.reduce((sum, item) => sum + item.financials.outstandingCents, 0);
  const overdue = balances.reduce((sum, item) => sum + item.financials.overdueCents, 0);
  const collecting = services.filter(isCollecting);
  const monthly = collecting.reduce((sum, service) => sum + service.amountCents, 0);
  const byCustomer = new Map(customers.map((customer) => [customer.id, customer.companyName]));

  /*
    What is coming, and whether the customer has been told. Derived here the
    same way the customer page derives it, from the same two facts.
  */
  const upcoming = collecting
    .map((service) => ({
      service,
      overview: recurringOverview(
        {
          service,
          billedPeriodStarts: invoices
            .filter((invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart)
            .map((invoice) => invoice.billingPeriodStart!),
        },
        prenotifications,
        todayKey,
      ),
    }))
    .filter((row) => Boolean(row.overview.debitOn))
    .sort((a, b) => (a.overview.debitOn ?? "").localeCompare(b.overview.debitOn ?? ""));

  const needsAnnouncing = upcoming.filter((row) => row.overview.state === "due" || row.overview.state === "failed").length;

  /*
    Which invoices are being chased, read the same way the daily job reads
    them. Only invoices that are actually late appear; the ones the automation
    has run out on come first, because those are the rows that need a person.
  */
  const followUp: FollowUpRow[] = invoiceCollectionViews({
    invoices,
    payments,
    events: collectionEvents,
    states: collectionStates,
    collectingServiceIds: new Set(collecting.map((service) => service.id)),
    todayKey,
  })
    .filter((row) => row.view.daysOverdue > 0 && row.view.outstandingCents > 0 && row.view.automation !== "inactive")
    .sort(
      (a, b) =>
        Number(b.view.collectionReady) - Number(a.view.collectionReady) ||
        b.view.daysOverdue - a.view.daysOverdue,
    );
  const readyForCollection = followUp.filter((row) => row.view.collectionReady).length;
  const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

  return (
    <div className="space-y-10">
      <AdminPageHeader
        title="Betalingen"
        text={`${formatCents(outstanding)} openstaand${overdue > 0 ? `, waarvan ${formatCents(overdue)} achterstallig` : ""}.`}
      />

      <AdminSection id="balances" title="Openstaand per klant">
        <CustomerBalances balances={balances} />
      </AdminSection>

      <AdminSection
        id="recurring"
        title="Terugkerende diensten"
        note={collecting.length > 0 ? `${formatCents(monthly)} per maand, excl. btw` : undefined}
      >
        {services.length === 0 ? (
          <p className="text-[0.95rem] text-muted">Nog geen terugkerende diensten. Je maakt ze aan bij een klant.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {services.map((service) => (
              <li key={service.id} className="flex items-center justify-between gap-3 py-2.5 text-[0.92rem]">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{service.name}</span>
                  <span className="block text-[0.83rem] text-muted">
                    {byCustomer.get(service.customerId) ?? "Onbekende klant"} · {formatCents(service.amountCents)} per maand, excl. btw
                  </span>
                </span>
                <StatusBadge tone={recurringStatusTone[service.status]}>{recurringStatusLabels[service.status]}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        id="upcoming"
        title="Aankomende incasso's"
        note={needsAnnouncing > 0 ? `${needsAnnouncing} vragen een vooraankondiging` : undefined}
      >
        {upcoming.length === 0 ? (
          <p className="text-[0.95rem] text-muted">Geen lopende incasso&apos;s.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {upcoming.map(({ service, overview }) => (
              <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[0.92rem]">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{service.name}</span>
                  <span className="block text-[0.83rem] text-muted">
                    {byCustomer.get(service.customerId) ?? "Onbekende klant"} · {day(overview.debitOn!)} ·{" "}
                    {formatCents(overview.amountCents!)} incl. btw
                  </span>
                </span>
                <StatusBadge tone={prenotificationStateTone[overview.state]}>
                  {prenotificationStateLabels[overview.state]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        id="follow-up"
        title="Betalingsopvolging"
        note={readyForCollection > 0 ? `${readyForCollection} incasso gereed` : "Automatische herinneringen"}
      >
        <CollectionFollowUp rows={followUp} />
      </AdminSection>

      <AdminSection id="payments" title="Betalingen">
        <PaymentsList payments={payments} customers={customers} />
      </AdminSection>

      {/* The key itself never leaves the server; only which mode it is in. */}
      <AdminSection id="mollie" title="Mollie-koppeling">
        <MollieCheck mode={mollieMode()} />
      </AdminSection>
    </div>
  );
}
