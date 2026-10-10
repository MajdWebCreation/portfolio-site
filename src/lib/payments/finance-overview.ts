import { creditNoteLedger, invoiceLedger, type CreditNoteLedger, type CreditNoteState } from "@/lib/admin/credit-notes/settlement";
import { isFinanciallyIssued, type CreditNote, type Refund } from "@/lib/admin/credit-notes/types";
import type { Customer } from "@/lib/admin/customers/types";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { Cents } from "@/lib/money";
import { settleInvoice } from "@/lib/payments/settlement";
import type { CollectionView } from "@/lib/payments/collection-state";
import { isChargeable } from "@/lib/payments/customer-status";
import { recurringOverview, type RecurringOverview } from "@/lib/payments/prenotification";
import { recurringManagement, type RecurringManagement } from "@/lib/payments/recurring-management";
import { recurringLifecycle, type DebitPrenotification, type Payment, type PriceChange, type RecurringLifecycle, type RecurringService } from "@/lib/payments/types";

/**
 * Everything the payments page shows, worked out once from the records and
 * handed to the screen as plain rows. Pure, so the tabs can be tested
 * without a database, and so the customer page, the invoice page and this
 * page cannot disagree: they all read the same ledgers.
 *
 * Only figures with a reliable source are produced. "Received this month"
 * is the sum of payments with a paid date in the month; "upcoming
 * collections" are the next collection per collecting service, from the
 * same schedule the daily job announces; nothing is estimated.
 */
export type InvoiceRow = {
  invoice: Invoice;
  customerName: string;
  totalCents: Cents;
  creditedCents: Cents;
  paidCents: Cents;
  outstandingCents: Cents;
  /** Mollie / bank transfer / direct debit, from the payments and the service. */
  methodLabel: string;
  overdue: boolean;
  daysOverdue: number;
  paymentFailed: boolean;
  credited: "none" | "partial" | "full";
};

export type CollectionRow = {
  service: RecurringService;
  customerName: string;
  lifecycle: RecurringLifecycle;
  monthlyNetCents: Cents;
  monthlyGrossCents: Cents;
  overview: RecurringOverview;
  management: RecurringManagement;
  lastPayment?: Payment;
  /** Something the admin has to look at. */
  problem?: string;
  bucket: "active" | "ending" | "problem" | "ended" | "other";
};

export type CreditNoteRow = {
  creditNote: CreditNote;
  customerName: string;
  invoiceNumber: string;
  ledger: CreditNoteLedger;
  /** Mollie / handmatig / none yet, from the refunds. */
  methods: ("mollie" | "manual")[];
  state: CreditNoteState;
  unfinished: boolean;
};

export type AttentionItem = {
  key: string;
  kind: "overdue" | "payment_failed" | "lifecycle" | "credit_open" | "refund_due" | "refund_failed" | "credit_unfinished" | "announce";
  label: string;
  detail: string;
  href: string;
  amountCents?: Cents;
  tone: "danger" | "accent" | "neutral";
};

export type FinanceSummary = {
  outstandingCents: Cents;
  outstandingCount: number;
  overdueCents: Cents;
  overdueCount: number;
  receivedThisMonthCents: Cents;
  receivedThisMonthCount: number;
  upcomingCollections: number;
  upcomingCollectionsCents: Cents;
  failedPayments: number;
  openCreditsCount: number;
  refundDueCents: Cents;
};

export type FinanceOverview = {
  summary: FinanceSummary;
  attention: AttentionItem[];
  invoices: InvoiceRow[];
  collections: CollectionRow[];
  creditNotes: CreditNoteRow[];
};

export type FinanceInput = {
  customers: readonly Customer[];
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  creditNotes: readonly CreditNote[];
  refunds: readonly Refund[];
  services: readonly RecurringService[];
  prenotifications: readonly DebitPrenotification[];
  priceChanges: readonly PriceChange[];
  /** The reminder ladder per invoice, from collection-state. */
  collectionViews: ReadonlyMap<string, CollectionView>;
  todayKey: string;
  /** Narrow everything to one customer. */
  customerId?: string;
};

