import { sendCustomerEmail, type CommunicationContext } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { documentKindLabels, type DocumentKind } from "@/lib/admin/documents/types";
import { formatDate } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailMeta, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";

/**
 * Sending a quote or an invoice to its customer.
 *
 * The mail is a cover note, not a document: the PDF is the document. So it
 * says who it is for, which number it carries, the one date that matters and
 * nothing else. No marketing, no repeated line table, no links to click.
 *
 * Everything in this module runs on the server. It builds the mail and hands
 * it to `sendCustomerEmail`, which is the single door out: the provider call
 * and the communication log both live behind it, so a document that reached a
 * customer is on that customer's record by construction.
 */
export type DocumentMailContent = {
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
  /** The project this invoice is for; names the mail instead of the company. */
  projectName?: string;
  /**
   * Present when paying this one-off invoice also switches a monthly service
   * on. The monthly amounts are shown so the customer knows what they are
   * authorising -- they are not part of what is collected now.
   */
  activates?: {
    serviceName: string;
    /** Monthly price excluding VAT, in cents. */
    monthlyNetCents: number;
    /** Monthly price including VAT: what will actually be collected. */
    monthlyGrossCents: number;
    /** Net total of this invoice, for the summary. */
    invoiceNetCents: number;
    /** YYYY-MM-DD of the first monthly collection. */
    firstDebitOn: string;
    /** Short description of the work, for the opening line. */
    projectSummary: string;
  };
};

/**
 * What `sendDocumentMail` needs: the mail, and who it is for.
 *
 * `log` is required rather than optional on purpose. A send nobody registered
 * is a send nobody can account for, and a field the compiler asks for is
 * cheaper than remembering. It is kept off `DocumentMailContent` so the body
 * builders cannot read it: what a mail says has nothing to do with where the
 * record of it goes.
 */
export type DocumentMailInput = DocumentMailContent & { log: CommunicationContext };

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

/**
 * The subject of an invoice mail.
 *
 * Named after the project, because that is what the customer recognises; the
 * invoice number belongs on the document, not in an inbox. When an invoice
 * also switches a monthly service on the subject says so, so nobody pays it
 * thinking it is only a one-off.
 */
export function invoiceSubject(input: Pick<DocumentMailContent, "number" | "projectName" | "activates">): string {
  const subject = input.projectName ?? companyProfile.name;
  return input.activates
    ? `Factuur en maandelijkse service voor ${subject}`
    : `Factuur voor ${subject}`;
}

/** A calendar date (YYYY-MM-DD) in the same wording the PDF uses. */
export function documentDateLabel(dateKey: string): string {
  return formatDate(`${dateKey}T12:00:00+02:00`);
}

type MailBody = { html: string; text: string };

/** The one call to action a document mail carries; see `emailButton`. */
function payButton(url: string, label = "Factuur betalen"): string {
  return emailButton(url, label);
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
function recurringBody(input: DocumentMailContent & { recurring: NonNullable<DocumentMailContent["recurring"]> }): MailBody {
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
      contactSectionHtml(),
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
    ...contactTextLines(),
    "",
    "Met vriendelijke groet,",
    companyProfile.legalName,
    companyProfile.website,
  ].join("\n");

  return { html, text };
}

/**
 * The cover note for a one-off invoice that also switches a monthly service
 * on. Both amounts are shown net and gross, but the gross ones lead: those
 * are what actually leaves the customer's account. The monthly figures sit in
 * their own block, so nobody reads them as part of what is due now.
 */
