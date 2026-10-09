import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";
import { activationAmountCents } from "@/lib/payments/mandate-activation";
import { prenotificationDays } from "@/lib/payments/prenotification";

/**
 * The mail that carries a direct debit activation link.
 *
 * The link is Mollie's own payment link for EUR 0.01. The mail says plainly
 * what that cent is for -- authorising the monthly collection -- and that it
 * is not a payment of any invoice, because a customer with an invoice open
 * would otherwise reasonably wonder. It goes out through `sendCustomerEmail`,
 * the same door every other customer mail uses, so it lands on the
 * customer's communication record like the rest.
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

export const activationMailSubject = `Automatische incasso instellen — ${companyProfile.name}`;

function servicesPhrase(services: ActivationMailInput["services"]): string {
  if (services.length === 0) return "je maandelijkse diensten";
  return services
    .map((service) => `${service.name} (${formatCents(service.monthlyGrossCents)} per maand incl. btw)`)
    .join(" en ");
}

export async function sendActivationMail(input: ActivationMailInput): Promise<ActivationMailResult> {
  const { contactName } = input.recipient;
  const cent = formatCents(activationAmountCents);
  const opening = `Met de knop hieronder stel je automatische incasso in voor ${servicesPhrase(input.services)}. Je betaalt daarvoor eenmalig ${cent} via je eigen bank. Daarmee bevestig je je rekening en machtig je ${companyProfile.legalName} om de maandelijkse bedragen automatisch af te schrijven.`;
  const separate = `Die ${cent} is geen betaling van een factuur en wordt ook niet met een factuur verrekend.`;
  const note = `Vóór elke afschrijving ontvang je de factuur, minstens ${prenotificationDays} dagen van tevoren. Je kunt de incasso altijd stopzetten; daarvoor hoef je alleen te mailen.`;

  const html = emailShell({
    locale: "nl",
    title: "Automatische incasso instellen",
    preheader: `Eenmalig ${cent} om de maandelijkse incasso te machtigen`,
    content: [
      emailText(`Beste ${escapeEmailHtml(contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailText(escapeEmailHtml(separate)),
      emailButton(input.activationUrl, "Automatische incasso activeren"),
      emailSection({ label: "Goed om te weten", html: escapeEmailHtml(note) }),
      contactSectionHtml(),
    ].join(""),
  });

  const text = [
    `Beste ${contactName},`,
    "",
    opening,
    "",
    separate,
    "",
    `Activeren: ${input.activationUrl}`,
    "",
    note,
    "",
    ...contactTextLines(),
    "",
    companyProfile.legalName,
    companyProfile.website,
  ].join("\n");

  const result = await sendCustomerEmail(
    { to: input.recipient, subject: activationMailSubject, html, text },
    input.log,
  );

  return result.sent ? { sent: true, sentAt: result.sentAt } : { sent: false, reason: result.reason };
}
