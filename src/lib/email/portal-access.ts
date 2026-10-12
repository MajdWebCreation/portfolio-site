import { businessInfo } from "@/lib/content/site-content";
import { portalRoot } from "@/lib/portal/paths";

/**
 * Where a customer finds the portal, as every mail says it.
 *
 * One address, the human one: ymcreations.com/portaal. It is derived from
 * the site's canonical URL -- a constant, never an environment variable --
 * so a mail sent from a preview or a local run still points at production
 * and never at localhost. Not signed in, /portaal sends the visitor to the
 * login page; there is no second address to promote.
 */
export const portalUrl = new URL(portalRoot, businessInfo.websiteUrl).toString();

/** The same address the way a person reads and types it. */
export const portalUrlLabel = `${new URL(businessInfo.websiteUrl).host}${portalRoot}`;

/**
 * The quiet line under a customer mail: where the portal is. Never a
 * button and never the mail's action -- paying, reading a quote, answering
 * a request stay what the mail is for. As plain text the URL is written in
 * full, since that is the only thing a text reader can act on.
 */
export const portalAccessLabel = "Klantportaal";

export function portalAccessTextLine(): string {
  return `${portalAccessLabel}: ${portalUrl}`;
}
