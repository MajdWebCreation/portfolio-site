import { sendCustomerEmail, type CommunicationContext } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailMeta, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";
import { reminderFeeAnnounced, reminderFeeCents, type ReminderStage } from "@/lib/payments/collection-policy";

/**
 * The three reminder mails.
 *
 * A reminder is a nudge, not a document: the invoice itself was sent once and
 * the customer has it, so nothing is attached here. What the mail carries is
 * the one number that matters, the date it was due, and a button.
 *
 * The ladder climbs in tone and in nothing else. The amount asked for is the
 * same in all three -- the invoice's own outstanding total -- and the button
 * collects exactly that. The second mail warns that a fee could follow; that
 * warning is copy, and `collection-policy.ts` is the only place it lives.
 *
 * Nothing in these mails names how the money moves. A customer reads about an
 * invoice and a payment button, never about a provider, a link or a system.
 */
export type ReminderMailContent = {
  stage: ReminderStage;
  contactName: string;
  invoiceNumber: string;
  /** "28 sep 2026" -- the date the invoice itself gave. */
  dueDateLabel: string;
  daysOverdue: number;
  /** Formatted outstanding amount, including VAT. */
  outstandingLabel: string;
  /** "19 okt 2026" -- the last day of the final notice's grace period. */
  finalDateLabel: string;
  /** The payment button, when one could be offered. */
  payUrl?: string;
};

export type ReminderMailResult = { sent: true; sentAt: string; messageId?: string; communicationId?: string } | { sent: false; reason: string };

type MailBody = { html: string; text: string };

/**
 * No invoice number in the subject: the existing invoice mail names the
 * project instead, because that is what a customer recognises in an inbox.
 * A reminder names what it is.
 */
export const reminderSubjects: Record<ReminderStage, string> = {
  first_reminder: "Herinnering voor je openstaande factuur",
  second_reminder: "Tweede herinnering voor je openstaande factuur",
  final_notice: "Laatste aanmaning voor je openstaande factuur",
};

export function reminderSubject(stage: ReminderStage): string {
  return reminderSubjects[stage];
}

/** The facts every reminder repeats, in the order they matter. */
function facts(content: ReminderMailContent, extra: [string, string][] = []): [string, string][] {
  return [
    ["Factuurnummer", content.invoiceNumber],
    ["Vervaldatum", content.dueDateLabel],
    ...extra,
    ["Nog te voldoen", content.outstandingLabel],
  ];
}

const signOff = ["Met vriendelijke groet,", companyProfile.legalName];

/*
  The shared contact block addresses the reader as "u", which is right for an
  invoice and wrong here: these three mails speak to the customer as "je" from
  the first line, and switching halfway down reads like two people wrote it.
  The block takes its opening line as an argument, so the buttons and the
  address stay exactly the ones every other transactional mail uses.
*/
const contactIntro = "Heb je een vraag of klopt er iets niet? Neem gerust contact met ons op.";

function firstReminder(content: ReminderMailContent): MailBody {
  const opening =
    "Waarschijnlijk is deze factuur aan je aandacht ontsnapt. We willen je vriendelijk herinneren dat deze inmiddels is verlopen.";
  const crossed =
    "Heb je de betaling net gedaan? Dan hebben onze berichten elkaar gekruist en kun je deze mail als niet verzonden beschouwen.";
  const rows = facts(content);

  const html = emailShell({
    locale: "nl",
    title: "Herinnering",
    preheader: `${content.invoiceNumber} — ${content.outstandingLabel} open sinds ${content.dueDateLabel}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(content.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Factuurgegevens" }),
      ...(content.payUrl ? [emailButton(content.payUrl, "Factuur betalen")] : []),
      emailSection({ label: "Al betaald?", html: escapeEmailHtml(crossed) }),
      contactSectionHtml(contactIntro),
      emailText(escapeEmailHtml(signOff[0]), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1])),
    ].join(""),
  });

  const text = [
    `Beste ${content.contactName},`,
    "",
    opening,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    ...(content.payUrl ? [`Factuur betalen: ${content.payUrl}`, ""] : []),
    crossed,
    "",
    ...contactTextLines(contactIntro),
    "",
    ...signOff,
  ].join("\n");

  return { html, text };
}

function secondReminder(content: ReminderMailContent): MailBody {
  const opening = `Onze factuur is inmiddels ${content.daysOverdue} dagen verlopen en we hebben je betaling nog niet ontvangen.`;
  /*
    The one sentence that mentions a fee, and the only place the amount is
    read. It says "kunnen", it says "bij verdere opvolging", and it says the
    amount is not on the invoice -- because it is not, and nothing in this
    system can put it there.
  */
  const request = reminderFeeAnnounced
    ? `We verzoeken je de openstaande factuur alsnog te voldoen. Wanneer betaling uitblijft, kunnen bij verdere opvolging ${formatCents(reminderFeeCents)} herinneringskosten in rekening worden gebracht. Deze kosten zijn op dit moment nog niet aan de factuur toegevoegd.`
    : "We verzoeken je de openstaande factuur alsnog te voldoen.";
  const exact =
    "Het bedrag hierboven is het openstaande factuurbedrag. Met de knop betaal je precies dat; er wordt niets extra's in rekening gebracht.";
  const help = "Lukt betalen op dit moment niet? Laat het ons weten, dan kijken we samen naar een oplossing.";
  const rows = facts(content, [["Dagen verlopen", String(content.daysOverdue)]]);

  const html = emailShell({
    locale: "nl",
    title: "Tweede herinnering",
    preheader: `${content.invoiceNumber} — ${content.outstandingLabel} open sinds ${content.dueDateLabel}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(content.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Factuurgegevens" }),
      emailSection({ label: "Ons verzoek", html: escapeEmailHtml(request) }),
      ...(content.payUrl ? [emailButton(content.payUrl, "Factuur betalen")] : []),
      ...(content.payUrl ? [emailText(escapeEmailHtml(exact), { top: 14 })] : []),
      emailSection({ label: "Lukt het niet?", html: escapeEmailHtml(help) }),
      contactSectionHtml(contactIntro),
      emailText(escapeEmailHtml(signOff[0]), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1])),
    ].join(""),
  });

  const text = [
    `Beste ${content.contactName},`,
    "",
    opening,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    request,
    "",
    ...(content.payUrl ? [`Factuur betalen: ${content.payUrl}`, "", exact, ""] : []),
    help,
    "",
    ...contactTextLines(contactIntro),
    "",
    ...signOff,
  ].join("\n");

  return { html, text };
}

