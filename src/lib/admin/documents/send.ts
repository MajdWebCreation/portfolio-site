"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { invoiceLinks, quoteLinks } from "@/lib/admin/communications/links";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { adminDb } from "@/lib/admin/db";
import { documentDateLabel, sendDocumentMail } from "@/lib/admin/documents/email";
import { documentFingerprint, invoiceDocument } from "@/lib/admin/documents/document-payload";
import { documentIncompleteReason } from "@/lib/admin/documents/validation";
import { getInvoice } from "@/lib/admin/invoices/repository";
import { documentFileName, renderQuotePdf } from "@/lib/admin/pdf/to-buffer";
import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { getQuote } from "@/lib/admin/quotes/repository";
import { calculateTotals, formatCents } from "@/lib/money";
import { getProject } from "@/lib/admin/projects/repository";
import { invoicePayLink } from "@/lib/payments/pay-link";

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
 *  2b. Where it goes is read from the customer record, now -- not from the
 *     copy of the customer the document took when it was written, and not
 *     from anything the screen sends. A customer whose address changed since
 *     gets the mail at the new one; a customer without a usable address gets
 *     nothing, and the admin is told so.
 *  3. For an invoice: the stored PDF is read back and checked against the
 *     SHA-256 recorded when it was made. Nothing is rendered here — the file
 *     the admin approved is the file that is attached.
 *  4. Resend accepts the mail — or does not.
 *  5. Only then are status, sent_at and recipient_email written.
 *
 * Step 5 after step 4 is what keeps a failed send honest: nothing about the
 * document changes at all, and the admin sees why it failed instead of a
 * status that lies.
 *
 * An invoice is numbered before any of this, by `finalizeInvoice`. A quote
 * still takes its number here: there is no second step for quotes, because a
 * quote is a proposal and nothing is frozen around it.
 *
 * Both return the number that went out and the address it went to, so the
 * screen reports what the server did rather than what it had loaded.
 */
export type SentDocument = { number: string; recipient: string };

export async function sendQuoteToCustomer(id: string): Promise<ActionResult<SentDocument>> {
  const db = await adminDb();

  const quote = await getQuote(id);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };

  const invalid = documentIncompleteReason(quote);
  if (invalid) return { ok: false, error: invalid };

  // Before the number: a quote that cannot be mailed should not use one up.
  const addressed = await resolveCustomerRecipient(db, quote.customer.customerId);
  if (!addressed.ok) return { ok: false, error: addressed.reason };
  const { recipient } = addressed;

  const assigned = await db.rpc("assign_quote_number", { p_quote_id: id });
  if (assigned.error || !assigned.data) {
    return actionFailed(assigned.error, "Het offertenummer kon niet worden toegekend.");
  }

  const numbered = { ...quote, number: { value: assigned.data, provisional: false } };

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
    log: {
      db,
      customerId: numbered.customer.customerId,
      category: "quote_sent",
      ...quoteLinks(numbered),
    },
    recipient,
    issueDateLabel: documentDateLabel(numbered.issueDate),
    deadlineLabel: documentDateLabel(numbered.validUntil),
    totalLabel: formatCents(calculateTotals(numbered.lines).totalCents),
    pdf,
    fileName: documentFileName(numbered.number.value),
  });

  if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

  const { error } = await db
    .from("quotes")
    .update({ status: "sent", sent_at: mail.sentAt, recipient_email: recipient.email })
    .eq("id", id);

  if (error) {
    // The mail is out; refusing to say so would be the bigger lie. The admin
    // is told what did not get written so the status can be set by hand.
    console.error("Quote sent but status update failed", { id, error });
    return { ok: false, error: `De offerte is verstuurd naar ${recipient.email}, maar de status kon niet worden bijgewerkt.` };
  }

  revalidatePath("/admin/offertes");
  revalidatePath(`/admin/offertes/${id}`);
  revalidatePath("/admin");
  return { ok: true, value: { number: numbered.number.value, recipient: recipient.email } };
}

