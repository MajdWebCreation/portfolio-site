import { websiteUrlHost } from "@/lib/contact/website-url";
import { emailLetterShell, escapeEmailHtml } from "@/lib/email/shell";

/**
 * The confirmation a websitecheck requester receives.
 *
 * One purpose: to say the request arrived. It names the person, names the
 * site, says a person will look at it, and invites a reply. Nothing else --
 * no details table, no button, no campaign, no next-step section -- because
 * every extra block makes a receipt look like a mailing. No response time is
 * promised for the check itself.
 *
 * The mail is sent with YM's contact address as reply-to, so "reply to this
 * e-mail" is true.
 */
export type WebsitecheckConfirmation = {
  subject: string;
  html: string;
  text: string;
};

const copy = {
  nl: {
    subject: "Je websitecheck-aanvraag is ontvangen",
    greeting: (name: string) => `Hallo ${name},`,
    thanks: "Bedankt voor je aanvraag.",
    received: (host: string) => `We hebben je aanvraag voor een gratis websitecheck van ${host} goed ontvangen. YM Creations bekijkt je website persoonlijk en stuurt je de bevindingen per e-mail op dit adres.`,
    reply: "Wil je in de tussentijd nog iets toevoegen? Reageer dan gewoon op deze e-mail.",
    signoff: "Met vriendelijke groet,",
    signature: "YM Creations",
  },
  en: {
    subject: "Your website check request has been received",
    greeting: (name: string) => `Hello ${name},`,
    thanks: "Thank you for your request.",
    received: (host: string) => `We have received your request for a free website check of ${host}. YM Creations will look at your website personally and send you the findings by email at this address.`,
    reply: "Want to add something in the meantime? Just reply to this email.",
    signoff: "Kind regards,",
    signature: "YM Creations",
  },
} as const;

export function buildWebsitecheckConfirmation(params: { locale: "nl" | "en"; name: string; websiteUrl: string }): WebsitecheckConfirmation {
  const { locale, name, websiteUrl } = params;
  const t = copy[locale];
  const host = websiteUrlHost(websiteUrl);

  const html = emailLetterShell({
    locale,
    title: t.subject,
    paragraphs: [
      escapeEmailHtml(t.greeting(name)),
      escapeEmailHtml(t.thanks),
      escapeEmailHtml(t.received(host)),
      escapeEmailHtml(t.reply),
      `${escapeEmailHtml(t.signoff)}<br />${escapeEmailHtml(t.signature)}`,
    ],
  });

  const text = [t.greeting(name), "", t.thanks, "", t.received(host), "", t.reply, "", t.signoff, t.signature, "", "ymcreations.com"].join("\n");

  return { subject: t.subject, html, text };
}
