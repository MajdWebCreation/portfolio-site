import { placements } from "@/lib/analytics/events";
import { trackUntypedEvent } from "@/lib/analytics/track";
import { hasMarketingConsent } from "@/lib/consent/store";
import { adsConversionTarget, googleTagConfig, type AdsConversion } from "@/lib/google/tag";
import { isLeadEventId, type LeadForm } from "@/lib/meta/event-id";
import { trackMetaLead } from "@/lib/meta/track";
import { trackingDebugLog } from "@/lib/tracking/debug";

/**
 * The three moments that count as a conversion, in one place.
 *
 *  - A lead: an enquiry the contact route accepted. Only called with the
 *    `leadEventId` from the route's success answer, which the route hands
 *    out on nothing else (not on a validation error, the honeypot or a
 *    failure). The id deduplicates: Meta gets it as the event id, Google
 *    Ads as the transaction id, and a second report of the same id is
 *    dropped here.
 *  - A tap on the business phone number.
 *  - A tap on the WhatsApp link.
 *
 * Every destination keeps its own consent gate: Google Ads and Meta need
 * marketing, the GA event needs statistics (inside `trackUntypedEvent`).
 * A destination that is not configured -- no Ads ID, no label for this
 * action -- is skipped quietly; the site never depends on it.
 */

type AdsWindow = Window & { gtag?: (...args: unknown[]) => void };

const config = googleTagConfig();
const reportedLeads = new Set<string>();

export type ContactMethod = "phone" | "whatsapp";

/** Sends one Google Ads conversion, or says why not. */
export function sendAdsConversion(kind: AdsConversion, extra: { transaction_id?: string } = {}): boolean {
  if (typeof window === "undefined") return false;
  if (!hasMarketingConsent()) {
    trackingDebugLog(`ads conversion ${kind} skipped: no marketing consent`);
    return false;
  }
  const target = adsConversionTarget(config, kind);
  if (!target) {
    trackingDebugLog(`ads conversion ${kind} skipped: Ads ID or label not configured`);
    return false;
  }
  const gtag = (window as AdsWindow).gtag;
  if (typeof gtag !== "function") {
    trackingDebugLog(`ads conversion ${kind} skipped: Google tag not running`);
    return false;
  }

  gtag("event", "conversion", { send_to: target, ...extra });
  trackingDebugLog(`ads conversion ${kind}`, { send_to: target, ...extra });
  return true;
}

/** An accepted enquiry, from any of the three forms. */
export function reportLead(input: { form: LeadForm; eventId: unknown }): void {
  if (!isLeadEventId(input.eventId) || reportedLeads.has(input.eventId)) return;
  reportedLeads.add(input.eventId);

  trackMetaLead({ form: input.form, eventId: input.eventId });
  sendAdsConversion("lead", { transaction_id: input.eventId });
}

const whatsappHosts = new Set(["wa.me", "api.whatsapp.com"]);

/** What kind of contact link an href is, if any. Only real links: `tel:` or a WhatsApp chat URL. */
export function contactMethodForHref(href: string): ContactMethod | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol === "tel:") return "phone";
  if ((url.protocol === "https:" || url.protocol === "http:") && whatsappHosts.has(url.hostname.toLowerCase())) {
    return "whatsapp";
  }
  return null;
}

/**
 * A tap on the phone number or the WhatsApp link. The GA event carries the
 * method and, when the markup names one, the placement -- never the number.
 */
export function reportContactClick(method: ContactMethod, placement?: string): void {
  /* An unknown placement is left out rather than costing the whole event. */
  const known = placement && (placements as readonly string[]).includes(placement) ? placement : undefined;
  trackUntypedEvent("contact_click", { contact_method: method, placement: known });
  sendAdsConversion(method);
}

/** Test seam. */
export function resetReportedLeads(): void {
  reportedLeads.clear();
}