export async function sendInvoiceToCustomer(
  id: string,
  expectedFingerprint?: string,
): Promise<ActionResult<SentDocument>> {
  const db = await adminDb();

  const invoice = await getInvoice(id);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };
  if (invoice.status === "cancelled") {
    return { ok: false, error: "Een geannuleerde factuur wordt niet verstuurd." };
  }

  /*
    Sending does not make a document any more. An invoice that was never made
    definitive has no number of its own, so there is nothing here to send --
    and quietly issuing one now would be the old flow back again, where the
    admin never saw what left the building.
  */
  if (!invoice.issuedAt) {
    return {
      ok: false,
      error: invoice.finalizingAt
        ? `Het definitief maken van ${invoice.number.value} is niet afgerond: er is geen opgeslagen PDF. Klik opnieuw op Definitief maken en controleer daarna de PDF.`
        : "Deze factuur is nog een concept. Maak hem eerst definitief; daarna kun je de PDF controleren en versturen.",
    };
  }

  const invalid = documentIncompleteReason(invoice);
  if (invalid) return { ok: false, error: invalid };

  /*
    The document, exactly as the admin's preview built it: one function, one
    object, both renders. Nothing is derived here that the preview did not
    also derive -- the note comes out of the invoice, not out of the payment
    decision, because a note that depended on a provider answer could differ
    between looking and sending.
  */
  const document = invoiceDocument(invoice);

  /*
    And the proof that it is the same document. The screen sends the
    fingerprint of what it rendered; this recomputes it from the row. They can
    only differ if the screen is stale, which after issuing means the invoice
    was cancelled or replaced under it -- never something to mail.
  */
  if (expectedFingerprint && expectedFingerprint !== documentFingerprint(document)) {
    return {
      ok: false,
      error: "Het scherm toont een andere versie van deze factuur dan de opgeslagen versie. Laad de pagina opnieuw en controleer de PDF.",
    };
  }

  /*
    The issued invoice keeps the customer it was made out to; that is what
    the PDF says, and it does not change. Where the mail goes is a different
    question, asked of the customer record now -- before Mollie is asked for
    anything, so an invoice that cannot be mailed opens no payment either.
  */
  const addressed = await resolveCustomerRecipient(db, invoice.customer.customerId);
  if (!addressed.ok) return { ok: false, error: addressed.reason };
  const { recipient } = addressed;

  const numbered = invoice;

  /*
    An invoice issued before direct debit was split off from invoices may
    carry a frozen note saying that paying it also authorises the monthly
    collection. That is no longer true -- an invoice payment is always a plain
    one-off payment and the mandate has its own activation link -- so such a
    document is not mailed: it would promise something the button does not do.
  */
  if (numbered.activationNote) {
    return {
      ok: false,
      error:
        "Deze factuur zegt dat betalen ook de automatische incasso activeert. Dat gaat voortaan via een aparte activatielink bij de klant. Annuleer deze factuur en maak een nieuwe aan.",
    };
  }

  /*
    A pay-by-link is part of sending a normal invoice, not a bonus. If Mollie
    is configured and cannot produce one, the mail does not go out: an invoice
    whose only promised way to pay is a button that is not there is worse than
    no mail at all. The admin gets the provider's reason and the invoice stays
    exactly as it was, so a retry sends it properly.

    Two cases are not failures. Mollie not being configured at all is a
    deployment without it, and an invoice collected by direct debit gets no
    button on purpose -- a button beside an active mandate invites paying the
    same debt twice. Both send the mail without a CTA.

    `invoicePayLink` reuses an attempt that is still running rather than
    creating a second one, so resending keeps handing out the same link.
  */
  const payLink = await invoicePayLink(numbered);
  if (payLink.kind === "failed") {
    return {
      ok: false,
      error: `De betaallink kon niet worden gemaakt, dus de factuur is niet verstuurd: ${payLink.reason}`,
    };
  }
  const payUrl = payLink.kind === "link" ? payLink.url : undefined;

  /* The mail is named after the project; the document itself is not. */
  const project = numbered.projectId ? await getProject(numbered.projectId) : undefined;
  const totals = calculateTotals(numbered.lines);

  /*
    The attachment is the file, read back and verified. Not a render of the
    same data -- `@react-pdf` stamps a creation date into every document, so
    a second render is a second file, and "exactly the PDF you approved"
    would be a figure of speech. A missing or altered file stops the send:
    the answer to a document we cannot produce is never a new document.
  */
  const artifact = await readInvoiceArtifact(db, numbered);
  if (!artifact.ok) {
    return { ok: false, error: `${artifact.reason} De factuur is niet verstuurd.` };
  }
  const pdf = artifact.pdf;

  const mail = await sendDocumentMail({
    kind: "invoice",
    number: numbered.number.value,
    /* What the customer is about to receive, filed under what it is about. */
    log: {
      db,
      customerId: numbered.customer.customerId,
      category: "invoice_sent",
      ...invoiceLinks(numbered),
    },
    recipient,
    issueDateLabel: documentDateLabel(numbered.issueDate),
    deadlineLabel: documentDateLabel(numbered.dueDate),
    totalLabel: formatCents(totals.totalCents),
    pdf,
    fileName: documentFileName(numbered.number.value),
    ...(payUrl ? { payUrl } : {}),
    ...(project ? { projectName: project.name } : {}),
    paymentReference: numbered.paymentReference,
  });

  if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

  const { error } = await db
    .from("invoices")
    .update({ status: "sent", sent_at: mail.sentAt, recipient_email: recipient.email })
    .eq("id", id);

  if (error) {
    console.error("Invoice sent but status update failed", { id, error });
    return { ok: false, error: `De factuur is verstuurd naar ${recipient.email}, maar de status kon niet worden bijgewerkt.` };
  }

  revalidatePath("/admin/facturen");
  revalidatePath(`/admin/facturen/${id}`);
  revalidatePath("/admin");
  return { ok: true, value: { number: numbered.number.value, recipient: recipient.email } };
}
