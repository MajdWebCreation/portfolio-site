"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { invoiceLinks, quoteLinks } from "@/lib/admin/communications/links";
import { adminDb } from "@/lib/admin/db";
import { documentDateLabel, sendDocumentMail } from "@/lib/admin/documents/email";
import { toDateKey } from "@/lib/admin/format";
import { documentFingerprint, invoiceDocument } from "@/lib/admin/documents/document-payload";
import { documentIncompleteReason } from "@/lib/admin/documents/validation";
import { getInvoice } from "@/lib/admin/invoices/repository";
import { documentFileName, renderQuotePdf } from "@/lib/admin/pdf/to-buffer";
import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { getQuote } from "@/lib/admin/quotes/repository";
import { calculateTotals, formatCents } from "@/lib/money";
import { getProject } from "@/lib/admin/projects/repository";
import { earliestDebitDate, prenotificationDays } from "@/lib/payments/prenotification";
import { invoicePayLink, serviceActivatedBy } from "@/lib/payments/pay-link";

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
 */

export async function sendQuoteToCustomer(id: string): Promise<ActionResult<string>> {
  const db = await adminDb();

  const quote = await getQuote(id);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };

  const invalid = documentIncompleteReason(quote);
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
    log: {
      db,
      customerId: numbered.customer.customerId,
      category: "quote_sent",
      ...quoteLinks(numbered),
    },
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

export async function sendInvoiceToCustomer(id: string, expectedFingerprint?: string): Promise<ActionResult<string>> {
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
  const activates = invoice.activationNote;

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

  const numbered = invoice;
  const recipient = numbered.customer.email.trim();

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
  /*
    The fourteen days are counted from the day the invoice actually goes out,
    not from the day the admin filled the form in. A date that was far enough
    away last week may be too close today, and this mail is the announcement
    for that first collection -- so it is refused rather than sent with a
    promise that cannot be kept.
  */
  const activating = await serviceActivatedBy(numbered.id);
  if (activating?.startsOn) {
    const earliest = earliestDebitDate(toDateKey(new Date()));
    if (activating.startsOn < earliest) {
      return {
        ok: false,
        error: `De eerste automatische incasso staat op ${activating.startsOn}, en dat is minder dan ${prenotificationDays} dagen na vandaag. Zet de datum op ${earliest} of later; deze factuurmail is de vooraankondiging.`,
      };
    }
  }

  const payLink = await invoicePayLink(numbered);
  if (payLink.kind === "failed") {
    return {
      ok: false,
      error: `De betaallink kon niet worden gemaakt, dus de factuur is niet verstuurd: ${payLink.reason}`,
    };
  }
  const payUrl = payLink.kind === "link" ? payLink.url : undefined;

  /*
    The document promises a mandate exactly when the payment establishes one.

    The note was frozen when the invoice was issued, out of our own records;
    the sequence is decided here, by asking Mollie. They agree in every
    ordinary case, and when they do not, something changed between making the
    document and sending it -- the customer authorised us elsewhere, or a
    service was attached to an invoice that was already definitive. Sending
    anyway would mean one of the two lies: a customer establishing a direct
    debit that the invoice never mentions, or an invoice announcing a
    mandate that this payment does not ask for.

    So it stops, and the admin resolves it deliberately: cancel this invoice
    and issue a new one that says the right thing.
  */
  const establishesMandate = payLink.kind === "link" && payLink.decision.sequence === "first";
  if (payLink.kind === "link" && establishesMandate !== Boolean(activates)) {
    return {
      ok: false,
      error: establishesMandate
        ? "Deze betaling zou ook een automatische incasso machtigen, maar dat staat niet op de definitieve factuur. Annuleer deze factuur en maak een nieuwe aan."
        : "Deze factuur kondigt een automatische incasso aan, maar de betaling vraagt daar geen machtiging meer voor. Annuleer deze factuur en maak een nieuwe aan.",
    };
  }

  /* The mail is named after the project; the document itself is not. */
  const project = numbered.projectId ? await getProject(numbered.projectId) : undefined;
  const totals = calculateTotals(numbered.lines);

  const mailActivation = activates
    ? {
        serviceName: activates.serviceName,
        monthlyNetCents: activates.monthlyNetCents,
        monthlyGrossCents: activates.monthlyGrossCents,
        invoiceNetCents: totals.subtotalCents,
        firstDebitOn: activates.firstDebitOn,
        projectSummary: project?.name ?? numbered.lines[0]?.description ?? "de geleverde werkzaamheden",
      }
    : undefined;

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
    /*
      What the customer is about to receive, filed under what it is about. An
      invoice that also establishes the mandate is its own category: reading
      the list later, "factuur" and "factuur die de incasso aanzet" are not
      the same event, and only one of them explains a mandate appearing.
    */
    log: {
      db,
      customerId: numbered.customer.customerId,
      category: activates ? "invoice_activation_sent" : "invoice_sent",
      ...invoiceLinks(numbered),
      ...(activates ? { recurringServiceId: activates.serviceId } : {}),
    },
    recipientEmail: recipient,
    contactName: numbered.customer.contactName,
    issueDateLabel: documentDateLabel(numbered.issueDate),
    deadlineLabel: documentDateLabel(numbered.dueDate),
    totalLabel: formatCents(totals.totalCents),
    pdf,
    fileName: documentFileName(numbered.number.value),
    ...(payUrl ? { payUrl } : {}),
    ...(project ? { projectName: project.name } : {}),
    paymentReference: numbered.paymentReference,
    ...(mailActivation ? { activates: mailActivation } : {}),
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
