import { classifyAttribution, cleanAdClickIds, validateAttribution } from "@/lib/attribution/classify";
import type { AdClickIds, Attribution } from "@/lib/attribution/types";
import { hasAnalyticsConsent, hydrateConsent } from "@/lib/consent/store";

/**
 * The attribution of this visit, held in the browser.
 *
 * First touch: the first external source seen is the one that counts, for
 * as long as the page lives. Client-side navigation keeps the module and
 * with it the value; a later capture (a component mounting on a next page)
 * finds the value already there and changes nothing. The site's own pages
 * as referrer, which is what a hard reload looks like, never overwrite a
 * real source either.
 *
 * Storage follows the consent choice, not the other way round. Before a
 * yes there is only this module's memory: no sessionStorage, no
 * localStorage, no cookie -- so a hard reload without consent loses the
 * source, by design. After a yes the same small value is written to
 * sessionStorage so a reload keeps it; withdrawal removes it again. The
 * consent store does not know this module; `syncAttributionStorage` is
 * called by the code that changes consent.
 *
 * One exception to first touch: a landing URL that carries its own campaign
 * signal (a UTM source or a Google Ads click identifier) wins over a value
 * kept from earlier in the same tab. An ad click is a new, deliberate
 * arrival, and recording it under an earlier organic visit would hide what
 * the ad did.
 *
 * Google Ads click identifiers (`gclid`, `gbraid`, `wbraid`) are held in
 * memory only, never written to any storage: they go with an inquiry to the
 * contact route, which keeps them only when the request carries a yes to
 * marketing.
 */
export const ATTRIBUTION_STORAGE_KEY = "ym_attr";

let current: Attribution | null = null;
let clickIds: AdClickIds | null = null;
let captured = false;

function readStored(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    return validateAttribution(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStored(value: Attribution | null): void {
  try {
    if (value) window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // Storage refused (private window, blocked site data): memory is enough.
  }
}

/**
 * Only the five UTM keys, Google Ads' `adgroup_id` and `match_type` (the
 * account's Final URL suffix appends them) and Google's click identifiers are
 * read; everything else in the query is left alone.
 */
function utmFrom(search: string) {
  const params = new URLSearchParams(search);
  return {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    term: params.get("utm_term"),
    content: params.get("utm_content"),
    adgroupId: params.get("adgroup_id"),
    matchType: params.get("match_type"),
    clickIds: cleanAdClickIds({ gclid: params.get("gclid"), gbraid: params.get("gbraid"), wbraid: params.get("wbraid") }),
  };
}

/**
 * Reads the referrer and the URL once per page life. Safe to call from
 * every component that wants the value; the first call decides.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  if (captured) return current;
  captured = true;

  /*
    The consent cookie is read here and not left to the consent components:
    this runs from the first effect on the page, before those have mounted,
    and a stored value must not be missed because the answer was not in yet.
  */
  hydrateConsent();

  const utm = utmFrom(window.location.search);
  clickIds = utm.clickIds;
  const campaignSignal = Boolean(utm.source?.trim() || clickIds);

  /* A value kept from before a reload, if the visitor allowed storage -- unless this URL is a campaign arrival of its own. */
  const stored = hasAnalyticsConsent() && !campaignSignal ? readStored() : null;
  if (stored) {
    current = stored;
    return current;
  }

  const fresh = classifyAttribution({
    referrer: document.referrer,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
    utmTerm: utm.term,
    utmContent: utm.content,
    adgroupId: utm.adgroupId,
    matchType: utm.matchType,
    googleAdClick: clickIds !== null,
    ownHostname: window.location.hostname,
    landingPath: window.location.pathname,
  });

  current = fresh;
  if (hasAnalyticsConsent()) writeStored(current);
  return current;
}

/** The attribution as captured; null before capture or when nothing usable was seen. */
export function currentAttribution(): Attribution | null {
  return current;
}

/** The Google Ads click identifiers of the landing URL, from memory; null when there were none. */
export function currentAdClickIds(): AdClickIds | null {
  return clickIds;
}

/**
 * What an inquiry carries about the visit, for the three forms: the
 * attribution and the click identifiers, each left out when absent. The
 * contact route checks both again.
 */
export function attributionPayload(): { attribution?: Attribution; adClickIds?: AdClickIds } {
  return {
    ...(current ? { attribution: current } : {}),
    ...(clickIds ? { adClickIds: clickIds } : {}),
  };
}

/**
 * Called when consent changes. A yes writes what is in memory; a no removes
 * what was written. Idempotent, and a no-op before anything was captured.
 */
export function syncAttributionStorage(analyticsGranted: boolean): void {
  if (typeof window === "undefined") return;
  if (analyticsGranted) {
    if (current) writeStored(current);
  } else {
    writeStored(null);
  }
}

/** Test seam. */
export function resetAttributionCapture(): void {
  current = null;
  clickIds = null;
  captured = false;
}
