import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { deliverEmail } from "@/lib/admin/communications/provider";
import { companyProfile } from "@/lib/admin/documents/company";
import { formatDateTime } from "@/lib/admin/format";
import { businessInfo } from "@/lib/content/site-content";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailMeta, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { quoteDecisionLabels, type QuoteDecisionKind } from "@/lib/quotes/decision";
import type { MailOutcome } from "@/lib/requests/mail";

/**
 * The two mails a portal decision on a quote produces: the customer's
 * confirmation that the decision was received, and YM Creations' own
 * notice. Both are sent after the decision is on record and neither can
 * undo it. Each carries a provider idempotency key on the decision, so a
 * retry after a lost answer sends one mail, not two.
 *
 * The confirmation is general correspondence about a quote, so it goes to
 * the customer's contact address (purpose "general"), like the quote
 * itself -- not the billing address. Pure builders, so tests render what is
 * sent.
 */
type Built = { subject: string; html: string; text: string };

export type DecisionMailContent = {
  decisionId: string;
  quoteId: string;
  quoteNumber: string;
  decision: QuoteDecisionKind;
  decidedAt: string;
  termsEdition: string;
  rejectionReason: string | null;
};

const signOff = ["Met vriendelijke groet,", companyProfile.legalName];

function greet(contactName: string): string {
  return contactName.trim() ? `Beste ${contactName.trim()},` : "Beste klant,";
}

export function portalQuoteUrl(quoteId: string): string {
  return new URL(`/portaal/offertes/${quoteId}`, businessInfo.websiteUrl).toString();
}

export function adminQuoteUrl(quoteId: string): string {
  return new URL(`/admin/offertes/${quoteId}`, businessInfo.websiteUrl).toString();
}

function rowsOf(input: DecisionMailContent): [string, string][] {
  return [
    ["Offerte", input.quoteNumber],
    ["Beslissing", quoteDecisionLabels[input.decision]],
    ["Ontvangen op", formatDateTime(input.decidedAt)],
    ...(input.decision === "accepted" ? ([["Voorwaarden", `Algemene Voorwaarden B2B ${input.termsEdition}`]] as [string, string][]) : []),
    ...(input.rejectionReason ? ([["Uw toelichting", input.rejectionReason]] as [string, string][]) : []),
  ];
}

export function buildDecisionConfirmation(input: DecisionMailContent & { contactName: string }): Built {
  const accepted = input.decision === "accepted";
  const paragraph = accepted
    ? `We hebben uw akkoord op offerte ${input.quoteNumber} ontvangen. U ging akkoord met de offerte en de Algemene Voorwaarden B2B ${input.termsEdition} die erbij horen. We nemen contact met u op over de volgende stap.`
    : `We hebben ontvangen dat u offerte ${input.quoteNumber} afwijst. Dank voor het laten weten. Wilt u het anders aanpakken, of heeft u vragen? Reageer gerust op deze mail.`;
  const rows = rowsOf(input);
  const url = portalQuoteUrl(input.quoteId);
  const contact = "Vragen? Reageer gerust op deze mail, of bereik ons hieronder.";
  const title = accepted ? "Offerte geaccepteerd" : "Offerte afgewezen";

  const html = emailShell({
    locale: "nl",
    title,
    preheader: accepted ? `Uw akkoord op ${input.quoteNumber} is ontvangen.` : `Uw afwijzing van ${input.quoteNumber} is ontvangen.`,
    content: [
      emailText(escapeEmailHtml(greet(input.contactName)), { top: 18 }),
      emailText(escapeEmailHtml(paragraph)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Beslissing" }),
      emailButton(url, "Bekijk de offerte"),
      contactSectionHtml(contact),
      emailText(escapeEmailHtml(signOff[0]!), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1]!)),
    ].join(""),
  });
  const text = [
    greet(input.contactName),
    "",
    paragraph,
    "",
    "Beslissing",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Bekijk de offerte: ${url}`,
    "",
    ...contactTextLines(contact),
    "",
    ...signOff,
    companyProfile.website,
  ].join("\n");

  return { subject: `${title}: ${input.quoteNumber} | ${companyProfile.name}`, html, text };
}

export function buildInternalDecisionNotice(input: DecisionMailContent & { companyName: string; actorEmail: string | null }): Built {
  const rows: [string, string][] = [
    ["Klant", input.companyName],
    ...rowsOf(input).map(([label, value]) => [label === "Uw toelichting" ? "Reden" : label, value] as [string, string]),
    ["Door", input.actorEmail ?? "Onbekend portaalaccount"],
  ];
  const url = adminQuoteUrl(input.quoteId);
  const verb = input.decision === "accepted" ? "geaccepteerd" : "afgewezen";
  const html = emailShell({
    locale: "nl",
    title: `Offerte ${verb}`,
    preheader: `${input.companyName}: ${input.quoteNumber} ${verb} in het klantportaal`,
    content: [
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Klantportaal" }),
      emailButton(url, "Open in de admin"),
    ].join(""),
  });
  const text = [...rows.map(([label, value]) => `${label}: ${value}`), "", url].join("\n");
  return { subject: `${input.quoteNumber} ${verb} door ${input.companyName}`, html, text };
}

export async function sendDecisionConfirmation(log: CommunicationContext, recipient: CustomerRecipient, content: DecisionMailContent): Promise<MailOutcome> {
  const built = buildDecisionConfirmation({ ...content, contactName: recipient.contactName });
  const result = await sendCustomerEmail({ to: recipient, ...built, idempotencyKey: `quote-decision/${content.decisionId}/customer` }, log);
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}

/** To the company's own inbox; not a customer communication. */
export async function sendInternalDecisionNotice(content: Parameters<typeof buildInternalDecisionNotice>[0]): Promise<MailOutcome> {
  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) return { sent: false, reason: "CONTACT_TO_EMAIL is niet ingesteld." };
  const built = buildInternalDecisionNotice(content);
  const result = await deliverEmail({ to, ...built, idempotencyKey: `quote-decision/${content.decisionId}/internal` });
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}
