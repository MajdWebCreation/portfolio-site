import { trackingDebugLog, trackingDryRun } from "@/lib/tracking/debug";

/**
 * The one Google tag on the public site: Google Analytics and Google Ads
 * through a single gtag.js, with Consent Mode v2.
 *
 * Consent Mode here is Google's "basic" implementation, which is what the
 * site's privacy statement promises: no Google script and no request to
 * Google before a yes. When a yes arrives (statistics, marketing, or both on
 * a return visit), the data layer gets, in this order:
 *
 *   1. `consent default` -- all four signals denied;
 *   2. `consent update`  -- exactly what the visitor chose:
 *        analytics_storage                          <- statistics
 *        ad_storage, ad_user_data, ad_personalization <- marketing
 *   3. `js` and one `config` per destination the choice allows (GA only with
 *      statistics, Ads only with marketing);
 *
 * and only then is gtag.js loaded, once. A later change of mind in the same
 * page is another `consent update`; a withdrawal of marketing also reloads
 * the page (see `decideConsent`), so the Ads destination is gone with it.
 *
 * `ads_data_redaction` is on whenever advertising storage is denied, so a GA
 * hit from a visitor who allowed statistics but not marketing carries no ad
 * click identifiers.
 *
 * Account values come from `NEXT_PUBLIC_` variables, looked up literally so
 * Next inlines them at build time. A value in the wrong shape is ignored, so
 * a missing or mistyped ID means "not configured", never a broken page.
 */

export type AdsConversion = "lead" | "phone" | "whatsapp";

export type GoogleTagConfig = {
  /** GA4 measurement ID, `G-…`. */
  measurementId?: string;
  /** Google Ads tag ID, `AW-…`. */
  adsId?: string;
  /** Conversion label per action, from the Ads conversion action's event snippet. */
  labels: Partial<Record<AdsConversion, string>>;
};

export function normalizeMeasurementId(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value && /^G-[A-Z0-9]{4,20}$/.test(value) ? value : undefined;
}

export function normalizeAdsId(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value && /^AW-\d{6,15}$/.test(value) ? value : undefined;
}

export function normalizeConversionLabel(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value && /^[A-Za-z0-9_-]{6,64}$/.test(value) ? value : undefined;
}

export function googleTagConfig(): GoogleTagConfig {
  return {
    measurementId: normalizeMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    adsId: normalizeAdsId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
    labels: {
      lead: normalizeConversionLabel(process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL),
      phone: normalizeConversionLabel(process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_LABEL),
      whatsapp: normalizeConversionLabel(process.env.NEXT_PUBLIC_GOOGLE_ADS_WHATSAPP_LABEL),
    },
  };
}

/** `AW-123/abc`, or null when the Ads ID or this action's label is missing. */
export function adsConversionTarget(config: GoogleTagConfig, kind: AdsConversion): string | null {
  const label = config.labels[kind];
  return config.adsId && label ? `${config.adsId}/${label}` : null;
}

type ConsentValue = "granted" | "denied";
export type GoogleConsentState = {
  analytics_storage: ConsentValue;
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
};

export const deniedGoogleConsent: GoogleConsentState = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

export type GoogleConsentChoice = { analytics: boolean; marketing: boolean } | null;

/** The site's two relevant categories as Google's four signals. No choice is all denied. */
export function googleConsentFor(choice: GoogleConsentChoice): GoogleConsentState {
  const value = (granted: boolean | undefined): ConsentValue => (granted ? "granted" : "denied");
  return {
    analytics_storage: value(choice?.analytics),
    ad_storage: value(choice?.marketing),
    ad_user_data: value(choice?.marketing),
    ad_personalization: value(choice?.marketing),
  };
}

/** Whether the choice allows any Google destination that is configured. */
export function googleTagAllowed(config: GoogleTagConfig, choice: GoogleConsentChoice): boolean {
  return Boolean((choice?.analytics && config.measurementId) || (choice?.marketing && config.adsId));
}

/**
 * How long Google's own cookies (`_ga`, `_ga_<id>`) live: ninety days rather
 * than gtag's default of two years, and with `cookie_update` off so a return
 * visit does not push the expiry out again. Stated in the cookie statement
 * (lib/content/cookies.ts); keep the two in step.
 */
export const GA_COOKIE_MAX_AGE_DAYS = 90;
const GA_COOKIE_MAX_AGE_SECONDS = GA_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;

export const GOOGLE_TAG_SCRIPT_ID = "ym-google-tag";

type TagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

let started = false;
let lastConsent: string | null = null;
const configured = new Set<string>();

/**
 * Brings the tag in line with the current choice. Idempotent: called after
 * every consent change, it starts the tag at most once, sends a consent
 * update only when the state really changed, and configures each
 * destination at most once.
 */
export function syncGoogleTag(input: {
  config: GoogleTagConfig;
  choice: GoogleConsentChoice;
  onLoad?: () => void;
  win?: TagWindow;
  doc?: Document;
}): void {
  const win = input.win ?? (window as TagWindow);
  const doc = input.doc ?? document;
  const { config, choice } = input;

  if (!started) {
    /* Nothing is created, loaded or queued before a choice allows it. */
    if (!googleTagAllowed(config, choice)) return;

    win.dataLayer = win.dataLayer || [];
    const dataLayer = win.dataLayer;
    win.gtag = function gtag() {
      // gtag.js reads the Arguments object itself, not an array copy of it.
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
    win.gtag("consent", "default", deniedGoogleConsent);
    started = true;
    trackingDebugLog("google consent default", deniedGoogleConsent);
  }

  const gtag = win.gtag!;
  const consent = googleConsentFor(choice);
  const consentKey = JSON.stringify(consent);
  if (consentKey !== lastConsent) {
    gtag("consent", "update", consent);
    gtag("set", "ads_data_redaction", consent.ad_storage === "denied");
    if (lastConsent === null) gtag("js", new Date());
    lastConsent = consentKey;
    trackingDebugLog("google consent update", consent);
  }

  if (choice?.analytics && config.measurementId && !configured.has(config.measurementId)) {
    gtag("config", config.measurementId, { cookie_expires: GA_COOKIE_MAX_AGE_SECONDS, cookie_update: false });
    configured.add(config.measurementId);
    trackingDebugLog(`google config ${config.measurementId}`);
  }

  if (choice?.marketing && config.adsId && !configured.has(config.adsId)) {
    gtag("config", config.adsId);
    configured.add(config.adsId);
    trackingDebugLog(`google config ${config.adsId}`);
  }

  if (configured.size === 0 || doc.getElementById(GOOGLE_TAG_SCRIPT_ID)) return;

  if (trackingDryRun()) {
    trackingDebugLog("dry run: gtag.js not loaded; inspect window.dataLayer");
    return;
  }

  /* One script for every destination: gtag.js fetches the others it is configured for. */
  const [firstId] = configured;
  const script = doc.createElement("script");
  script.id = GOOGLE_TAG_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${firstId}`;
  if (input.onLoad) script.addEventListener("load", input.onLoad);
  doc.head.appendChild(script);
}

/** Whether a destination is configured on the running tag. */
export function googleDestinationActive(id: string | undefined): boolean {
  return Boolean(id && configured.has(id));
}

/** Test seam. */
export function resetGoogleTag(): void {
  started = false;
  lastConsent = null;
  configured.clear();
}
