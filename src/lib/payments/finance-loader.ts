import { listCreditNotes, listRefunds } from "@/lib/admin/credit-notes/repository";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listInvoices } from "@/lib/admin/invoices/repository";
import { listCollectionEvents, listCollectionStates } from "@/lib/payments/collection-repository";
import { invoiceCollectionViews } from "@/lib/payments/collection-state";
import { financeOverview, type FinanceOverview } from "@/lib/payments/finance-overview";
import { listPayments, listPrenotifications, listPriceChangesOfServices, listRecurringServices } from "@/lib/payments/repository";
import { isCollecting } from "@/lib/payments/types";
import type { Customer } from "@/lib/admin/customers/types";

/**
 * Everything the payments page needs, read once and handed to the pure
 * builder. The reads are the same ones the dashboard and the customer page
 * do; this is the one place they are combined for the finance screens.
 */
export async function loadFinanceOverview(customerId?: string): Promise<{ overview: FinanceOverview; customers: Customer[]; todayKey: string }> {
  const [customers, invoices, payments, creditNotes, refunds, services, prenotifications, collectionEvents, collectionStates] = await Promise.all([
    listCustomers(),
    listInvoices(),
    listPayments(),
    listCreditNotes(),
    listRefunds(),
    listRecurringServices(),
    listPrenotifications(),
    listCollectionEvents(),
    listCollectionStates(),
  ]);
  const priceChanges = await listPriceChangesOfServices(services.map((service) => service.id));
  const todayKey = toDateKey(new Date());

  const collectionViews = new Map(
    invoiceCollectionViews({
      invoices,
      payments,
      events: collectionEvents,
      states: collectionStates,
      collectingServiceIds: new Set(services.filter(isCollecting).map((service) => service.id)),
      todayKey,
    }).map((row) => [row.invoice.id, row.view]),
  );

  const overview = financeOverview({
    customers,
    invoices,
    payments,
    creditNotes,
    refunds,
    services,
    prenotifications,
    priceChanges,
    collectionViews,
    todayKey,
    ...(customerId ? { customerId } : {}),
  });
  return { overview, customers, todayKey };
}