function activationBody(
  input: DocumentMailContent & { activates: NonNullable<DocumentMailContent["activates"]> },
): MailBody {
  const a = input.activates;
  const firstDebit = documentDateLabel(a.firstDebitOn);
  const opening = `Hierbij ontvangt u de factuur voor ${a.projectSummary}.`;

  const oneOff: [string, string][] = [
    ["Excl. btw", formatCents(a.invoiceNetCents)],
    ["Incl. btw", `${input.totalLabel} — nu te betalen`],
  ];
  const monthly: [string, string][] = [
    ["Excl. btw", `${formatCents(a.monthlyNetCents)} per maand`],
    ["Incl. btw", `${formatCents(a.monthlyGrossCents)} per maand`],
    ["Eerste automatische incasso", firstDebit],
  ];

  const consent = `Door de eenmalige factuur via onderstaande knop te betalen, activeert u tevens de automatische incasso voor de maandelijkse ${a.serviceName}. Vanaf ${firstDebit} wordt maandelijks ${formatCents(a.monthlyGrossCents)} automatisch geïncasseerd.`;
  const attachment = "De volledige specificatie van de eenmalige factuur vindt u in de bijgevoegde PDF-factuur.";
  const contact = "Heeft u een vraag of klopt er iets niet? Neem gerust contact met ons op.";

  const html = emailShell({
    locale: "nl",
    title: `Factuur en maandelijkse ${a.serviceName}`,
    preheader: `${input.totalLabel} nu te betalen, daarna ${formatCents(a.monthlyGrossCents)} per maand vanaf ${firstDebit}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(input.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(oneOff.map(([label, value]) => ({ label, value })), { label: "Eenmalige betaling" }),
      emailMeta(monthly.map(([label, value]) => ({ label, value })), { label: `Maandelijkse ${a.serviceName}` }),
      emailSection({ label: "Wat u met deze betaling activeert", html: escapeEmailHtml(consent) }),
      ...(input.payUrl ? [payButton(input.payUrl, "Factuur betalen & automatische incasso activeren")] : []),
      emailSection({ label: "Bijlage", html: escapeEmailHtml(attachment) }),
      contactSectionHtml(contact),
      emailText("Met vriendelijke groet,", { top: 26 }),
      emailText(escapeEmailHtml(companyProfile.legalName)),
    ].join(""),
  });

  const text = [
    `Beste ${input.contactName},`,
    "",
    opening,
    "",
    "Eenmalige betaling",
    ...oneOff.map(([label, value]) => `  ${label}: ${value}`),
    "",
    `Maandelijkse ${a.serviceName}`,
    ...monthly.map(([label, value]) => `  ${label}: ${value}`),
    "",
    consent,
    "",
    ...(input.payUrl ? [`Factuur betalen & automatische incasso activeren: ${input.payUrl}`, ""] : []),
    attachment,
    "",
    ...contactTextLines(contact),
    "",
    "Met vriendelijke groet,",
    companyProfile.legalName,
  ].join("\n");

  return { html, text };
}

export function buildDocumentMailBody(input: DocumentMailContent): MailBody {
  if (input.activates) return activationBody({ ...input, activates: input.activates });
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
    ? "Vragen over deze factuur? Reageer gerust op deze mail, of bereik ons hieronder."
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
      ...(isInvoice ? [contactSectionHtml(closing)] : [emailText(escapeEmailHtml(closing), { top: 26 })]),
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
    "",
    ...(isInvoice ? contactTextLines(closing) : [closing]),
    "",
    companyProfile.legalName,
    companyProfile.website,
  ].join("\n");

  return { html, text };
}

/**
 * The subject of a document mail.
 *
 * A monthly term keeps the document subject; a one-off invoice is named after
 * its project, and says so when it also starts a subscription.
 */
export function documentMailSubject(input: DocumentMailContent): string {
  if (input.recurring) return documentSubject(input.kind, input.number, input.recurring.serviceName);
  return input.kind === "invoice" ? invoiceSubject(input) : documentSubject(input.kind, input.number);
}

/**
 * Hands the PDF to the mailer. Returns a result rather than throwing, so the
 * caller can decide what to persist: nothing is written to the document
 * before this says `sent: true`.
 */
export async function sendDocumentMail(input: DocumentMailInput): Promise<SendMailResult> {
  const { html, text } = buildDocumentMailBody(input);

  const result = await sendCustomerEmail(
    {
      to: input.recipientEmail,
      subject: documentMailSubject(input),
      html,
      text,
      attachments: [{ filename: input.fileName, content: Buffer.from(input.pdf) }],
    },
    input.log,
  );

  if (!result.sent) {
    console.error("Document mail failed", {
      kind: input.kind,
      number: input.number,
      failure: result.failure,
      reason: result.reason,
    });
    /* An exception carries an implementation detail, not something an admin
       can act on; a refusal from the provider says what was wrong. */
    return {
      sent: false,
      reason: result.failure === "error" ? "De mail kon niet worden verzonden. Probeer het opnieuw." : result.reason,
    };
  }

  return result;
}
