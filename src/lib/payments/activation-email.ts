import { Resend } from "resend";
import { companyProfile } from "@/lib/admin/documents/company";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";

/**
 * The mail that carries an activation link.
 *
 * The link contains the token and nothing else: no provider secret, no
 * identifiers that mean anything outside this application. Same Resend
 * account and sender as every other mail; the key is read here and never
 * leaves the server.
 */
export type ActivationMailInput = {
  recipientEmail: string;
  contactName: string;
  serviceName: string;
  amountCents: number;
  activationUrl: string;
};

export type ActivationMailResult = { sent: true; sentAt: string } | { sent: false; reason: string };

export async function sendActivationMail(input: ActivationMailInput): Promise<ActivationMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "Mailconfiguratie ontbreekt." };

  const amount = formatCents(input.amountCents);
  const opening = `Voor ${input.serviceName} kun je automatische incasso instellen. Dat gaat in één keer: je betaalt de eerste termijn van ${amount} en machtigt ons meteen voor de maanden daarna.`;
  const note =
    "De link werkt drie dagen en is persoonlijk. Je kunt de incasso altijd stopzetten; daarvoor hoef je alleen te mailen.";

  const html = emailShell({
    locale: "nl",
    title: "Automatische incasso instellen",
    preheader: `${input.serviceName} — ${amount} per maand`,
    content: [
      emailText(`Beste ${escapeEmailHtml(input.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailButton(input.activationUrl, "Automatische incasso activeren"),
      emailSection({ label: "Goed om te weten", html: escapeEmailHtml(note) }),
      contactSectionHtml(),
    ].join(""),
  });

  const text = [
    `Beste ${input.contactName},`,
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

  try {
    const result = await new Resend(apiKey).emails.send({
      from,
      to: input.recipientEmail,
      replyTo: companyProfile.email,
      subject: `Automatische incasso instellen — ${companyProfile.name}`,
      html,
      text,
    });
    if (result.error) return { sent: false, reason: result.error.message };
    return { sent: true, sentAt: new Date().toISOString() };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Onbekende fout" };
  }
}
