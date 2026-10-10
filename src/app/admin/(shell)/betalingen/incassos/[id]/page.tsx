import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import CustomerRecurring from "@/components/admin/customers/customer-recurring";
import StatusBadge from "@/components/admin/status-badge";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCreditNotesForCustomer, listRefundsForCustomer } from "@/lib/admin/credit-notes/repository";
import { creditNoteLedger } from "@/lib/admin/credit-notes/settlement";
import { formatDate, formatDateTime, toDateKey } from "@/lib/admin/format";
import { listInvoicesForRecurringService } from "@/lib/admin/invoices/repository";
import { invoiceStatusLabels, invoiceStatusTone } from "@/lib/admin/invoices/types";
import { readCustomer } from "@/lib/admin/readers";
import { calculateTotals, formatCents } from "@/lib/money";
import { firstCollectionDate } from "@/lib/payments/collection-start";
import { directDebitView } from "@/lib/payments/direct-debit-view";
import { recurringOverview } from "@/lib/payments/prenotification";
import { recurringManagement } from "@/lib/payments/recurring-management";
import { getRecurringService, listPaymentsForCustomer, listPrenotificationsForCustomer, listPriceChangesOfCustomer } from "@/lib/payments/repository";
import { paymentSourceLabels, paymentStatusLabels, paymentStatusTone, recurringLifecycleLabel, recurringLifecycleTone } from "@/lib/payments/types";

type PageProps = { params: Promise<{ id: string }> };

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const service = await getRecurringService(id);
  return { title: service ? `${service.name} · Incasso's` : "Incasso" };
}

/**
 * One monthly service, from the money side: its subscription, its terms,
 * its price history, its end. The management panel is the customer page's
 * own component, so there is one set of actions and one set of rules.
 */
