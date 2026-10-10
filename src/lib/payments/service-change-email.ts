import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { documentDateLabel } from "@/lib/admin/documents/email";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailMeta, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";
import { prenotificationDays } from "@/lib/payments/collection-policy";

/**
 * Written confirmation of a change to a monthly service: a new price, or
 * the end of the service.
 *
 * The same sheet as every other transactional mail, and the same door out:
 * `sendCustomerEmail`, so the confirmation lands on the customer's
 * communication record and the admin can see that it really went. Neither
 * mail carries a document or a button -- there is nothing to pay and nothing
 * to open; the term invoices keep coming as before and say the figures again.
 *
 * Pure builders, so the tests render exactly what is sent.
 */
export type MailResult = { sent: true; sentAt: string } | { sent: false; reason: string };

type Built = { subject: string; html: string; text: string };

function greet(contactName: string): string {
  return contactName.trim() ? `Beste ${contactName.trim()},` : "Beste klant,";
}

function perMonth(cents: number): string {
  return `${formatCents(cents)} per maand`;
}

const signOff = ["Met vriendelijke groet,", companyProfile.legalName];

// ---------------------------------------------------------------- price

export type PriceChangeMailContent = {
  contactName: string;
  serviceName: string;
  oldNetCents: number;
  oldGrossCents: number;
  newNetCents: number;
  newGrossCents: number;
  vatRate: number;
  /** First day of the first period at the new price. */
  effectiveFrom: string;
  /** The first collection at the new price, when it is a collection date. */
  firstDebitOn?: string;
};

export const priceChangeMailSubject = (serviceName: string) => `Nieuw maandbedrag voor ${serviceName} | ${companyProfile.name}`;

export function buildPriceChangeMail(input: PriceChangeMailContent): Built {
  const from = documentDateLabel(input.effectiveFrom);
  const opening = `Hierbij bevestigen we dat het maandbedrag voor ${input.serviceName} verandert met ingang van ${from}.`;
  const rows: [string, string][] = [
    ["Dienst", input.serviceName],
    ["Huidig bedrag", `${perMonth(input.oldNetCents)} excl. btw (${formatCents(input.oldGrossCents)} incl. ${input.vatRate}% btw)`],
    ["Nieuw bedrag", `${perMonth(input.newNetCents)} excl. btw (${formatCents(input.newGrossCents)} incl. ${input.vatRate}% btw)`],
    ["Ingangsdatum", from],
    ...(input.firstDebitOn
      ? ([["Eerste incasso nieuw bedrag", `${documentDateLabel(input.firstDebitOn)}, ${formatCents(input.newGrossCents)}`]] as [string, string][])
      : []),
  ];
  const until = `Tot ${from} blijft het huidige bedrag gelden; een periode die al is gefactureerd verandert niet.`;
  const notice = `Zoals altijd ontvang je vóór elke automatische incasso de factuur, minstens ${prenotificationDays} dagen van tevoren. Je machtiging blijft ongewijzigd; je hoeft niets te doen.`;
  const contact = "Vragen over deze wijziging? Reageer gerust op deze mail, of bereik ons hieronder.";

  const html = emailShell({
    locale: "nl",
    title: "Nieuw maandbedrag",
    preheader: `${input.serviceName}: ${formatCents(input.newGrossCents)} per maand incl. btw vanaf ${from}`,
    content: [
      emailText(escapeEmailHtml(greet(input.contactName)), { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Prijswijziging" }),
      emailText(escapeEmailHtml(until)),
      emailSection({ label: "Incasso", html: escapeEmailHtml(notice) }),
      contactSectionHtml(contact),
      emailText(escapeEmailHtml(signOff[0]!), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1]!)),
    ].join(""),
  });

  const text = [
    greet(input.contactName),
    "",
    opening,
    "",
    "Prijswijziging",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    until,
    "",
    "Incasso",
    notice,
    "",
    ...contactTextLines(contact),
    "",
    ...signOff,
    companyProfile.website,
  ].join("\n");

  return { subject: priceChangeMailSubject(input.serviceName), html, text };
}

export async function sendPriceChangeMail(input: {
  log: CommunicationContext;
  recipient: CustomerRecipient;
  content: Omit<PriceChangeMailContent, "contactName">;
}): Promise<MailResult> {
  const built = buildPriceChangeMail({ ...input.content, contactName: input.recipient.contactName });
  const result = await sendCustomerEmail({ to: input.recipient, ...built }, input.log);
  return result.sent ? { sent: true, sentAt: result.sentAt } : { sent: false, reason: result.reason };
}

// --------------------------------------------------------- cancellation

