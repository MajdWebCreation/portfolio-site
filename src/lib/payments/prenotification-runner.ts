import type { Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals } from "@/lib/money";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import { isAnnounceable, nextDebitSchedule, type ServiceSchedule } from "@/lib/payments/prenotification";
import type { RecurringService } from "@/lib/payments/types";

/**
 * The daily pass, in two halves.
 *
 * First: for every service collecting money, if the next collection is within
 * fourteen days, make sure the invoice for that period exists. One invoice per
 * period, with a real YM-F number, because a monthly term is a business
 * invoice and the customer needs it for their VAT.
 *
 * Then: every recurring invoice that has not been mailed yet goes out, PDF
 * attached. That mail is the SEPA pre-notification -- there is no second one.
 * It also catches the first term, which the activation created and paid
 * before any announcement was due, so every term reaches the customer as a
 * document exactly once.
 *
 * Written against injected dependencies, so the decisions are testable
 * without a database, a scheduler, a renderer or a mail provider.
 */
export type PrenotificationClaim = {
  id: string;
  status: "pending" | "sent" | "failed";
  /** ISO timestamp of when this attempt took the row. */
  claimedAt: string;
};

export type ClaimKey = {
  invoiceId: string;
  serviceId: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  debitOn: string;
  amountCents: number;
  recipientEmail: string;
};

/** An invoice waiting to be mailed, with the service it bills. */
export type PendingInvoice = {
  invoice: Invoice;
  service: RecurringService;
};

export type PrenotificationStore = {
  listSchedules: () => Promise<ServiceSchedule[]>;
  /** Creates the invoice for a period, or returns the one that exists. */
  ensureInvoice: (service: RecurringService, period: BillingPeriod) => Promise<Invoice>;
  /**
   * Recurring invoices of collecting services that were never mailed and are
   * not yet paid. A term the customer paid themselves is mailed by the
   * activation flow and is not a pre-notification, so it never appears here.
   */
  listUnsentInvoices: () => Promise<PendingInvoice[]>;
  customerContact: (customerId: string) => Promise<{ contactName: string; email: string } | undefined>;
  /**
   * Takes the announcement, or reports the one that already exists. The
   * uniqueness is the database's, not this function's.
   */
  claim: (key: ClaimKey) => Promise<{ claimed: true; id: string } | { claimed: false; existing: PrenotificationClaim }>;
  /** Records the announcement and marks the invoice as mailed, together. */
  markSent: (input: { claimId: string; invoiceId: string; recipientEmail: string; sentAt: string; messageId?: string }) => Promise<void>;
  markFailed: (id: string, reason: string) => Promise<void>;
};

export type InvoiceMailInput = {
  invoice: Invoice;
  serviceName: string;
  /** YYYY-MM-DD, the day the subscription will collect this term. */
  debitOn: string;
  recipientEmail: string;
  contactName: string;
  pdf: Uint8Array;
};

export type InvoiceMailer = (
  input: InvoiceMailInput,
) => Promise<{ sent: true; sentAt: string; messageId?: string } | { sent: false; reason: string }>;

export type PdfRenderer = (invoice: Invoice) => Promise<Uint8Array>;

/** Something an admin has to look at, rather than a normal skip. */
export type PrenotificationProblem = { serviceId: string; reason: string };

export type PrenotificationSummary = {
  considered: number;
  invoicesCreated: number;
  announced: number;
  skipped: number;
  failed: number;
  problems: PrenotificationProblem[];
};

/**
 * A claim left `pending` by a run that died is retried after this long. Short
 * enough that a crash does not cost a customer their invoice, long enough
 * that two runs minutes apart never both send.
 */
export const stalePendingMs = 60 * 60 * 1000;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function retryable(existing: PrenotificationClaim, now: number): boolean {
  if (existing.status === "sent") return false;
  if (existing.status === "failed") return true;
  return now - new Date(existing.claimedAt).getTime() > stalePendingMs;
}