function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function financeOverview(input: FinanceInput): FinanceOverview {
  const { todayKey } = input;
  const only = <T,>(items: readonly T[], read: (item: T) => string): T[] =>
    input.customerId ? items.filter((item) => read(item) === input.customerId) : [...items];

  const customerName = new Map(input.customers.map((customer) => [customer.id, customer.companyName]));
  const nameOf = (id: string) => customerName.get(id) ?? "Onbekende klant";

  const invoices = only(input.invoices, (invoice) => invoice.customer.customerId);
  const payments = only(input.payments, (payment) => payment.customerId);
  const creditNotes = only(input.creditNotes, (note) => note.customer.customerId);
  const refunds = only(input.refunds, (refund) => refund.customerId);
  const services = only(input.services, (service) => service.customerId);

  // ------------------------------------------------------------ invoices
  const invoiceRows: InvoiceRow[] = invoices
    .filter((invoice) => invoice.status !== "draft")
    .map((invoice): InvoiceRow => {
      const own = payments.filter((payment) => payment.invoiceId === invoice.id);
      const ledger = invoiceLedger({
        invoice,
        payments: own,
        creditNotes: creditNotes.filter((note) => note.invoiceId === invoice.id),
        refunds: refunds.filter((refund) => refund.invoiceId === invoice.id),
      });
      const settlement = settleInvoice(ledger.dueCents, own);
      const chargeable = isChargeable(invoice);
      const outstandingCents = chargeable && invoice.status !== "paid" ? settlement.outstandingCents : 0;
      const view = input.collectionViews.get(invoice.id);
      const service = invoice.recurringServiceId ? services.find((item) => item.id === invoice.recurringServiceId) : undefined;
      const methodLabel = service?.mollie.subscriptionId
        ? "Automatische incasso"
        : own.some((payment) => payment.source === "manual_bank_transfer" && payment.status === "paid")
          ? "Bankoverschrijving"
          : own.some((payment) => payment.source === "mollie")
            ? "Mollie"
            : "—";
      return {
        invoice,
        customerName: nameOf(invoice.customer.customerId),
        totalCents: ledger.totalCents,
        creditedCents: ledger.creditedCents,
        paidCents: ledger.paidCents,
        outstandingCents,
        methodLabel,
        overdue: outstandingCents > 0 && invoice.dueDate < todayKey,
        daysOverdue: view?.daysOverdue ?? 0,
        paymentFailed: chargeable && settlement.failedWithoutRecovery,
        credited: ledger.creditedCents === 0 ? "none" : ledger.creditedCents >= ledger.totalCents ? "full" : "partial",
      };
    })
    .sort((a, b) => b.invoice.issueDate.localeCompare(a.invoice.issueDate) || b.invoice.updatedAt.localeCompare(a.invoice.updatedAt));

  // --------------------------------------------------------- collections
  const billedStarts = (serviceId: string) =>
    invoices.filter((invoice) => invoice.recurringServiceId === serviceId && invoice.billingPeriodStart).map((invoice) => invoice.billingPeriodStart!);
  const changesOf = (serviceId: string) => input.priceChanges.filter((change) => change.recurringServiceId === serviceId);

  const collectionRows: CollectionRow[] = services
    .map((service): CollectionRow => {
      const starts = billedStarts(service.id);
      const changes = changesOf(service.id);
      const overview = recurringOverview({ service, billedPeriodStarts: starts, priceChanges: changes }, input.prenotifications, todayKey);
      const cancellationNote = creditNotes.find((note) => note.source === "cancellation_credit" && note.recurringServiceId === service.id);
      const cancellationCreditNote = cancellationNote
        ? (() => {
            const invoice = invoices.find((item) => item.id === cancellationNote.invoiceId);
            const ledger = invoice
              ? creditNoteLedger(cancellationNote, {
                  invoice,
                  payments: payments.filter((payment) => payment.invoiceId === invoice.id),
                  creditNotes: creditNotes.filter((note) => note.invoiceId === invoice.id),
                  refunds: refunds.filter((refund) => refund.invoiceId === invoice.id),
                })
              : undefined;
            return ledger ? { id: cancellationNote.id, number: cancellationNote.number.value, state: ledger.state, remainingCents: ledger.remainingCents } : undefined;
          })()
        : undefined;
      const management = recurringManagement({
        service,
        priceChanges: changes,
        billedPeriodStarts: starts,
        overview,
        todayKey,
        ...(cancellationCreditNote ? { cancellationCreditNote } : {}),
      });
      const lifecycle = recurringLifecycle(service, todayKey);
      const serviceInvoiceIds = new Set(invoices.filter((invoice) => invoice.recurringServiceId === service.id).map((invoice) => invoice.id));
      const lastPayment = payments
        .filter((payment) => serviceInvoiceIds.has(payment.invoiceId) && payment.status === "paid")
        .sort((a, b) => (a.paidAt ?? a.updatedAt).localeCompare(b.paidAt ?? b.updatedAt))
        .at(-1);
      const problem = management.warning ?? (overview.state === "failed" ? "De vooraankondiging kon niet worden verzonden." : undefined);
      const bucket: CollectionRow["bucket"] = problem
        ? "problem"
        : lifecycle === "cancellation_scheduled"
          ? "ending"
          : lifecycle === "ended"
            ? "ended"
            : lifecycle === "active"
              ? "active"
              : "other";
      return {
        service,
        customerName: nameOf(service.customerId),
        lifecycle,
        monthlyNetCents: management.currentNetCents,
        monthlyGrossCents: management.currentGrossCents,
        overview,
        management,
        ...(lastPayment ? { lastPayment } : {}),
        ...(problem ? { problem } : {}),
        bucket,
      };
    })
    .sort((a, b) => (a.overview.debitOn ?? "9999").localeCompare(b.overview.debitOn ?? "9999") || a.customerName.localeCompare(b.customerName));

  // -------------------------------------------------------- credit notes
  const creditRows: CreditNoteRow[] = creditNotes
    .map((creditNote): CreditNoteRow | undefined => {
      const invoice = invoices.find((item) => item.id === creditNote.invoiceId);
      if (!invoice) return undefined;
      const ledger = creditNoteLedger(creditNote, {
        invoice,
        payments: payments.filter((payment) => payment.invoiceId === invoice.id),
        creditNotes: creditNotes.filter((note) => note.invoiceId === invoice.id),
        refunds: refunds.filter((refund) => refund.invoiceId === invoice.id),
      });
      const own = refunds.filter((refund) => refund.creditNoteId === creditNote.id);
      const methods = [...new Set(own.map((refund) => refund.method))];
      return {
        creditNote,
        customerName: nameOf(creditNote.customer.customerId),
        invoiceNumber: invoice.number.value,
        ledger,
        methods,
        state: ledger.state,
        unfinished: !isFinanciallyIssued(creditNote),
      };
    })
    .filter((row): row is CreditNoteRow => Boolean(row))
    .sort((a, b) => b.creditNote.issueDate.localeCompare(a.creditNote.issueDate) || b.creditNote.createdAt.localeCompare(a.creditNote.createdAt));

  // ------------------------------------------------------------- summary
  const open = invoiceRows.filter((row) => row.outstandingCents > 0);
  const overdue = open.filter((row) => row.overdue);
  const received = payments.filter((payment) => payment.status === "paid" && payment.paidAt && monthOf(payment.paidAt.slice(0, 10)) === monthOf(todayKey));
  const upcoming = collectionRows.filter((row) => row.overview.debitOn && row.overview.amountCents && (row.lifecycle === "active" || row.lifecycle === "cancellation_scheduled"));
  const failed = invoiceRows.filter((row) => row.paymentFailed);
  const openCredits = creditRows.filter((row) => row.state === "refund_due" || row.state === "in_progress" || row.unfinished);
  const refundDueCents = creditRows.reduce((sum, row) => sum + row.ledger.remainingCents, 0);

  const summary: FinanceSummary = {
    outstandingCents: open.reduce((sum, row) => sum + row.outstandingCents, 0),
    outstandingCount: open.length,
    overdueCents: overdue.reduce((sum, row) => sum + row.outstandingCents, 0),
    overdueCount: overdue.length,
    receivedThisMonthCents: received.reduce((sum, payment) => sum + payment.amountCents, 0),
    receivedThisMonthCount: received.length,
    upcomingCollections: upcoming.length,
    upcomingCollectionsCents: upcoming.reduce((sum, row) => sum + (row.overview.amountCents ?? 0), 0),
    failedPayments: failed.length,
    openCreditsCount: openCredits.length,
    refundDueCents,
  };

  // ----------------------------------------------------------- attention
  const attention: AttentionItem[] = [];
  for (const row of failed) {
    attention.push({
      key: `failed-${row.invoice.id}`,
      kind: "payment_failed",
      label: `Betaling mislukt · ${row.invoice.number.value}`,
      detail: `${row.customerName} · nog ${row.outstandingCents > 0 ? "open" : "te controleren"}`,
      href: `/admin/facturen/${row.invoice.id}`,
      amountCents: row.outstandingCents,
      tone: "danger",
    });
  }
  for (const row of overdue.filter((item) => !item.paymentFailed)) {
    attention.push({
      key: `overdue-${row.invoice.id}`,
      kind: "overdue",
      label: `Achterstallig · ${row.invoice.number.value}`,
      detail: `${row.customerName} · ${row.daysOverdue} ${row.daysOverdue === 1 ? "dag" : "dagen"} te laat`,
      href: `/admin/facturen/${row.invoice.id}`,
      amountCents: row.outstandingCents,
      tone: "danger",
    });
  }
  for (const row of collectionRows) {
    const creditDue = row.management.ending?.creditDue;
    const creditOpen = creditDue && !creditDue.creditNote;
    /* What the daily job could not do comes first; an open credit is its own line, never hidden behind it. */
    const problem = row.service.lifecycleProblem ?? (creditOpen ? undefined : row.problem);
    if (problem) {
      attention.push({
        key: `lifecycle-${row.service.id}`,
        kind: "lifecycle",
        label: `Incasso vraagt aandacht · ${row.service.name}`,
        detail: `${row.customerName} · ${problem}`,
        href: `/admin/betalingen/incassos/${row.service.id}`,
        tone: "danger",
      });
    }
    if (creditOpen) {
      attention.push({
        key: `credit-${row.service.id}`,
        kind: "credit_open",
        label: `Te crediteren · ${row.service.name}`,
        detail: `${row.customerName} · ${creditDue.days} dagen na ${row.service.endsOn} zijn te veel geïncasseerd`,
        href: `/admin/betalingen/incassos/${row.service.id}`,
        amountCents: creditDue.grossCents,
        tone: "accent",
      });
    }
  }
  for (const row of creditRows) {
    if (row.unfinished) {
      attention.push({
        key: `unfinished-${row.creditNote.id}`,
        kind: "credit_unfinished",
        label: `Creditnota niet afgerond · ${row.creditNote.number.value}`,
        detail: `${row.customerName} · de PDF is nog niet opgeslagen`,
        href: `/admin/betalingen/creditnotas/${row.creditNote.id}`,
        tone: "danger",
      });
    } else if (row.ledger.lastRefundFailed && row.ledger.remainingCents > 0) {
      attention.push({
        key: `refund-failed-${row.creditNote.id}`,
        kind: "refund_failed",
        label: `Refund mislukt · ${row.creditNote.number.value}`,
        detail: `${row.customerName} · factuur ${row.invoiceNumber}`,
        href: `/admin/betalingen/creditnotas/${row.creditNote.id}`,
        amountCents: row.ledger.remainingCents,
        tone: "danger",
      });
    } else if (row.state === "refund_due") {
      attention.push({
        key: `refund-${row.creditNote.id}`,
        kind: "refund_due",
        label: `Nog terug te betalen · ${row.creditNote.number.value}`,
        detail: `${row.customerName} · factuur ${row.invoiceNumber}`,
        href: `/admin/betalingen/creditnotas/${row.creditNote.id}`,
        amountCents: row.ledger.remainingCents,
        tone: "accent",
      });
    }
  }
  for (const row of upcoming.filter((item) => item.overview.state === "due" || item.overview.state === "failed")) {
    attention.push({
      key: `announce-${row.service.id}`,
      kind: "announce",
      label: `Vooraankondiging ${row.overview.state === "failed" ? "mislukt" : "nodig"} · ${row.service.name}`,
      detail: `${row.customerName} · incasso ${row.overview.debitOn}`,
      href: `/admin/betalingen/incassos/${row.service.id}`,
      amountCents: row.overview.amountCents!,
      tone: row.overview.state === "failed" ? "danger" : "accent",
    });
  }

  return { summary, attention, invoices: invoiceRows, collections: collectionRows, creditNotes: creditRows };
}

/** The next collections, soonest first, for the overview tab. */
export function upcomingCollections(rows: readonly CollectionRow[]): CollectionRow[] {
  return rows
    .filter((row) => row.overview.debitOn && (row.lifecycle === "active" || row.lifecycle === "cancellation_scheduled"))
    .sort((a, b) => a.overview.debitOn!.localeCompare(b.overview.debitOn!));
}
