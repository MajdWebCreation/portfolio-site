import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";

/**
 * The mail that carries an activation link.
 *
 * The link contains the token and nothing else: no provider secret, no
 * identifiers that mean anything outside this application. It goes out
 * through `sendCustomerEmail`, the same door every other customer mail uses,
 * so it lands on the customer's communication record like the rest.
 */
export type ActivationMailInput = {
  /** Who this is for and which service it activates, for the record. */
  log: CommunicationContext;
  /** The customer record as it is now; it also says whom to greet. */
  recipient: CustomerRecipient;
  serviceName: string;
  amountCents: number;
  activationUrl: string;
};

export type ActivationMailResult = { sent: true; sentAt: string } | { sent: false; reason: string };

export async function sendActivationMail(input: ActivationMailInput): Promise<ActivationMailResult> {
  const { contactName } = input.recipient;
  const amount = formatCents(input.amountCents);
  const opening = `Voor ${input.serviceName} kun je automatische incasso instellen. Dat gaat in één keer: je betaalt de eerste termijn van ${amount} en machtigt ons meteen voor de maanden daarna.`;
  const note =
    "De link werkt drie dagen en is persoonlijk. Je kunt de incasso altijd stopzetten; daarvoor hoef je alleen te mailen.";

  const html = emailShell({
    locale: "nl",
    title: "Automatische incasso instellen",
    preheader: `${input.serviceName} — ${amount} per maand`,
    content: [
      emailText(`Beste ${escapeEmailHtml(contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
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
    {
      to: input.recipient,
      subject: `Automatische incasso instellen — ${companyProfile.name}`,
      html,
      text,
    },
    input.log,
  );

  return result.sent ? { sent: true, sentAt: result.sentAt } : { sent: false, reason: result.reason };
}
