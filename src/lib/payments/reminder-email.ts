import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { companyProfile } from "@/lib/admin/documents/company";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailMeta, emailSection, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { formatCents } from "@/lib/money";
import { reminderFeeAnnounced, reminderFeeCents, type ReminderStage } from "@/lib/payments/collection-policy";
import { activationAmountCents } from "@/lib/payments/mandate-activation";

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
  /** The invoice's payment button, when an ordinary payment may be started (payLinkFor). */
  payUrl?: string;
  /**
   * The invoice belongs to a service collected by direct debit: there is no
   * button on purpose, and the mail says why instead of asking the customer
   * to pay -- a transfer beside a collection would be paid twice.
   */
  collectedByDirectDebit?: boolean;
  /**
   * The customer's direct debit, a separate action from paying this invoice
   * (reminder-activation.ts): the EUR 0.01 activation to offer, or the note
   * that their authorisation is being processed.
   */
  activation?: { kind: "offer"; url: string } | { kind: "awaiting_confirmation" };
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

/** A direct-debit invoice is not chased as unpaid by the customer: its subject says what happened instead. */
export const directDebitReminderSubject = "Je factuur is nog niet via automatische incasso betaald";

export function reminderSubject(stage: ReminderStage, collectedByDirectDebit = false): string {
  return collectedByDirectDebit ? directDebitReminderSubject : reminderSubjects[stage];
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

/*
  Two actions that look alike and are not: paying this invoice, and
  authorising the monthly collection. When both are offered each gets its own
  heading and button, and the activation says in so many words that its cent
  pays no invoice.
*/
const activationButtonText = `Incasso activeren (${formatCents(activationAmountCents)})`;
const activationOffer = `Los van deze factuur: voor je maandelijkse dienst is de automatische incasso nog niet geactiveerd. Dat doe je met een eenmalige betaling van ${formatCents(activationAmountCents)} via de knop hieronder. Die ${formatCents(activationAmountCents)} betaalt deze factuur niet en is geen maandtermijn; het is alleen je toestemming voor de incasso.`;
const activationAwaiting = "Je toestemming voor de automatische incasso is ontvangen en wordt nog verwerkt. Daarvoor hoef je niets meer te doen.";

function payIntro(content: ReminderMailContent): string {
  return `Met de knop hieronder betaal je het openstaande bedrag van deze factuur: ${content.outstandingLabel}.`;
}

/** The invoice's button -- under its own heading when the activation is offered beside it. */
function payHtml(content: ReminderMailContent): string[] {
  if (!content.payUrl) return [];
  const button = emailButton(content.payUrl, "Factuur betalen");
  return content.activation?.kind === "offer" ? [emailSection({ label: "Factuur betalen", html: escapeEmailHtml(payIntro(content)) }), button] : [button];
}

function payText(content: ReminderMailContent): string[] {
  if (!content.payUrl) return [];
  return content.activation?.kind === "offer"
    ? ["Factuur betalen", payIntro(content), `Factuur betalen: ${content.payUrl}`, ""]
    : [`Factuur betalen: ${content.payUrl}`, ""];
}

function activationHtml(content: ReminderMailContent): string[] {
  if (content.activation?.kind === "offer") {
    return [emailSection({ label: "Automatische incasso activeren", html: escapeEmailHtml(activationOffer) }), emailButton(content.activation.url, activationButtonText)];
  }
  if (content.activation?.kind === "awaiting_confirmation") return [emailSection({ label: "Automatische incasso", html: escapeEmailHtml(activationAwaiting) })];
  return [];
}

function activationText(content: ReminderMailContent): string[] {
  if (content.activation?.kind === "offer") return ["Automatische incasso activeren", activationOffer, `${activationButtonText}: ${content.activation.url}`, ""];
  if (content.activation?.kind === "awaiting_confirmation") return ["Automatische incasso", activationAwaiting, ""];
  return [];
}

function firstReminder(content: ReminderMailContent): MailBody {
  const opening =
    "Waarschijnlijk is deze factuur aan je aandacht ontsnapt. We willen je vriendelijk herinneren dat deze inmiddels is verlopen.";
  /* With the activation below it, "ignore this mail" would also wave that away. */
  const crossed =
    content.activation?.kind === "offer"
      ? "Heb je de factuur net betaald? Dan hebben onze berichten elkaar gekruist en hoef je voor de factuur niets meer te doen. De automatische incasso hieronder staat daar los van."
      : "Heb je de betaling net gedaan? Dan hebben onze berichten elkaar gekruist en kun je deze mail als niet verzonden beschouwen.";
  const rows = facts(content);

  const html = emailShell({
    locale: "nl",
    title: "Herinnering",
    preheader: `${content.invoiceNumber} — ${content.outstandingLabel} open sinds ${content.dueDateLabel}`,
    content: [
      emailText(`Beste ${escapeEmailHtml(content.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Factuurgegevens" }),
      ...payHtml(content),
      emailSection({ label: "Al betaald?", html: escapeEmailHtml(crossed) }),
      ...activationHtml(content),
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
    ...payText(content),
    crossed,
    "",
    ...activationText(content),
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
      ...payHtml(content),
      ...(content.payUrl ? [emailText(escapeEmailHtml(exact), { top: 14 })] : []),
      emailSection({ label: "Lukt het niet?", html: escapeEmailHtml(help) }),
      ...activationHtml(content),
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
    ...payText(content),
    ...(content.payUrl ? [exact, ""] : []),
    help,
    "",
    ...activationText(content),
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
      ...payHtml(content),
      emailSection({ label: "Als betaling uitblijft", html: escapeEmailHtml(consequences) }),
      ...activationHtml(content),
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
    ...payText(content),
    consequences,
    "",
    ...activationText(content),
    ...contactTextLines(help),
    "",
    ...signOff,
  ].join("\n");

  return { html, text };
}

/*
  An invoice of a service collected by direct debit, past the grace window
  and still unpaid. The money was supposed to come by itself, so this is not
  a dunning letter and no stage of the ladder turns it into one: it says the
  payment has not arrived, asks the customer not to transfer it themselves
  without talking to us -- a transfer beside a collection still under way
  would be paid twice -- and how to reach us.
*/
function directDebitReminder(content: ReminderMailContent): MailBody {
  const opening = "We hebben de betaling van onderstaande factuur nog niet ontvangen.";
  const explain =
    "Deze factuur hoort bij je maandelijkse dienst met automatische incasso. Maak het bedrag niet zelf over zonder overleg, zodat er niet dubbel wordt afgeschreven. Neem contact met ons op, dan zoeken we samen uit wat er misging en regelen we de betaling.";
  const rows = facts(content, [["Dagen verlopen", String(content.daysOverdue)]]);

  const html = emailShell({
    locale: "nl",
    title: "Betaling nog niet ontvangen",
    preheader: `${content.invoiceNumber} — ${content.outstandingLabel} nog niet via automatische incasso ontvangen`,
    content: [
      emailText(`Beste ${escapeEmailHtml(content.contactName)},`, { top: 18 }),
      emailText(escapeEmailHtml(opening)),
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Factuurgegevens" }),
      emailSection({ label: "Automatische incasso", html: escapeEmailHtml(explain) }),
      ...activationHtml(content),
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
    explain,
    "",
    ...activationText(content),
    ...contactTextLines(contactIntro),
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
  return content.collectedByDirectDebit ? directDebitReminder(content) : builders[content.stage](content);
}

/**
 * Sends one reminder through the same door every other customer mail uses,
 * so it lands on the customer's communication record like the rest.
 */
export async function sendReminderMail(
  recipient: CustomerRecipient,
  content: Omit<ReminderMailContent, "contactName">,
  log: CommunicationContext,
): Promise<ReminderMailResult> {
  const { html, text } = buildReminderMailBody({ ...content, contactName: recipient.contactName });

  const result = await sendCustomerEmail(
    { to: recipient, subject: reminderSubject(content.stage, Boolean(content.collectedByDirectDebit)), html, text },
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
