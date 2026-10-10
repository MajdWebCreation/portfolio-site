import type { CreditNoteDraft } from "@/lib/admin/credit-notes/issue";
import { addDays } from "@/lib/admin/documents/validation";
import type { Invoice } from "@/lib/admin/invoices/types";
import { periodForCharge } from "@/lib/payments/billing-period";
import { amountForPeriod, grossOf, lastTermOf, proratedNetCents, type LastTerm } from "@/lib/payments/pricing";
import type { PriceChange, RecurringService } from "@/lib/payments/types";

/**
 * The credit a cancelled monthly service owes its customer, and the credit
 * note that settles it.
 *
 * One computation. `cancellationPlan` previews it when the end is chosen,
 * `recurringManagement` shows it afterwards, and the credit note is built
 * from it here -- all three through `lastTermCredit`, so the amount the
 * admin was shown is the amount the document says. The arithmetic is the
 * lifecycle's own: the period's price off the price history, the days
 * delivered off the billing calendar, the pro-rata amount rounded once, the
 * VAT through calculateTotals.
 */
export type LastTermCredit = {
  lastTerm: LastTerm;
  /** The period's full net price, which was announced and collected. */
  fullNetCents: number;
  /** What the delivered days are worth. */
  proratedNetCents: number;
  /** Undelivered days, and what they are worth. */
  days: number;
  netCents: number;
  /** The credit note's total: VAT over the credited net, as the document computes it. */
  grossCents: number;
};

/**
 * Owed back when the full last term was announced or collected before the
 * end was known. `collectsFull` is that fact: the last period's invoice
 * exists at the full amount, or Mollie settled on the full amount.
 */
export function lastTermCredit(input: {
  service: Pick<RecurringService, "amountCents" | "vatRate" | "startsOn" | "endsOn" | "lastTerm">;
  priceChanges: readonly PriceChange[];
  billedPeriodStarts: readonly string[];
}): LastTermCredit | undefined {
  const { service } = input;
  if (!service.startsOn || !service.endsOn) return undefined;
  const lastPeriod = periodForCharge(service.startsOn, service.endsOn);
  const lastTerm = lastTermOf(lastPeriod, service.endsOn);
  if (!lastTerm.partial) return undefined;
  const fullNet = amountForPeriod(service, input.priceChanges, lastPeriod.start);
  const prorated = proratedNetCents(fullNet, lastTerm);
  const collectsFull = service.lastTerm ? service.lastTerm.amountCents === fullNet : input.billedPeriodStarts.includes(lastPeriod.start);
  const netCents = collectsFull ? fullNet - prorated : 0;
  if (netCents <= 0) return undefined;
  return {
    lastTerm,
    fullNetCents: fullNet,
    proratedNetCents: prorated,
    days: lastTerm.periodDays - lastTerm.daysUsed,
    netCents,
    grossCents: grossOf(netCents, service.vatRate),
  };
}

/** The invoice of the last term: the one that billed the period the end falls in. */
export function lastTermInvoice(
  service: Pick<RecurringService, "id" | "startsOn" | "endsOn">,
  invoices: readonly Invoice[],
): Invoice | undefined {
  if (!service.startsOn || !service.endsOn) return undefined;
  const start = periodForCharge(service.startsOn, service.endsOn).start;
  return invoices.find((invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart === start);
}

/** What the credit note says: one line, worded so the customer can check it against the invoice. */
export function cancellationCreditDescription(serviceName: string, credit: LastTermCredit, endsOn: string): string {
  const { lastTerm } = credit;
  return (
    `${serviceName}: ${credit.days} niet geleverde ${credit.days === 1 ? "dag" : "dagen"} ` +
    `(${addDays(endsOn, 1)} t/m ${lastTerm.period.end}) van de termijn ${lastTerm.period.start} t/m ${lastTerm.period.end}, ` +
    `${lastTerm.daysUsed} van ${lastTerm.periodDays} dagen geleverd`
  );
}

export function cancellationCreditDraft(input: {
  service: Pick<RecurringService, "id" | "name" | "vatRate" | "endsOn">;
  invoice: Pick<Invoice, "id">;
  credit: LastTermCredit;
  issueDate: string;
}): CreditNoteDraft {
  const { service, credit } = input;
  return {
    invoiceId: input.invoice.id,
    reason: `Opzegging ${service.name}: dienst beëindigd op ${service.endsOn}, ${credit.days} dagen van de laatste termijn niet geleverd`,
    issueDate: input.issueDate,
    lines: [
      {
        description: cancellationCreditDescription(service.name, credit, service.endsOn!),
        quantityHundredths: 100,
        unitPriceCents: credit.netCents,
        vatRate: service.vatRate,
      },
    ],
    source: "cancellation_credit",
    recurringServiceId: service.id,
  };
}
