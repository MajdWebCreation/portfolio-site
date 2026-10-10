"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/access";
import type { ActionResult } from "@/lib/admin/action-result";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import {
  createCreditNote,
  creditCapExceeded,
  creditedLinesOnInvoice,
  creditNoteLinesInvalid,
  issueCreditNoteDocument,
  type CreditNoteLineInput,
} from "@/lib/admin/credit-notes/issue";
import { getCreditNote, listRefundsForInvoice } from "@/lib/admin/credit-notes/repository";
import { isFinanciallyIssued } from "@/lib/admin/credit-notes/types";
import { adminDb } from "@/lib/admin/db";
import { sendCreditNoteMail } from "@/lib/admin/documents/credit-note-mail";
import { documentDateLabel } from "@/lib/admin/documents/email";
import { isDateKey, toDateKey } from "@/lib/admin/format";
import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { getInvoice, listInvoicesForRecurringService } from "@/lib/admin/invoices/repository";
import { documentFileName } from "@/lib/admin/pdf/to-buffer";
import { formatCents } from "@/lib/money";
import { cancellationCreditDraft, lastTermCredit, lastTermInvoice } from "@/lib/payments/cancellation-credit";
import { listPriceChangesForService } from "@/lib/payments/price-change";
import { getRecurringService, listPaymentsForInvoice } from "@/lib/payments/repository";
import { settleInvoice } from "@/lib/payments/settlement";
import { invoiceAmounts } from "@/lib/admin/invoices/types";

/**
 * The admin's side of credit notes: make one, finish one whose PDF did not
 * get stored, mail one, and look at its PDF. Every action reads the records
 * from the database and never from the screen; see invoices/finalize.ts for
 * why that order matters.
 */
export type CreditNoteOutcome = { id: string; number: string; reused: boolean };

function revalidate(invoiceId: string, customerId: string, creditNoteId?: string): void {
  revalidatePath("/admin/betalingen");
  revalidatePath(`/admin/facturen/${invoiceId}`);
  revalidatePath(`/admin/klanten/${customerId}`);
  if (creditNoteId) revalidatePath(`/admin/betalingen/creditnotas/${creditNoteId}`);
}

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

/** "Creditnota aanmaken" on an invoice: the reason and the lines come from the form. */
export async function createManualCreditNote(
  invoiceId: string,
  input: { reason: string; issueDate: string; lines: CreditNoteLineInput[] },
): Promise<ActionResult<CreditNoteOutcome>> {
  if (!input.reason.trim()) return { ok: false, error: "Geef een reden op." };
  if (!isDateKey(input.issueDate)) return { ok: false, error: "De datum is geen geldige datum." };
  const invalid = creditNoteLinesInvalid(input.lines);
  if (invalid) return { ok: false, error: invalid };

  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };
  if (!invoice.sentAt) return { ok: false, error: "Deze factuur is nooit verstuurd. Een niet-verstuurde factuur annuleer je; crediteren is voor facturen die de klant heeft." };
  if (invoice.status === "cancelled") return { ok: false, error: "Een geannuleerde factuur wordt niet gecrediteerd." };

  try {
    await requireAdmin();
    const db = await adminDb();
    const exceeded = creditCapExceeded({
      invoiceLines: invoice.lines,
      creditedLines: await creditedLinesOnInvoice(db, invoiceId),
      draftLines: input.lines,
    });
    if (exceeded) return { ok: false, error: exceeded };

    const result = await createCreditNote(db, { invoiceId, reason: input.reason, issueDate: input.issueDate, lines: input.lines, source: "manual" });
    if (!result.ok) return result;
    revalidate(invoiceId, invoice.customer.customerId, result.creditNote.id);
    return { ok: true, value: { id: result.creditNote.id, number: result.creditNote.number.value, reused: result.reused } };
  } catch (error) {
    console.error("Could not create a credit note", { invoiceId, error });
    return failure(error, "De creditnota kon niet worden aangemaakt.");
  }
}

/**
 * "Creditnota aanmaken" on a cancelled monthly service: the figures come
 * from the lifecycle's own computation, never from the screen. One per
 * service; a second click returns the first.
 */
export async function createCancellationCreditNote(serviceId: string): Promise<ActionResult<CreditNoteOutcome>> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };
  if (!service.endsOn) return { ok: false, error: "Deze dienst is niet opgezegd; er is niets te crediteren." };

  try {
    await requireAdmin();
    const db = await adminDb();
    const invoices = await listInvoicesForRecurringService(serviceId);
    const credit = lastTermCredit({
      service,
      priceChanges: await listPriceChangesForService(db, serviceId),
      billedPeriodStarts: invoices.flatMap((invoice) => (invoice.billingPeriodStart ? [invoice.billingPeriodStart] : [])),
    });
    if (!credit) return { ok: false, error: "Voor deze dienst is niets te crediteren: de laatste termijn is pro rata geïncasseerd." };
    const invoice = lastTermInvoice(service, invoices);
    if (!invoice) return { ok: false, error: "De factuur van de laatste termijn bestaat (nog) niet; die moet eerst zijn aangemaakt." };
    if (!invoice.sentAt) return { ok: false, error: `Factuur ${invoice.number.value} van de laatste termijn is nog niet verstuurd; crediteer pas als de klant de factuur heeft.` };

    const draft = cancellationCreditDraft({ service, invoice, credit, issueDate: toDateKey(new Date()) });
    const result = await createCreditNote(db, draft);
    if (!result.ok) return result;
    revalidate(invoice.id, service.customerId, result.creditNote.id);
    return { ok: true, value: { id: result.creditNote.id, number: result.creditNote.number.value, reused: result.reused } };
  } catch (error) {
    console.error("Could not create a cancellation credit note", { serviceId, error });
    return failure(error, "De creditnota kon niet worden aangemaakt.");
  }
}

