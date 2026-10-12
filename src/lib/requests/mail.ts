import { sendCustomerEmail, type CommunicationContext, type CustomerRecipient } from "@/lib/admin/communications/send";
import { deliverEmail } from "@/lib/admin/communications/provider";
import { companyProfile } from "@/lib/admin/documents/company";
import { businessInfo } from "@/lib/content/site-content";
import { contactSectionHtml, contactTextLines } from "@/lib/email/contact";
import { emailButton, emailMeta, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { requestCategoryLabels, requestStatusLabels, type RequestCategory, type RequestStatus } from "@/lib/requests/model";
import { portalAccessTextLine } from "@/lib/email/portal-access";

/**
 * The mails a request produces: the customer's confirmation, YM Creations'
 * own notice of a new request, and the customer's update when the status
 * moves. Each one is sent after the database already holds what it is
 * about, and a failure to send is reported, never undone into the data: the
 * request, its status and its files stay whatever the mail did.
 *
 * The customer's mails go through sendCustomerEmail, so they are addressed
 * from the customer record (general purpose: the contact address) and land
 * in the communication log. The internal notice goes to the company's own
 * inbox and is not a customer communication. Pure builders, so the tests
 * render exactly what is sent.
 */
export type MailOutcome = { sent: true } | { sent: false; reason: string };

type Built = { subject: string; html: string; text: string };

const signOff = ["Met vriendelijke groet,", companyProfile.legalName];

function greet(contactName: string): string {
  return contactName.trim() ? `Beste ${contactName.trim()},` : "Beste klant,";
}

export function portalRequestUrl(requestId: string): string {
  return new URL(`/portaal/verzoeken/${requestId}`, businessInfo.websiteUrl).toString();
}

export function adminRequestUrl(requestId: string): string {
  return new URL(`/admin/verzoeken/${requestId}`, businessInfo.websiteUrl).toString();
}

function customerMail(input: { title: string; preheader: string; contactName: string; paragraphs: string[]; rows: [string, string][]; url: string }): Omit<Built, "subject"> {
  const contact = "Vragen? Reageer gerust op deze mail, of bereik ons hieronder.";
  const html = emailShell({
    locale: "nl",
    portalAccess: true,
    title: input.title,
    preheader: input.preheader,
    content: [
      emailText(escapeEmailHtml(greet(input.contactName)), { top: 18 }),
      ...input.paragraphs.map((paragraph) => emailText(escapeEmailHtml(paragraph))),
      emailMeta(input.rows.map(([label, value]) => ({ label, value })), { label: "Verzoek" }),
      emailButton(input.url, "Bekijk uw verzoek"),
      contactSectionHtml(contact),
      emailText(escapeEmailHtml(signOff[0]!), { top: 26 }),
      emailText(escapeEmailHtml(signOff[1]!)),
    ].join(""),
  });
  const text = [
    greet(input.contactName),
    "",
    ...input.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    "Verzoek",
    ...input.rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Bekijk uw verzoek: ${input.url}`,
    "",
    ...contactTextLines(contact),
    "",
    ...signOff,
    companyProfile.website,
    "",
    portalAccessTextLine(),
  ].join("\n");
  return { html, text };
}

export type RequestMailContent = { contactName: string; requestId: string; subject: string; category: RequestCategory };

export function buildRequestReceivedMail(input: RequestMailContent): Built {
  return {
    subject: `Uw verzoek is ontvangen: ${input.subject} | ${companyProfile.name}`,
    ...customerMail({
      title: "Verzoek ontvangen",
      preheader: `We hebben uw verzoek "${input.subject}" ontvangen.`,
      contactName: input.contactName,
      paragraphs: [
        "We hebben uw verzoek ontvangen. We bekijken het en laten u weten hoe we verdergaan; de status volgt u in het klantportaal.",
      ],
      rows: [
        ["Onderwerp", input.subject],
        ["Categorie", requestCategoryLabels[input.category]],
      ],
      url: portalRequestUrl(input.requestId),
    }),
  };
}

export function buildRequestStatusMail(input: RequestMailContent & { status: RequestStatus }): Built {
  const label = requestStatusLabels[input.status];
  const lines: Record<RequestStatus, string> = {
    submitted: "Uw verzoek staat weer als ingediend bij ons.",
    in_review: "We bekijken uw verzoek.",
    awaiting_customer: "We hebben iets van u nodig om met uw verzoek verder te kunnen. U hoort van ons wat; reageer gerust op deze mail.",
    in_progress: "We zijn met uw verzoek aan de slag.",
    completed: "Uw verzoek is afgerond.",
    declined: "We hebben besloten uw verzoek niet uit te voeren. Wilt u weten waarom, of wilt u het anders aanpakken? Reageer gerust op deze mail.",
  };
  return {
    subject: `${label}: ${input.subject} | ${companyProfile.name}`,
    ...customerMail({
      title: "Update over uw verzoek",
      preheader: `Status van "${input.subject}": ${label}.`,
      contactName: input.contactName,
      paragraphs: [lines[input.status]],
      rows: [
        ["Onderwerp", input.subject],
        ["Status", label],
      ],
      url: portalRequestUrl(input.requestId),
    }),
  };
}

export function buildInternalRequestMail(input: { requestId: string; companyName: string; subject: string; category: RequestCategory; description: string }): Built & { to?: string } {
  const rows: [string, string][] = [
    ["Klant", input.companyName],
    ["Categorie", requestCategoryLabels[input.category]],
    ["Onderwerp", input.subject],
  ];
  const url = adminRequestUrl(input.requestId);
  const html = emailShell({
    locale: "nl",
    title: "Nieuw klantverzoek",
    preheader: `${input.companyName}: ${input.subject}`,
    content: [
      emailMeta(rows.map(([label, value]) => ({ label, value })), { label: "Verzoek" }),
      emailText(escapeEmailHtml(input.description).replace(/\n/g, "<br>")),
      emailButton(url, "Open in de admin"),
    ].join(""),
  });
  const text = [...rows.map(([label, value]) => `${label}: ${value}`), "", input.description, "", url].join("\n");
  return { subject: `Nieuw verzoek van ${input.companyName}: ${input.subject}`, html, text };
}

export async function sendRequestReceivedMail(log: CommunicationContext, recipient: CustomerRecipient, content: Omit<RequestMailContent, "contactName">): Promise<MailOutcome> {
  const built = buildRequestReceivedMail({ ...content, contactName: recipient.contactName });
  /* One confirmation per request, also when an answer from the provider was lost and the send is retried. */
  const result = await sendCustomerEmail({ to: recipient, ...built, idempotencyKey: `request-received/${content.requestId}` }, log);
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}

export async function sendRequestStatusMail(
  log: CommunicationContext,
  recipient: CustomerRecipient,
  content: Omit<RequestMailContent, "contactName"> & { status: RequestStatus },
): Promise<MailOutcome> {
  const built = buildRequestStatusMail({ ...content, contactName: recipient.contactName });
  const result = await sendCustomerEmail({ to: recipient, ...built }, log);
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}

/** To the company's own inbox; skipped when none is configured. */
export async function sendInternalRequestNotice(content: Parameters<typeof buildInternalRequestMail>[0]): Promise<MailOutcome> {
  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) return { sent: false, reason: "CONTACT_TO_EMAIL is niet ingesteld." };
  const built = buildInternalRequestMail(content);
  const result = await deliverEmail({ to, subject: built.subject, html: built.html, text: built.text, idempotencyKey: `request-internal/${content.requestId}` });
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}
