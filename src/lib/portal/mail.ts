import { deliverEmail, type DeliveryResult } from "@/lib/admin/communications/provider";
import { businessInfo } from "@/lib/content/site-content";
import { portalUrl, portalUrlLabel } from "@/lib/email/portal-access";
import { emailButton, emailLink, emailNote, emailShell, emailText, escapeEmailHtml } from "@/lib/email/shell";
import { portalSetPasswordPath } from "@/lib/portal/paths";

/**
 * The mails the portal's account flows send. Branded like every other
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

type Mail = { subject: string; html: string; text: string };

/*
  Where to come back to, under the button of a mail whose button is a
  one-time link: the link sets the password once, and the customer still has
  to know where the portal is afterwards.
*/
const laterIntro = "Later inloggen? Ga naar";

function mail(input: {
  title: string;
  preheader: string;
  paragraphs: string[];
  button?: { href: string; label: string };
  /** The portal's own address under the button, for a mail whose button only works once. */
  later?: boolean;
  closing: string[];
}): Mail {
  const html = emailShell({
    locale: "nl",
    title: input.title,
    preheader: input.preheader,
    content: [
      ...input.paragraphs.map((paragraph, index) => emailText(escapeEmailHtml(paragraph), index === 0 ? { top: 18 } : {})),
      input.button ? emailButton(input.button.href, input.button.label) : "",
      input.later ? emailNote(`${escapeEmailHtml(laterIntro)} ${emailLink(portalUrl, portalUrlLabel)}`) : "",
      ...input.closing.map((paragraph) => emailText(escapeEmailHtml(paragraph))),
    ].join(""),
  });
  const text = [
    input.title,
    "",
    ...input.paragraphs,
    ...(input.button ? ["", input.button.href] : []),
    ...(input.later ? ["", `${laterIntro} ${portalUrl}`] : []),
    "",
    ...input.closing,
    "",
    "YM Creations · contact@ymcreations.com",
  ].join("\n");
  return { subject: input.title, html, text };
}

/*
  How long a link works is the Auth server's e-mail OTP expiry (one hour on
  the hosted project, checked 12 Oct 2026); the reset mail says the same.
  Past it, "Wachtwoord vergeten" mails a fresh link to an invited address too.
*/
const linkValidity = "De link werkt een uur. Is hij verlopen, vraag dan via “Wachtwoord vergeten” op de inlogpagina van het klantportaal een nieuwe aan.";

/** A new account: set a password through the link. */
export function inviteMail(input: { companyName: string; tokenHash: string }): Mail {
  return mail({
    title: `Uitnodiging voor het klantportaal van ${input.companyName}`,
    preheader: "Stel een wachtwoord in en bekijk uw zaken bij YM Creations.",
    paragraphs: [
      `U bent uitgenodigd voor het klantportaal van YM Creations, namens ${input.companyName}.`,
      "Stel via de knop hieronder een wachtwoord in. Daarna logt u in met dit e-mailadres.",
      linkValidity,
    ],
    button: { href: portalTokenUrl(input.tokenHash, "invite"), label: "Wachtwoord instellen" },
    later: true,
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
      linkValidity,
    ],
    button: { href: portalTokenUrl(input.tokenHash, "magiclink"), label: "Wachtwoord instellen" },
    later: true,
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
    button: { href: portalUrl, label: "Naar het klantportaal" },
    closing: ["Verwachtte u deze mail niet? Dan kunt u hem negeren."],
  });
}

/**
 * Sent once, after the first password was set: the mail the customer keeps,
 * that says where the portal is. Only an address and a door -- nothing about
 * the customer beyond what any portal user sees on arrival.
 */
export function welcomeMail(): Mail {
  return mail({
    title: "Uw klantportaal is gereed",
    preheader: `U logt voortaan in via ${portalUrlLabel}.`,
    paragraphs: [
      "Uw klantportaal van YM Creations is gereed.",
      `U kunt voortaan inloggen via ${portalUrlLabel}, met uw e-mailadres en het wachtwoord dat u zojuist heeft ingesteld.`,
      "Daar vindt u onder andere uw facturen, offertes, diensten, verzoeken en bedrijfsgegevens.",
    ],
    button: { href: portalUrl, label: "Klantportaal openen" },
    closing: ["Bewaar deze mail, dan weet u altijd waar het klantportaal te vinden is. Wachtwoord kwijt? Kies op de inlogpagina “Wachtwoord vergeten”."],
  });
}

/** A password reset the account holder asked for. */
export function passwordResetMail(input: { tokenHash: string; type?: "recovery" | "magiclink" }): Mail {
  return mail({
    title: "Nieuw wachtwoord voor het klantportaal",
    preheader: "Deze link stelt één keer een nieuw wachtwoord in.",
    paragraphs: [
      "Er is een nieuw wachtwoord aangevraagd voor uw account in het klantportaal van YM Creations. Deze link werkt ook als uw eerdere uitnodiging was verlopen.",
      "Kies via de knop hieronder een nieuw wachtwoord. De link werkt één keer en een uur lang; een eerdere link werkt niet meer.",
    ],
    button: { href: portalTokenUrl(input.tokenHash, input.type ?? "recovery"), label: "Nieuw wachtwoord instellen" },
    closing: ["Heeft u dit niet aangevraagd? Dan kunt u deze mail negeren; uw wachtwoord verandert niet."],
  });
}

export async function sendPortalMail(to: string, content: Mail, idempotencyKey?: string): Promise<DeliveryResult> {
  return deliverEmail({ to, subject: content.subject, html: content.html, text: content.text, ...(idempotencyKey ? { idempotencyKey } : {}) });
}
