import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import StatusBadge from "@/components/admin/status-badge";
import CustomerBalances, { type CustomerBalance } from "@/components/admin/payments/customer-balances";
import PaymentsList from "@/components/admin/payments/payments-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listInvoices } from "@/lib/admin/invoices/repository";
import { customerFinancials } from "@/lib/payments/customer-status";
import { listPayments, listRecurringServices } from "@/lib/payments/repository";
import { isCollecting, recurringStatusLabels, recurringStatusTone } from "@/lib/payments/types";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Betalingen" };

export default async function PaymentsPage() {
  await requireAdminAccess();

  const [customers, invoices, payments, services] = await Promise.all([
    listCustomers(),
    listInvoices(),
    listPayments(),
    listRecurringServices(),
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

      <AdminSection id="payments" title="Betalingen">
        <PaymentsList payments={payments} customers={customers} />
      </AdminSection>
    </div>
  );
}
