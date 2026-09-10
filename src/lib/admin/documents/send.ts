"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { documentDateLabel, sendDocumentMail } from "@/lib/admin/documents/email";
import type { DocumentLine } from "@/lib/admin/documents/types";
import { hasLineErrors, validateLine } from "@/lib/admin/documents/validation";
import { getInvoice } from "@/lib/admin/invoices/repository";
import { documentFileName, renderInvoicePdf, renderQuotePdf } from "@/lib/admin/pdf/to-buffer";
import { getQuote } from "@/lib/admin/quotes/repository";
import { calculateTotals, formatCents } from "@/lib/money";

/**
 * Sending a document to its customer.
 *
 * The order of the steps is the whole design:
 *
 *  1. `adminDb()` refuses anyone who is not an active admin, and every query
 *     below runs under that admin's own row level security. There is no
 *     endpoint here — a server action, reachable only from the admin.
 *  2. The document is validated again on the server: a customer with a real
 *     address, lines that add up, dates that make sense.
 *  3. The database issues the definitive number, once. A retry after a failed
 *     mail returns the number the document already has.
 *  4. The PDF is rendered from that numbered document.
 *  5. Resend accepts the mail — or does not.
 *  6. Only then are status, sent_at and recipient_email written.
 *
 * Step 6 after step 5 is what keeps a failed send honest: nothing about the
 * document changes except the number it was always going to get, and the
 * admin sees why it failed instead of a status that lies.
 */
function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** What both kinds need before they may go out. */
function validateSendable(document: {
  customer: { email: string; companyName: string; contactName: string; street: string; postalCode: string; city: string };
  lines: DocumentLine[];
}): string | null {
  const { customer, lines } = document;

  if (!customer.email.trim() || !isEmail(customer.email.trim())) {
    return "De klant heeft geen geldig e-mailadres. Vul dat eerst aan bij de klant.";
  }
  if (!customer.companyName.trim() || !customer.contactName.trim()) {
    return "De klantgegevens zijn onvolledig: bedrijfsnaam en contactpersoon zijn nodig.";
  }
  if (!customer.street.trim() || !customer.postalCode.trim() || !customer.city.trim()) {
    return "Het adres van de klant is onvolledig. Vul dat eerst aan bij de klant.";
  }
  if (lines.length === 0) return "Voeg minstens één regel toe voordat je verstuurt.";
  if (lines.some((line) => hasLineErrors(validateLine(line)))) {
    return "Er staan ongeldige regels in dit document.";
  }
  return null;
}

export async function sendQuoteToCustomer(id: string): Promise<ActionResult<string>> {
  const db = await adminDb();

  const quote = await getQuote(id);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };

  const invalid = validateSendable(quote);
  if (invalid) return { ok: false, error: invalid };

  const assigned = await db.rpc("assign_quote_number", { p_quote_id: id });
  if (assigned.error || !assigned.data) {
    return actionFailed(assigned.error, "Het offertenummer kon niet worden toegekend.");
  }

  const numbered = { ...quote, number: { value: assigned.data, provisional: false } };
  const recipient = numbered.customer.email.trim();

  let pdf: Buffer;
  try {
    pdf = await renderQuotePdf(numbered);
  } catch (error) {
    console.error("Quote PDF render failed", { id, error });
    return { ok: false, error: "De PDF kon niet worden gemaakt. Controleer de regels en probeer opnieuw." };
  }

  const mail = await sendDocumentMail({
    kind: "quote",
    number: numbered.number.value,
    recipientEmail: recipient,
    contactName: numbered.customer.contactName,
    issueDateLabel: documentDateLabel(numbered.issueDate),
    deadlineLabel: documentDateLabel(numbered.validUntil),
    totalLabel: formatCents(calculateTotals(numbered.lines).totalCents),
    pdf,
    fileName: documentFileName(numbered.number.value),
  });

  if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

  const { error } = await db
    .from("quotes")
    .update({ status: "sent", sent_at: mail.sentAt, recipient_email: recipient })
    .eq("id", id);

  if (error) {
    // The mail is out; refusing to say so would be the bigger lie. The admin
    // is told what did not get written so the status can be set by hand.
    console.error("Quote sent but status update failed", { id, error });
    return { ok: false, error: `De offerte is verstuurd naar ${recipient}, maar de status kon niet worden bijgewerkt.` };
  }

  revalidatePath("/admin/offertes");
  revalidatePath(`/admin/offertes/${id}`);
  revalidatePath("/admin");
  return { ok: true, value: numbered.number.value };
}

export async function sendInvoiceToCustomer(id: string): Promise<ActionResult<string>> {
  const db = await adminDb();

  const invoice = await getInvoice(id);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };
  if (invoice.status === "cancelled") {
    return { ok: false, error: "Een geannuleerde factuur wordt niet verstuurd." };
  }

  const invalid = validateSendable(invoice);
  if (invalid) return { ok: false, error: invalid };

  const assigned = await db.rpc("assign_invoice_number", { p_invoice_id: id });
  if (assigned.error || !assigned.data) {
    return actionFailed(assigned.error, "Het factuurnummer kon niet worden toegekend.");
  }

  const numbered = { ...invoice, number: { value: assigned.data, provisional: false } };
  const recipient = numbered.customer.email.trim();

  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(numbered);
  } catch (error) {
    console.error("Invoice PDF render failed", { id, error });
    return { ok: false, error: "De PDF kon niet worden gemaakt. Controleer de regels en probeer opnieuw." };
  }

  const mail = await sendDocumentMail({
    kind: "invoice",
    number: numbered.number.value,
    recipientEmail: recipient,
    contactName: numbered.customer.contactName,
    issueDateLabel: documentDateLabel(numbered.issueDate),
    deadlineLabel: documentDateLabel(numbered.dueDate),
    totalLabel: formatCents(calculateTotals(numbered.lines).totalCents),
    pdf,
    fileName: documentFileName(numbered.number.value),
  });

  if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

  const { error } = await db
    .from("invoices")
    .update({ status: "sent", sent_at: mail.sentAt, recipient_email: recipient })
    .eq("id", id);

  if (error) {
    console.error("Invoice sent but status update failed", { id, error });
    return { ok: false, error: `De factuur is verstuurd naar ${recipient}, maar de status kon niet worden bijgewerkt.` };
  }

  revalidatePath("/admin/facturen");
  revalidatePath(`/admin/facturen/${id}`);
  revalidatePath("/admin");
  return { ok: true, value: numbered.number.value };
}
