import { documentNote, type InvoiceActivation } from "@/lib/admin/documents/types";
import type { Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals } from "@/lib/money";

/**
 * One invoice, as a document: exactly what is rendered, and nothing else.
 *
 * The admin's preview and the PDF that is mailed are two renders of this
 * object, built by this one function, so there is no second way to compose a
 * document. Before the split into issue-then-send, the preview built its own
 * version from the form on screen while the mail built another from the
 * database, and the two disagreed about the very things that matter most: the
 * number, the payment reference and the monthly-service note.
 *
 * An issued invoice renders from what was frozen into it and from nothing
 * else. `live` -- what the screen currently knows about a monthly service --
 * is only used while the invoice is still a concept, where there is nothing
 * frozen yet and a preview is a preview.
 */
export type InvoiceDocument = { invoice: Invoice; activates?: InvoiceActivation };

export function invoiceDocument(invoice: Invoice, live?: InvoiceActivation): InvoiceDocument {
  const activates = invoice.issuedAt
    ? invoice.activationNote && documentNote(invoice.activationNote)
    : live;
  return { invoice, ...(activates ? { activates } : {}) };
}

/**
 * Everything the document says, as one canonical string.
 *
 * Field by field rather than `JSON.stringify(document)`, for two reasons: key
 * order in an object literal is not something to depend on, and a document is
 * defined by what it prints -- not by `updatedAt` or by which of its optional
 * keys happen to be present. The totals are included although they are
 * derived from the lines: if the VAT arithmetic ever changes, two documents
 * with the same lines are no longer the same document.
 */
export function documentCanon(document: InvoiceDocument): string {
  const { invoice, activates } = document;
  const totals = calculateTotals(invoice.lines);
  const customer = invoice.customer;

  return [
    `number:${invoice.number.value}`,
    `provisional:${invoice.number.provisional}`,
    `reference:${invoice.paymentReference}`,
    `issue:${invoice.issueDate}`,
    `due:${invoice.dueDate}`,
    `status:${invoice.status}`,
    `customer:${[
      customer.companyName,
      customer.contactName,
      customer.street,
      customer.postalCode,
      customer.city,
      customer.country,
      customer.kvkNumber ?? "",
      customer.vatNumber ?? "",
    ].join("|")}`,
    `period:${invoice.billingPeriodStart ?? ""}..${invoice.billingPeriodEnd ?? ""}`,
    `service:${invoice.recurringServiceId ?? ""}`,
    ...invoice.lines.map(
      (line, index) =>
        `line${index}:${line.description}|${line.quantityHundredths}|${line.unitPriceCents}|${line.vatRate}`,
    ),
    `subtotal:${totals.subtotalCents}`,
    `vat:${totals.vatCents}`,
    `total:${totals.totalCents}`,
    `notes:${invoice.notes}`,
    `activation:${activates ? `${activates.serviceName}|${activates.monthlyGrossCents}|${activates.firstDebitOn}` : ""}`,
  ].join("\n");
}

/**
 * A short, stable name for that string.
 *
 * FNV-1a, twice, with different offsets. Nothing here defends against an
 * attacker -- the question is only whether the screen that asked to send is
 * looking at the same document the server is about to send, so what matters
 * is that the same document always gives the same answer, in the browser and
 * on the server alike. Both halves are computed in 32-bit arithmetic, which
 * JavaScript does exactly.
 */
function fnv1a(input: string, offset: number): number {
  let hash = offset;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function documentFingerprint(document: InvoiceDocument): string {
  const canon = documentCanon(document);
  return `${fnv1a(canon, 0x811c9dc5).toString(16).padStart(8, "0")}${fnv1a(canon, 0x9dc5811c).toString(16).padStart(8, "0")}`;
}
