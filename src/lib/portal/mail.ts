import { deliverEmail, type DeliveryResult } from "@/lib/admin/communications/provider";
import { businessInfo } from "@/lib/content/site-content";
import { emailButton, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { portalLoginPath, portalSetPasswordPath } from "@/lib/portal/paths";

/**
 * The three mails the portal's account flows send. Branded like every other
 * mail of this system, and built here rather than by the Auth server, so the
 * link always points at a route of ours and the wording is ours.
 *
 * What a mail says about the customer: the company name, and nothing else.
 * A mail that reaches the wrong inbox should tell its reader as little as
 * possible.
 *
 * Nothing is logged in customer_communications: these are account mails,
 * not communication about a document, and the portal_events row written
 * alongside is their record.
 */
export type PortalTokenType = "invite" | "magiclink" | "recovery";

/** The page a mailed token lands on, with the token in the query and nothing from outside. */
export function portalTokenUrl(tokenHash: string, type: PortalTokenType): string {
  const url = new URL(portalSetPasswordPath, businessInfo.websiteUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

export function portalLoginUrl(): string {
  return new URL(portalLoginPath, businessInfo.websiteUrl).toString();
}

type Mail = { subject: string; html: string; text: string };

function mail(input: { title: string; preheader: string; paragraphs: string[]; button?: { href: string; label: string }; closing: string[] }): Mail {
  const html = emailShell({
    locale: "nl",
    title: input.title,
    preheader: input.preheader,
    content: [
      ...input.paragraphs.map((paragraph, index) => emailText(escapeEmailHtml(paragraph), index === 0 ? { top: 18 } : {})),
      input.button ? emailButton(input.button.href, input.button.label) : "",
      ...input.closing.map((paragraph) => emailText(escapeEmailHtml(paragraph))),
    ].join(""),
  });
  const text = [input.title, "", ...input.paragraphs, ...(input.button ? ["", input.button.href] : []), "", ...input.closing, "", "YM Creations · contact@ymcreations.com"].join("\n");
  return { subject: input.title, html, text };
}

/** A new account: set a password through the link. */
export function inviteMail(input: { companyName: string; tokenHash: string }): Mail {
  return mail({
    title: `Uitnodiging voor het klantportaal van ${input.companyName}`,
    preheader: "Stel een wachtwoord in en bekijk uw zaken bij YM Creations.",
    paragraphs: [
      `U bent uitgenodigd voor het klantportaal van YM Creations, namens ${input.companyName}.`,
      "Stel via de knop hieronder een wachtwoord in. Daarna logt u in met dit e-mailadres.",
    ],
    button: { href: portalTokenUrl(input.tokenHash, "invite"), label: "Wachtwoord instellen" },
    closing: ["Verwachtte u deze uitnodiging niet? Dan kunt u deze mail negeren; er gebeurt dan niets."],
  });
}

/** An invitation renewed for a user who never set a password: a fresh link. */
export function reinviteMail(input: { companyName: string; tokenHash: string }): Mail {
  return mail({
    title: `Nieuwe link voor het klantportaal van ${input.companyName}`,
    preheader: "Uw eerdere uitnodiging is vervangen door deze link.",
    paragraphs: [
      `Hier is een nieuwe link voor het klantportaal van YM Creations, namens ${input.companyName}. Een eerdere link werkt niet meer.`,
      "Stel via de knop hieronder een wachtwoord in. Daarna logt u in met dit e-mailadres.",
    ],
    button: { href: portalTokenUrl(input.tokenHash, "magiclink"), label: "Wachtwoord instellen" },
    closing: ["Verwachtte u deze mail niet? Dan kunt u hem negeren."],
  });
}

/** An existing account given access to another customer: no token, just the door. */
export function accessGrantedMail(input: { companyName: string }): Mail {
  return mail({
    title: `Toegang tot het klantportaal van ${input.companyName}`,
    preheader: "Log in met uw bestaande wachtwoord.",
    paragraphs: [
      `Uw account bij YM Creations heeft nu toegang tot het klantportaal van ${input.companyName}.`,
      "Log in met uw bestaande e-mailadres en wachtwoord; u kunt in het portaal wisselen tussen de bedrijven waarvoor u toegang heeft.",
    ],
    button: { href: portalLoginUrl(), label: "Naar het klantportaal" },
    closing: ["Verwachtte u deze mail niet? Dan kunt u hem negeren."],
  });
}

/** A password reset the account holder asked for. */
export function passwordResetMail(input: { tokenHash: string }): Mail {
  return mail({
    title: "Nieuw wachtwoord voor het klantportaal",
    preheader: "Deze link stelt één keer een nieuw wachtwoord in.",
    paragraphs: ["Er is een nieuw wachtwoord aangevraagd voor uw account in het klantportaal van YM Creations.", "Kies via de knop hieronder een nieuw wachtwoord. De link werkt één keer."],
    button: { href: portalTokenUrl(input.tokenHash, "recovery"), label: "Nieuw wachtwoord instellen" },
    closing: ["Heeft u dit niet aangevraagd? Dan kunt u deze mail negeren; uw wachtwoord verandert niet."],
  });
}

export async function sendPortalMail(to: string, content: Mail): Promise<DeliveryResult> {
  return deliverEmail({ to, subject: content.subject, html: content.html, text: content.text });
}