export type CancellationMailContent = {
  contactName: string;
  serviceName: string;
  /** What a full term costs, incl. VAT. */
  monthlyGrossCents: number;
  /** The day the cancellation was confirmed. */
  requestedOn: string;
  /** The last day the service runs. */
  endsOn: string;
  /**
   * The last period still collected. `end` is the last day of service when
   * the period is partial; `grossCents` is what is collected for it.
   */
  lastTerm: { start: string; end: string; partial: boolean; daysUsed: number; periodDays: number; grossCents: number };
  /** Owed back when the full term was announced before the cancellation. */
  creditDue?: { days: number; grossCents: number };
  /** Collections still ahead, if any; the last one is the final one. */
  collectionsAhead: string[];
};

export const cancellationMailSubject = (serviceName: string) => `Bevestiging opzegging ${serviceName} | ${companyProfile.name}`;

export function buildCancellationMail(input: CancellationMailContent): Built {
  const ends = documentDateLabel(input.endsOn);
  const opening = `Hierbij bevestigen we de opzegging van ${input.serviceName}. De dienst loopt door tot en met ${ends} en stopt daarna.`;
  const ahead = input.collectionsAhead;
  const { lastTerm, creditDue } = input;
  const lastTermLabel = `${documentDateLabel(lastTerm.start)} t/m ${documentDateLabel(lastTerm.end)}${
    lastTerm.partial ? ` (${lastTerm.daysUsed} van ${lastTerm.periodDays} dagen)` : ""
  }, ${formatCents(lastTerm.grossCents)}`;
  const rows: [string, string][] = [
    ["Dienst", input.serviceName],
    ["Opgezegd op", documentDateLabel(input.requestedOn)],
    ["Laatste dag", ends],
    ["Laatste termijn", lastTermLabel],
    ahead.length > 0
      ? [
          "Nog te incasseren",
          ahead
            .map((day, index) => `${documentDateLabel(day)} (${formatCents(index === ahead.length - 1 ? lastTerm.grossCents : input.monthlyGrossCents)})`)
            .join(", "),
        ]
      : ["Nog te incasseren", "Niets; alle termijnen zijn al geïncasseerd."],
    ...(creditDue
      ? ([["Wordt gecrediteerd", `${formatCents(creditDue.grossCents)} voor de ${creditDue.days} dagen na ${ends}`]] as [string, string][])
      : []),
  ];
  const partialNote = lastTerm.partial
    ? creditDue
      ? ` De termijn ${documentDateLabel(lastTerm.start)} t/m ${documentDateLabel(lastTerm.end)} was al aangekondigd en wordt zoals aangekondigd geïncasseerd; het deel na ${ends} (${creditDue.days} dagen, ${formatCents(creditDue.grossCents)}) wordt gecrediteerd en aan je terugbetaald.`
      : ` De laatste termijn wordt naar rato van de geleverde dagen in rekening gebracht: ${lastTerm.daysUsed} van ${lastTerm.periodDays} dagen, ${formatCents(lastTerm.grossCents)} incl. btw.`
    : "";
  const after = `Na ${ends} wordt er voor deze dienst niets meer gefactureerd of geïncasseerd.${partialNote} Je machtiging voor automatische incasso blijft bestaan voor eventuele andere diensten; loopt er niets anders, dan wordt er niets meer afgeschreven.`;
  const notice =
    ahead.length > 0
      ? `Vóór elke resterende incasso ontvang je zoals altijd de factuur, minstens ${prenotificationDays} dagen van tevoren.`
      : "Er volgen geen facturen meer voor deze dienst.";
  const contact = "Vragen over de opzegging, of wil je de website overdragen? Reageer gerust op deze mail, of bereik ons hieronder.";

  const html = emailShell({
    locale: "nl",
    title: "Bevestiging opzegging",
    preheader: `${input.serviceName} loopt tot en met ${ends}`,
    content: [
      emailText(escapeEmailHtml(greet(input.contactName)), { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Opzegging" }),
      emailText(escapeEmailHtml(after)),
      emailSection({ label: "Incasso", html: escapeEmailHtml(notice) }),
      contactSectionHtml(contact),
      emailText(escapeEmailHtml(signOff[0]!), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1]!)),
    ].join(""),
  });

  const text = [
    greet(input.contactName),
    "",
    opening,
    "",
    "Opzegging",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    after,
    "",
    "Incasso",
    notice,
    "",
    ...contactTextLines(contact),
    "",
    ...signOff,
    companyProfile.website,
  ].join("\n");

  return { subject: cancellationMailSubject(input.serviceName), html, text };
}

export async function sendCancellationMail(input: {
  log: CommunicationContext;
  recipient: CustomerRecipient;
  content: Omit<CancellationMailContent, "contactName">;
}): Promise<MailResult> {
  const built = buildCancellationMail({ ...input.content, contactName: input.recipient.contactName });
  const result = await sendCustomerEmail({ to: input.recipient, ...built }, input.log);
  return result.sent ? { sent: true, sentAt: result.sentAt } : { sent: false, reason: result.reason };
}
