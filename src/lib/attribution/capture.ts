import { classifyAttribution, validateAttribution } from "@/lib/attribution/classify";
import type { Attribution } from "@/lib/attribution/types";
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
 */
export const ATTRIBUTION_STORAGE_KEY = "ym_attr";

let current: Attribution | null = null;
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

/** Only the three UTM keys the model uses are read; everything else in the query is left alone. */
function utmFrom(search: string): { source: string | null; medium: string | null; campaign: string | null } {
  const params = new URLSearchParams(search);
  return {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
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

  /* A value kept from before a reload, if the visitor allowed storage. */
  const stored = hasAnalyticsConsent() ? readStored() : null;
  if (stored) {
    current = stored;
    return current;
  }

  const utm = utmFrom(window.location.search);
  const fresh = classifyAttribution({
    referrer: document.referrer,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
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
  captured = false;
}
