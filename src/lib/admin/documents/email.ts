import { Resend } from "resend";
import { companyProfile } from "@/lib/admin/documents/company";
import { documentKindLabels, type DocumentKind } from "@/lib/admin/documents/types";
import { formatDate } from "@/lib/admin/format";
import { emailMeta, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";

/**
 * Sending a quote or an invoice to its customer.
 *
 * The mail is a cover note, not a document: the PDF is the document. So it
 * says who it is for, which number it carries, the one date that matters and
 * nothing else. No marketing, no repeated line table, no links to click.
 *
 * Everything in this module runs on the server. The Resend key is read here
 * and nowhere else; it is not a NEXT_PUBLIC value and never reaches a bundle
 * that goes to the browser.
 */
export type DocumentMailInput = {
  kind: DocumentKind;
  number: string;
  recipientEmail: string;
  contactName: string;
  /** "10 sep 2026" — the date on the document itself. */
  issueDateLabel: string;
  /** "10 okt 2026" — valid until on a quote, due date on an invoice. */
  deadlineLabel: string;
  /** Formatted total including VAT. */
  totalLabel: string;
  pdf: Uint8Array;
  fileName: string;
  /**
   * Pay-by-link for this invoice, when one applies. Absent for a quote, and
   * absent for an invoice collected by direct debit -- offering a button
   * there would invite a second payment for a debt already being collected.
   */
  payUrl?: string;
  /**
   * Present when this invoice is a monthly term of a recurring service.
   *
   * Two kinds, and they are genuinely different documents to receive:
   *
   *   scheduled  a collection is coming. The mail doubles as the SEPA
   *              pre-notification -- what will be taken, and when.
   *   settled    the customer paid this term themselves, in the activation
   *              flow. Nothing is coming; this is the invoice for what has
   *              already been paid.
   */
  recurring?: {
    serviceName: string;
    collection: { kind: "scheduled"; debitOn: string } | { kind: "settled" };
  };
};

export type SendMailResult =
  /** `messageId` is Resend's own id, kept for the audit trail where one is wanted. */
  | { sent: true; sentAt: string; messageId?: string }
  | { sent: false; reason: string };

/**
 * "Factuur YM-F-2026-000001 — YM Creations", or the service instead of the
 * company for a monthly term, because that is what the customer recognises in
 * a list of twelve.
 */
export function documentSubject(kind: DocumentKind, number: string, serviceName?: string): string {
  return `${documentKindLabels[kind]} ${number} — ${serviceName ?? companyProfile.name}`;
}

/** A calendar date (YYYY-MM-DD) in the same wording the PDF uses. */
export function documentDateLabel(dateKey: string): string {
  return formatDate(`${dateKey}T12:00:00+02:00`);
}

type MailBody = { html: string; text: string };

/**
 * The one call to action a document mail carries. A table rather than a
 * styled anchor, because that is what survives Outlook; the colours are the
 * ink and paper of the rest of the mail.
 */
function payButton(url: string): string {
  const href = escapeEmailHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px;"><tr><td style="border-radius:3px;background:#14161a;"><a href="${href}" style="display:inline-block;padding:13px 22px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:3px;">Factuur betalen</a></td></tr></table>`;
}

/**
 * The body, as lines. Both renderings come from the same list, so the plain
 * text version can never drift from the HTML one.
 */
/**
 * The cover note for a monthly term. Kept short on purpose: the figures, the
 * VAT and the period are in the PDF, and repeating them here would be a
 * second specification that can disagree with the first.
 */
function recurringBody(input: DocumentMailInput & { recurring: NonNullable<DocumentMailInput["recurring"]> }): MailBody {
  const { serviceName, collection } = input.recurring;
  const scheduled = collection.kind === "scheduled" ? documentDateLabel(collection.debitOn) : null;

  const opening = `Hierbij ontvangt u de factuur voor uw maandelijkse ${serviceName}.`;
  const amount = `Maandbedrag: ${input.totalLabel} incl. btw`;
  const settlement = scheduled
    ? `Het bedrag wordt op ${scheduled} automatisch geïncasseerd. U hoeft hiervoor niets te doen.`
    : "Deze factuur is reeds betaald.";
  const attachment = "De volledige specificatie vindt u in de bijgevoegde PDF-factuur.";
  // Only worth saying while something is still going to happen.
  const objection = scheduled ? `Klopt er iets niet? Neem dan vóór ${scheduled} contact met ons op.` : null;

  const html = emailShell({
    locale: "nl",
    title: `Factuur ${input.number}`,
    preheader: `${serviceName} — ${input.totalLabel} incl. btw${scheduled ? `, incasso ${scheduled}` : ", reeds betaald"}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(input.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailText(escapeEmailHtml(amount)),
      emailSection({
        label: scheduled ? "Automatische incasso" : "Betaling",
        html: escapeEmailHtml(settlement),
      }),
      emailSection({ label: "Bijlage", html: escapeEmailHtml(attachment) }),
      ...(objection ? [emailText(escapeEmailHtml(objection), { top: 26 })] : []),
    ].join(""),
  });

  const text = [
    `Beste ${input.contactName},`,
    "",
    opening,
    "",
    amount,
    "",
    settlement,
    "",
    attachment,
    ...(objection ? [objection] : []),
    "",
    "Met vriendelijke groet,",
    companyProfile.legalName,
    `${companyProfile.email} · ${companyProfile.phone}`,
    companyProfile.website,
  ].join("\n");

  return { html, text };
}

export function buildDocumentMailBody(input: DocumentMailInput): MailBody {
  if (input.recurring) return recurringBody({ ...input, recurring: input.recurring });

  const isInvoice = input.kind === "invoice";
  const title = isInvoice ? "Je factuur" : "Je offerte";

  const opening = isInvoice
    ? `Hierbij factuur ${input.number} van ${companyProfile.name}.`
    : `Hierbij offerte ${input.number} van ${companyProfile.name}.`;

  // Nothing about payment on a quote: a quote is a proposal, not a bill.
  const facts: [string, string][] = isInvoice
    ? [
        ["Factuurnummer", input.number],
        ["Factuurdatum", input.issueDateLabel],
        ["Vervaldatum", input.deadlineLabel],
        ["Totaal incl. btw", input.totalLabel],
      ]
    : [
        ["Offertenummer", input.number],
        ["Offertedatum", input.issueDateLabel],
        ["Geldig tot", input.deadlineLabel],
        ["Totaal incl. btw", input.totalLabel],
      ];

  const attachment = isInvoice
    ? input.payUrl
      ? "De factuur vind je als PDF in de bijlage. Betalen kan met de knop hierboven, of met de gegevens op de factuur zelf."
      : "De factuur vind je als PDF in de bijlage. De betaalgegevens staan op de factuur zelf."
    : "De offerte vind je als PDF in de bijlage.";

  const closing = isInvoice
    ? "Vragen over deze factuur? Reageer gerust op deze mail."
    : "Vragen of aanpassingen? Reageer gerust op deze mail.";

  const html = emailShell({
    locale: "nl",
    title,
    preheader: `${isInvoice ? "Factuur" : "Offerte"} ${input.number} — ${input.totalLabel}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(input.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(
        facts.map(([label, value]) => ({ label, value })),
        { label: isInvoice ? "Factuurgegevens" : "Offertegegevens" },
      ),
      ...(input.payUrl ? [payButton(input.payUrl)] : []),
      emailSection({ label: "Bijlage", html: escapeEmailHtml(attachment) }),
      emailText(escapeEmailHtml(closing), { top: 26 }),
    ].join(""),
  });

  const text = [
    `Beste ${input.contactName},`,
    "",
    opening,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    ...(input.payUrl ? [`Factuur betalen: ${input.payUrl}`, ""] : []),
    attachment,
    closing,
    "",
    companyProfile.legalName,
    `${companyProfile.email} · ${companyProfile.phone}`,
    companyProfile.website,
  ].join("\n");

  return { html, text };
}

/**
 * The mail configuration, read at call time.
 *
 * Documents go out over the same Resend account and sender as the contact
 * form; there is one mail setup, not two. A missing value is a configuration
 * error the admin should see, not a silent no-op.
 */
function mailConfig(): { apiKey: string; from: string } | { error: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !from) {
    return { error: "Mailconfiguratie ontbreekt (RESEND_API_KEY of CONTACT_FROM_EMAIL)." };
  }

  return { apiKey, from };
}

/**
 * Hands the PDF to Resend. Returns a result rather than throwing, so the
 * caller can decide what to persist: nothing is written to the document
 * before this says `sent: true`.
 */
export async function sendDocumentMail(input: DocumentMailInput): Promise<SendMailResult> {
  const config = mailConfig();
  if ("error" in config) return { sent: false, reason: config.error };

  const { html, text } = buildDocumentMailBody(input);

  try {
    const result = await new Resend(config.apiKey).emails.send({
      from: config.from,
      to: input.recipientEmail,
      replyTo: companyProfile.email,
      subject: documentSubject(input.kind, input.number, input.recurring?.serviceName),
      html,
      text,
      attachments: [{ filename: input.fileName, content: Buffer.from(input.pdf) }],
    });

    if (result.error) {
      console.error("Document mail failed", { kind: input.kind, number: input.number, error: result.error });
      return { sent: false, reason: result.error.message };
    }

    return {
      sent: true,
      sentAt: new Date().toISOString(),
      ...(result.data?.id ? { messageId: result.data.id } : {}),
    };
  } catch (error) {
    console.error("Document mail threw", { kind: input.kind, number: input.number, error });
    return { sent: false, reason: "De mail kon niet worden verzonden. Probeer het opnieuw." };
  }
}
