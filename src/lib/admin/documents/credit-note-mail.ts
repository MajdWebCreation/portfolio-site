import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import type { SendMailResult } from "@/lib/admin/documents/email";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailMeta, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";

/**
 * The cover note of a credit note. Like an invoice mail: who, which number,
 * which invoice it corrects, how much, why -- and the PDF, which is the
 * document. Nothing here moves money: whether a refund follows is a separate
 * decision on the payments page, and the mail only says what happens.
 */
export type CreditNoteMailContent = {
  contactName: string;
  number: string;
  invoiceNumber: string;
  issueDateLabel: string;
  reason: string;
  totalLabel: string;
  /** Whether the invoice was already paid, which decides what the customer is told to expect. */
  invoicePaid: boolean;
  pdf: Uint8Array;
  fileName: string;
};

export const creditNoteSubject = (number: string) => `Creditnota ${number} | ${companyProfile.name}`;

export function buildCreditNoteMailBody(input: CreditNoteMailContent): { html: string; text: string } {
  const opening = `Hierbij ontvangt u creditnota ${input.number} van ${companyProfile.name}, als correctie op factuur ${input.invoiceNumber}.`;
  const facts: [string, string][] = [
    ["Creditnotanummer", input.number],
    ["Betreft factuur", input.invoiceNumber],
    ["Datum", input.issueDateLabel],
    ["Reden", input.reason],
    ["Gecrediteerd incl. btw", input.totalLabel],
  ];
  const settlement = input.invoicePaid
    ? `Factuur ${input.invoiceNumber} was al betaald. Het gecrediteerde bedrag van ${input.totalLabel} wordt aan u terugbetaald; u hoeft daar niets voor te doen.`
    : `Factuur ${input.invoiceNumber} is nog niet (volledig) betaald. Het gecrediteerde bedrag wordt in mindering gebracht op wat nog openstaat.`;
  const attachment = "De creditnota vindt u als PDF in de bijlage.";
  const closing = "Vragen over deze creditnota? Reageer gerust op deze mail, of bereik ons hieronder.";

  const html = emailShell({
    locale: "nl",
    title: "Je creditnota",
    preheader: `Creditnota ${input.number} — ${input.totalLabel}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(input.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(
        facts.map(([label, value]) => ({ label, value })),
        { label: "Creditnotagegevens" },
      ),
      emailSection({ label: "Verrekening", html: escapeEmailHtml(settlement) }),
      emailSection({ label: "Bijlage", html: escapeEmailHtml(attachment) }),
      contactSectionHtml(closing),
    ].join(""),
  });

  const text = [
    `Beste ${input.contactName},`,
    "",
    opening,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    settlement,
    "",
    attachment,
    "",
    ...contactTextLines(closing),
    "",
    companyProfile.legalName,
    companyProfile.website,
  ].join("\n");

  return { html, text };
}

export async function sendCreditNoteMail(
  input: Omit<CreditNoteMailContent, "contactName"> & { log: CommunicationContext; recipient: CustomerRecipient },
): Promise<SendMailResult> {
  const { html, text } = buildCreditNoteMailBody({ ...input, contactName: input.recipient.contactName });
  const result = await sendCustomerEmail(
    {
      to: input.recipient,
      subject: creditNoteSubject(input.number),
      html,
      text,
      attachments: [{ filename: input.fileName, content: Buffer.from(input.pdf) }],
    },
    input.log,
  );
  if (!result.sent) {
    console.error("Credit note mail failed", { number: input.number, failure: result.failure, reason: result.reason });
    return {
      sent: false,
      reason: result.failure === "error" ? "De mail kon niet worden verzonden. Probeer het opnieuw." : result.reason,
    };
  }
  return result;
}

