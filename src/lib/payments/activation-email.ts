import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailMeta, emailNote, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";
import { activationAmountCents } from "@/lib/payments/mandate-activation";
import { prenotificationDays } from "@/lib/payments/prenotification";

/**
 * The mail that carries a direct debit activation link.
 *
 * The same sheet as every other transactional mail -- `emailShell`, with its
 * letterhead, footer and one dark button -- so a customer who just received
 * an invoice from us recognises this one as ours. It says plainly what the
 * cent is for: recording the mandate, and nothing else. It is not a payment
 * of an invoice or of a monthly term, and the mail never lets it read like
 * one.
 *
 * The link is Mollie's own payment link: an absolute https URL that names a
 * link id and nothing about the customer. It goes out through
 * `sendCustomerEmail`, the same door every other customer mail uses, so it
 * lands on the customer's communication record like the rest.
 */
export type ActivationMailInput = {
  /** Who this is for, for the record. */
  log: CommunicationContext;
  /** The customer record as it is now; it also says whom to greet. */
  recipient: CustomerRecipient;
  /** The monthly services this authorises, with what each costs incl. btw. */
  services: { name: string; monthlyGrossCents: number }[];
  activationUrl: string;
};

export type ActivationMailResult = { sent: true; sentAt: string } | { sent: false; reason: string };

export const activationMailSubject = `Automatische incasso activeren | ${companyProfile.name}`;
export const activationButtonLabel = "Automatische incasso activeren";

/** "Websitebeheer (€ 12,10 per maand incl. btw) en SEO (€ 60,50 per maand incl. btw)" */
function servicesPhrase(services: ActivationMailInput["services"]): string | undefined {
  if (services.length === 0) return undefined;
  return services
    .map((service) => `${service.name} (${formatCents(service.monthlyGrossCents)} per maand incl. btw)`)
    .join(" en ");
}

/**
 * Subject, HTML and plain text, from one list of sentences so the two
 * renderings cannot drift apart. Pure: the preview and the tests render
 * exactly what is sent.
 */
export function buildActivationMail(input: {
  contactName: string;
  services: ActivationMailInput["services"];
  activationUrl: string;
}): { subject: string; html: string; text: string } {
  // A relative or plain-http link would be a dead or unsafe button in a mail.
  if (!/^https:\/\/[^\s"<>]+$/.test(input.activationUrl)) {
    throw new Error("De activatielink is geen geldige https-link; de mail is niet verstuurd.");
  }
  const cent = formatCents(activationAmountCents);
  const services = servicesPhrase(input.services);

  const greeting = input.contactName.trim() ? `Beste ${input.contactName.trim()},` : "Beste klant,";
  const opening = `Met de knop hieronder activeer je de automatische incasso. Dat doe je één keer, met een betaling van ${cent}.`;
  const purpose =
    "Dit bedrag legt alleen je machtiging voor toekomstige automatische incasso vast. Het is geen betaling van een factuur of maandtermijn en wordt nergens mee verrekend.";
  const block: [string, string][] = [["Bedrag", cent]];
  const via = "Je betaalt via de beveiligde betaalomgeving van Mollie.";
  const afterwards = services
    ? `De maandtermijnen voor ${services} kunnen dan automatisch worden geïncasseerd.`
    : "Je maandtermijnen kunnen dan automatisch worden geïncasseerd.";
  const notice = `Vóór elke afschrijving ontvang je de factuur, minstens ${prenotificationDays} dagen van tevoren. Stoppen kan altijd; je hoeft ons alleen te mailen.`;
  const contact = "Vragen over de incasso? Reageer gerust op deze mail, of bereik ons hieronder.";
  const signOff = ["Met vriendelijke groet,", companyProfile.legalName];

  const html = emailShell({
    locale: "nl",
    title: "Automatische incasso activeren",
    preheader: `Eenmalige activatie van ${cent} voor de automatische incasso`,
    content: [
      emailText(escapeEmailHtml(greeting), { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailText(escapeEmailHtml(purpose)),
      emailMeta(block.map(([label, value]) => ({ label, value })), { label: "Eenmalige activatie" }),
      emailNote(escapeEmailHtml(via)),
      emailButton(input.activationUrl, activationButtonLabel),
      emailSection({ label: "Na de activatie", html: `${escapeEmailHtml(afterwards)} ${escapeEmailHtml(notice)}` }),
      contactSectionHtml(contact),
      emailText(escapeEmailHtml(signOff[0]!), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1]!)),
    ].join(""),
  });

  const text = [
    greeting,
    "",
    opening,
    "",
    purpose,
    "",
    "Eenmalige activatie",
    ...block.map(([label, value]) => `${label}: ${value}`),
    via,
    "",
    `${activationButtonLabel}: ${input.activationUrl}`,
    "",
    "Na de activatie",
    `${afterwards} ${notice}`,
    "",
    ...contactTextLines(contact),
    "",
    ...signOff,
    companyProfile.website,
  ].join("\n");

  return { subject: activationMailSubject, html, text };
}

export async function sendActivationMail(input: ActivationMailInput): Promise<ActivationMailResult> {
  const { subject, html, text } = buildActivationMail({
    contactName: input.recipient.contactName,
    services: input.services,
    activationUrl: input.activationUrl,
  });

  const result = await sendCustomerEmail({ to: input.recipient, subject, html, text }, input.log);
  return result.sent ? { sent: true, sentAt: result.sentAt } : { sent: false, reason: result.reason };
}
