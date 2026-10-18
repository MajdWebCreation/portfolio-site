import type { Locale } from "@/lib/content/site-content";
import { serviceDefinitions, serviceKeys, type ServiceKey } from "@/lib/content/services";

/**
 * A request sent from a service's own landing page.
 *
 * The page sends the service's key along (`service` in the payload). The key
 * is the only thing that travels: it is checked against the fixed set of
 * services, and the name the request is filed under comes from the content,
 * never from anything the browser sent. With a known service the form asks
 * for the least that still lets the request be answered: an address, a name
 * or a company, and optionally a phone number and a note.
 */
export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === "string" && (serviceKeys as readonly string[]).includes(value);
}

/** The first line of the stored message: which page the request came from. */
export function serviceRequestLine(key: ServiceKey, locale: Locale): string {
  const name = serviceDefinitions[key].locale[locale].navLabel;
  return locale === "nl" ? `Aanvraag via de pagina: ${name}` : `Request from the page: ${name}`;
}

export function serviceRequestName(key: ServiceKey, locale: Locale): string {
  return serviceDefinitions[key].locale[locale].navLabel;
}