function finalNotice(content: ReminderMailContent): MailBody {
  const opening =
    "Ondanks onze eerdere herinneringen staat onze factuur nog open. Met deze aanmaning stellen we je formeel in de gelegenheid om alsnog te betalen.";
  const term = `We verzoeken je het openstaande bedrag uiterlijk ${content.finalDateLabel} te voldoen.`;
  /*
    What may follow, in the words the law itself uses and without a single
    figure: no percentage, no amount, no term of our own invention. What is
    actually owed in such a case follows from the statutory scheme, and this
    mail does not pretend to compute it.
  */
  const consequences =
    "Blijft betaling na deze termijn uit, dan kunnen wij aanspraak maken op de wettelijke handelsrente en op de buitengerechtelijke incassokosten die volgens de geldende wettelijke regeling verschuldigd zijn. Ook kunnen wij de vordering dan voorbereiden voor overdracht aan een incassopartner.";
  const help = `Klopt er iets niet aan deze factuur, of lukt betalen niet? Neem dan vóór ${content.finalDateLabel} contact met ons op, dan zoeken we samen naar een oplossing.`;
  const rows = facts(content, [["Dagen verlopen", String(content.daysOverdue)]]).concat([
    ["Uiterste betaaldatum", content.finalDateLabel],
  ]);

  const html = emailShell({
    locale: "nl",
    title: "Laatste aanmaning",
    preheader: `${content.invoiceNumber} — ${content.outstandingLabel} te voldoen vóór ${content.finalDateLabel}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(content.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Factuurgegevens" }),
      emailSection({ label: "Uiterste termijn", html: escapeEmailHtml(term) }),
      ...(content.payUrl ? [emailButton(content.payUrl, "Factuur betalen")] : []),
      emailSection({ label: "Als betaling uitblijft", html: escapeEmailHtml(consequences) }),
      contactSectionHtml(help),
      emailText(escapeEmailHtml(signOff[0]), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1])),
    ].join(""),
  });

  const text = [
    `Beste ${content.contactName},`,
    "",
    opening,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    term,
    "",
    ...(content.payUrl ? [`Factuur betalen: ${content.payUrl}`, ""] : []),
    consequences,
    "",
    ...contactTextLines(help),
    "",
    ...signOff,
  ].join("\n");

  return { html, text };
}

const builders: Record<ReminderStage, (content: ReminderMailContent) => MailBody> = {
  first_reminder: firstReminder,
  second_reminder: secondReminder,
  final_notice: finalNotice,
};

export function buildReminderMailBody(content: ReminderMailContent): MailBody {
  return builders[content.stage](content);
}

/**
 * Sends one reminder through the same door every other customer mail uses,
 * so it lands on the customer's communication record like the rest.
 */
export async function sendReminderMail(
  recipientEmail: string,
  content: ReminderMailContent,
  log: CommunicationContext,
): Promise<ReminderMailResult> {
  const { html, text } = buildReminderMailBody(content);

  const result = await sendCustomerEmail(
    { to: recipientEmail, subject: reminderSubject(content.stage), html, text },
    log,
  );

  return result.sent
    ? {
        sent: true,
        sentAt: result.sentAt,
        ...(result.messageId ? { messageId: result.messageId } : {}),
        ...(result.communicationId ? { communicationId: result.communicationId } : {}),
      }
    : { sent: false, reason: result.reason };
}