/** A credit note that took its number but has no stored PDF: finish it. */
export async function finishCreditNoteIssue(id: string): Promise<ActionResult<string>> {
  const creditNote = await getCreditNote(id);
  if (!creditNote) return { ok: false, error: "Deze creditnota bestaat niet (meer)." };
  try {
    const db = await adminDb();
    const issued = await issueCreditNoteDocument(db, id);
    if (!issued.ok) return issued;
    revalidate(creditNote.invoiceId, creditNote.customer.customerId, id);
    return { ok: true, value: issued.creditNote.number.value };
  } catch (error) {
    console.error("Could not finish a credit note", { id, error });
    return failure(error, "De creditnota kon niet worden afgerond.");
  }
}

/** The stored PDF, verified against its hash; the same read the mail does. */
export async function creditNoteDocumentFile(
  id: string,
): Promise<ActionResult<{ fileName: string; base64: string; sha256: string; bytes: number }>> {
  const db = await adminDb();
  const creditNote = await getCreditNote(id);
  if (!creditNote) return { ok: false, error: "Deze creditnota bestaat niet (meer)." };
  const artifact = await readInvoiceArtifact(db, creditNote, "creditnota");
  if (!artifact.ok) return { ok: false, error: artifact.reason };
  return {
    ok: true,
    value: {
      fileName: documentFileName(creditNote.number.value),
      base64: artifact.pdf.toString("base64"),
      sha256: artifact.document.sha256,
      bytes: artifact.document.bytes,
    },
  };
}

/** "Versturen naar klant": the stored PDF, to the customer as they are now, logged. No refund follows from this. */
export async function sendCreditNoteToCustomer(id: string): Promise<ActionResult<{ number: string; recipient: string }>> {
  const db = await adminDb();
  const creditNote = await getCreditNote(id);
  if (!creditNote) return { ok: false, error: "Deze creditnota bestaat niet (meer)." };
  if (!isFinanciallyIssued(creditNote)) {
    return { ok: false, error: `Het afronden van ${creditNote.number.value} is niet klaar: er is geen opgeslagen PDF. Rond de creditnota eerst af.` };
  }
  const invoice = await getInvoice(creditNote.invoiceId);
  if (!invoice) return { ok: false, error: "De factuur van deze creditnota bestaat niet (meer)." };

  const addressed = await resolveCustomerRecipient(db, creditNote.customer.customerId);
  if (!addressed.ok) return { ok: false, error: addressed.reason };

  const artifact = await readInvoiceArtifact(db, creditNote, "creditnota");
  if (!artifact.ok) return { ok: false, error: `${artifact.reason} De creditnota is niet verstuurd.` };

  /* Whether the customer is told to expect money back or a lower balance. */
  const settlement = settleInvoice(invoiceAmounts(invoice).dueCents, await listPaymentsForInvoice(invoice.id));
  const refundsSoFar = await listRefundsForInvoice(invoice.id);
  const invoicePaid = settlement.paidCents > 0 && settlement.paidCents + refundsSoFar.length >= 0 && settlement.paidCents >= invoiceAmounts(invoice).dueCents;

  const mail = await sendCreditNoteMail({
    log: { db, customerId: creditNote.customer.customerId, category: "credit_note_sent", invoiceId: invoice.id, ...(creditNote.recurringServiceId ? { recurringServiceId: creditNote.recurringServiceId } : {}) },
    recipient: addressed.recipient,
    number: creditNote.number.value,
    invoiceNumber: invoice.number.value,
    issueDateLabel: documentDateLabel(creditNote.issueDate),
    reason: creditNote.reason,
    totalLabel: formatCents(creditNote.totalCents),
    invoicePaid,
    pdf: artifact.pdf,
    fileName: documentFileName(creditNote.number.value),
  });
  if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

  const { error } = await db
    .from("credit_notes")
    .update({ status: "sent", sent_at: mail.sentAt, recipient_email: addressed.recipient.email })
    .eq("id", id);
  if (error) {
    console.error("Credit note sent but status update failed", { id, error });
    return { ok: false, error: `De creditnota is verstuurd naar ${addressed.recipient.email}, maar de status kon niet worden bijgewerkt.` };
  }

  revalidate(invoice.id, creditNote.customer.customerId, id);
  return { ok: true, value: { number: creditNote.number.value, recipient: addressed.recipient.email } };
}
