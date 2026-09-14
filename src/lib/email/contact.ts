import { companyProfile } from "@/lib/admin/documents/company";
import { emailButtonSecondary, emailLink, emailNote, emailSection, escapeEmailHtml } from "@/lib/email/shell";

/**
 * How a transactional mail says "reach us".
 *
 * One block, written once, used by every mail that asks the customer for
 * money or for a mandate: the invoice, the invoice that also starts a monthly
 * service, the monthly term, and the standalone direct debit link. A customer
 * who gets two of them in a week should recognise the same block, in the same
 * place, offering the same two ways to answer.
 *
 * WhatsApp is a button rather than a pasted `wa.me` URL. The raw link was
 * unreadable -- a bare number in the middle of a sentence -- and on a phone it
 * gave no target worth tapping. It stays visually quieter than the payment
 * button above it, because paying is what the mail is for; this is only how
 * you reply to it.
 */

/** WhatsApp Business, from the one place the phone number is written down. */
export const whatsappUrl = `https://wa.me/${companyProfile.phone.replace(/\D/g, "")}`;

export const whatsappLabel = "WhatsApp ons";

/** The opening line, when a mail has no more specific reason to be answered. */
export const contactIntro = "Heeft u een vraag of klopt er iets niet? Neem gerust contact met ons op.";

export function contactSectionHtml(intro: string = contactIntro): string {
  return emailSection({
    label: "Vragen?",
    html: escapeEmailHtml(intro),
    // Outside the paragraph: the button is a table, and Outlook will not have
    // a table inside a `<p>`.
    after:
      emailButtonSecondary(whatsappUrl, whatsappLabel) +
      emailNote(`Of mail naar ${emailLink(`mailto:${companyProfile.email}`, companyProfile.email)}`),
  });
}

/**
 * The same block as lines of plain text. The URL is written out here: in a
 * text mail a link is the only thing a reader can act on.
 */
export function contactTextLines(intro: string = contactIntro): string[] {
  return [intro, `${whatsappLabel}: ${whatsappUrl}`, `E-mail: ${companyProfile.email}`];
}