export default async function CollectionPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const service = await getRecurringService(id);
  if (!service) notFound();

  const [customer, invoices, payments, prenotifications, priceChanges, directDebit, creditNotes, refunds] = await Promise.all([
    readCustomer(service.customerId),
    listInvoicesForRecurringService(service.id),
    listPaymentsForCustomer(service.customerId),
    listPrenotificationsForCustomer(service.customerId),
    listPriceChangesOfCustomer(service.customerId),
    directDebitView(service.customerId),
    listCreditNotesForCustomer(service.customerId),
    listRefundsForCustomer(service.customerId),
  ]);
  if (!customer) notFound();

  const todayKey = toDateKey(new Date());
  const billedPeriodStarts = invoices.flatMap((invoice) => (invoice.billingPeriodStart ? [invoice.billingPeriodStart] : []));
  const changes = priceChanges.filter((change) => change.recurringServiceId === service.id);
  const overview = recurringOverview({ service, billedPeriodStarts, priceChanges: changes }, prenotifications, todayKey);

  const cancellationNote = creditNotes.find((note) => note.source === "cancellation_credit" && note.recurringServiceId === service.id);
  const noteInvoice = cancellationNote ? invoices.find((invoice) => invoice.id === cancellationNote.invoiceId) : undefined;
  const cancellationCreditNote =
    cancellationNote && noteInvoice
      ? (() => {
          const ledger = creditNoteLedger(cancellationNote, {
            invoice: noteInvoice,
            payments: payments.filter((payment) => payment.invoiceId === noteInvoice.id),
            creditNotes: creditNotes.filter((note) => note.invoiceId === noteInvoice.id),
            refunds: refunds.filter((refund) => refund.invoiceId === noteInvoice.id),
          });
          return { id: cancellationNote.id, number: cancellationNote.number.value, state: ledger.state, remainingCents: ledger.remainingCents };
        })()
      : undefined;

  const management = recurringManagement({
    service,
    priceChanges: changes,
    billedPeriodStarts,
    overview,
    todayKey,
    ...(cancellationCreditNote ? { cancellationCreditNote } : {}),
  });
  const firstCollection =
    !service.mollie.subscriptionId && service.status !== "canceled"
      ? firstCollectionDate({ ...(service.startsOn ? { startsOn: service.startsOn } : {}), billedPeriodStarts, todayKey })
      : undefined;

  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const servicePayments = payments.filter((payment) => invoiceIds.has(payment.invoiceId)).sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt));
  const terms = [...invoices].sort((a, b) => (b.billingPeriodStart ?? "").localeCompare(a.billingPeriodStart ?? ""));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Incasso · ${customer.companyName}`}
        title={service.name}
        meta={
          <>
            <StatusBadge tone={recurringLifecycleTone(service, todayKey)}>{recurringLifecycleLabel(service, todayKey, day)}</StatusBadge>
            <span className="tabular text-[0.85rem] text-muted">
              {formatCents(management.currentNetCents)} excl. · {formatCents(management.currentGrossCents)} incl. btw per maand
            </span>
          </>
        }
        text={service.mollie.subscriptionId ? `Mollie-abonnement ${service.mollie.subscriptionId}` : "Nog geen abonnement bij Mollie"}
        actions={
          <>
            <Link href={`/admin/klanten/${customer.id}`} className="link-static text-[0.92rem] text-ink">
              Naar klant
            </Link>
            <Link href="/admin/betalingen?tab=incassos" className="link-static text-[0.92rem] text-ink">
              Alle incasso&apos;s
            </Link>
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <div className="space-y-10">
          <AdminSection id="terms" title="Termijnen" note="Elke maandfactuur van deze dienst">
            {terms.length === 0 ? (
              <p className="text-[0.95rem] text-muted">Nog geen termijn gefactureerd.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Periode</th>
                    <th scope="col">Factuur</th>
                    <th scope="col">Incassodatum</th>
                    <th scope="col" className="adm-num">Bedrag</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="adm-primary" data-label="Periode">
                        {invoice.billingPeriodStart ? `${day(invoice.billingPeriodStart)} t/m ${day(invoice.billingPeriodEnd!)}` : "—"}
                      </td>
                      <td data-label="Factuur">
                        <Link href={`/admin/facturen/${invoice.id}`} className="link-static">
                          {invoice.number.value}
                        </Link>
                      </td>
                      <td data-label="Incassodatum">{day(invoice.dueDate)}</td>
                      <td data-label="Bedrag" className="adm-num">
                        {formatCents(calculateTotals(invoice.lines).totalCents)}
                        {invoice.creditedCents ? <span className="block text-[0.78rem] text-muted">−{formatCents(invoice.creditedCents)} gecrediteerd</span> : null}
                      </td>
                      <td data-label="Status">
                        <StatusBadge tone={invoiceStatusTone[invoice.status]}>{invoiceStatusLabels[invoice.status]}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminSection>

          <AdminSection id="payments" title="Betalingen" note="Wat Mollie voor deze dienst incasseerde">
            {servicePayments.length === 0 ? (
              <p className="text-[0.95rem] text-muted">Nog geen betaling ontvangen.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {servicePayments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[0.9rem]">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">
                        {formatCents(payment.amountCents)} · {paymentSourceLabels[payment.source]}
                      </span>
                      <span className="block text-[0.82rem] text-muted">
                        {formatDateTime(payment.paidAt ?? payment.createdAt)}
                        {payment.providerPaymentId ? ` · ${payment.providerPaymentId}` : ""}
                      </span>
                    </span>
                    <StatusBadge tone={paymentStatusTone[payment.status]}>{paymentStatusLabels[payment.status]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>

        <aside className="lg:border-l lg:border-line lg:pl-8">
          <CustomerRecurring
            customerId={customer.id}
            services={[service]}
            overviews={{ [service.id]: overview }}
            managements={{ [service.id]: management }}
            directDebit={directDebit}
            firstCollections={firstCollection ? { [service.id]: firstCollection } : {}}
            todayKey={todayKey}
            allowAdding={false}
          />
        </aside>
      </div>
    </div>
  );
}