export async function runPrenotifications(
  store: PrenotificationStore,
  render: PdfRenderer,
  mail: InvoiceMailer,
  todayKey: string,
  now: Date = new Date(),
): Promise<PrenotificationSummary> {
  const summary: PrenotificationSummary = {
    considered: 0,
    invoicesCreated: 0,
    announced: 0,
    skipped: 0,
    failed: 0,
    problems: [],
  };

  // ---- 1. make sure the invoice exists for a collection coming up ----
  for (const entry of await store.listSchedules()) {
    summary.considered += 1;
    const schedule = nextDebitSchedule(entry);

    if ("reason" in schedule) {
      // A paused service or one without a subscription collects nothing. A
      // missing anchor is a broken record and is reported.
      if (schedule.reason === "missing_anchor") {
        summary.problems.push({ serviceId: entry.service.id, reason: "Geen startdatum; incassodatum niet te bepalen." });
      }
      continue;
    }

    if (!isAnnounceable(schedule, todayKey)) continue;

    try {
      const before = entry.billedPeriodStarts.includes(schedule.period.start);
      await store.ensureInvoice(entry.service as RecurringService, schedule.period);
      if (!before) summary.invoicesCreated += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "onbekende fout";
      summary.problems.push({ serviceId: entry.service.id, reason: `Factuur aanmaken mislukt: ${reason}` });
    }
  }

  // ---- 2. announce every coming collection that has not gone out ----
  for (const { invoice, service } of await store.listUnsentInvoices()) {
    /*
      A term that is already paid was settled by the customer in the
      activation flow, and the webhook mailed it as a paid invoice. It is not
      a pre-notification and must never become one, whatever a listing hands
      over.
    */
    if (invoice.status === "paid") {
      summary.skipped += 1;
      continue;
    }

    if (!invoice.billingPeriodStart || !invoice.billingPeriodEnd) {
      summary.problems.push({ serviceId: service.id, reason: "Factuur zonder periode; niet te versturen." });
      summary.skipped += 1;
      continue;
    }

    const contact = await store.customerContact(service.customerId);
    if (!contact || !contact.email.trim() || !isEmail(contact.email.trim())) {
      // Never guess an address, and never announce to nobody.
      summary.problems.push({ serviceId: service.id, reason: "Klant heeft geen bruikbaar e-mailadres." });
      summary.skipped += 1;
      continue;
    }

    // The figures come from the invoice's own lines, the single source for
    // net, VAT and gross across the whole system.
    const amountCents = calculateTotals(invoice.lines).totalCents;
    const debitOn = invoice.dueDate;
    const key: ClaimKey = {
      invoiceId: invoice.id,
      serviceId: service.id,
      customerId: service.customerId,
      periodStart: invoice.billingPeriodStart,
      periodEnd: invoice.billingPeriodEnd,
      debitOn,
      amountCents,
      recipientEmail: contact.email.trim(),
    };

    const claim = await store.claim(key);
    let recordId: string;

    if (claim.claimed) {
      recordId = claim.id;
    } else if (retryable(claim.existing, now.getTime())) {
      recordId = claim.existing.id;
    } else {
      // Already sent, or another run has it in hand right now.
      summary.skipped += 1;
      continue;
    }

    let result: Awaited<ReturnType<InvoiceMailer>>;
    try {
      const pdf = await render(invoice);
      result = await mail({
        invoice,
        serviceName: service.name,
        debitOn,
        recipientEmail: key.recipientEmail,
        contactName: contact.contactName,
        pdf,
      });
    } catch (error) {
      result = { sent: false, reason: error instanceof Error ? error.message : "onbekende fout" };
    }

    if (result.sent) {
      await store.markSent({
        claimId: recordId,
        invoiceId: invoice.id,
        recipientEmail: key.recipientEmail,
        sentAt: result.sentAt,
        ...(result.messageId ? { messageId: result.messageId } : {}),
      });
      summary.announced += 1;
    } else {
      // The row stays, marked failed, so tomorrow's run retries it rather
      // than the customer silently never getting their invoice. The invoice
      // is not marked as sent, because it was not.
      await store.markFailed(recordId, result.reason);
      summary.failed += 1;
      summary.problems.push({ serviceId: service.id, reason: `Verzenden mislukt: ${result.reason}` });
    }
  }

  return summary;
}
