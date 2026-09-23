import { useSyncExternalStore } from "react";
import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  consentCookieString,
  parseConsent,
  readCookieValue,
  type ConsentDecision,
} from "@/lib/consent/consent";
import { withdrawClarity } from "@/lib/clarity/client";

/**
 * The consent choice, live, for everything in the browser that needs it.
 *
 * One module-level store rather than React context: the dialog, the footer
 * button, the script gate and `trackEvent` (which is not a component) all
 * read the same value, and none of them should have to sit under a provider
 * to do so. Components subscribe with `useConsentSnapshot`; plain code asks
 * `hasAnalyticsConsent()`.
 *
 * Before hydration the store reports "not yet read" for everyone, including
 * the server render. So the server never renders the card, a visitor who
 * chose earlier never sees it flash, and the first client render agrees with
 * the HTML it was given.
 */
export type ConsentSnapshot = {
  /** False until the cookie has been read on the client. */
  hydrated: boolean;
  decision: ConsentDecision | null;
  /** The dialog was opened from "Cookie-instellingen" and is showing preferences. */
  settingsOpen: boolean;
};

const serverSnapshot: ConsentSnapshot = { hydrated: false, decision: null, settingsOpen: false };

let snapshot: ConsentSnapshot = serverSnapshot;
const listeners = new Set<() => void>();

function publish(next: ConsentSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConsentSnapshot(): ConsentSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
}

/** Reads the cookie once. Safe to call from every component that cares. */
export function hydrateConsent(): void {
  if (snapshot.hydrated || typeof document === "undefined") return;
  publish({ ...snapshot, hydrated: true, decision: parseConsent(readCookieValue(document.cookie, CONSENT_COOKIE)) });
}

export function hasAnalyticsConsent(): boolean {
  return snapshot.decision?.analytics === true;
}

/** Microsoft Clarity: behaviour recordings, its own category. Never implied by analytics. */
export function hasRecordingsConsent(): boolean {
  return snapshot.decision?.recordings === true;
}

/**
 * The GA property, when the deployment has one. Read here and in the layout;
 * `NEXT_PUBLIC_` values are inlined at build time, so this must stay a
 * literal `process.env` lookup.
 */
export function analyticsMeasurementId(): string | undefined {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;
}

/**
 * Google's documented per-property kill switch. gtag.js checks this flag on
 * every hit, so it stops a script that has already loaded in this page
 * session without a reload -- which is what withdrawing consent needs. Set
 * back to false when consent is granted again in the same session, or a
 * re-granted visitor would be silently unmeasured until the next page load.
 */
function setAnalyticsDisabled(disabled: boolean) {
  const id = analyticsMeasurementId();
  if (!id) return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

/**
 * Best effort removal of the cookies gtag.js set. They are first-party
 * cookies on this site's own domain, so the site may expire them; the domain
 * attribute has to match how Google set them, which is the registrable
 * domain, so both spellings are tried. A cookie that survives this is
 * harmless: the kill switch above means nothing is sent anyway.
 */
function expireGoogleCookies() {
  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
  const host = window.location.hostname;
  const domains = [undefined, host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

export type ConsentChoice = { analytics: boolean; recordings: boolean };

/**
 * Records a choice: writes the cookie and lets every subscriber know.
 *
 * Each category is handled on its own. Withdrawing analytics stops Google
 * (kill switch, cookies) and leaves recordings as they are; withdrawing
 * recordings stops Clarity and leaves analytics as they are. A withdrawal of
 * recordings returns `reloadRequired`: Clarity's documented stop call is
 * made here, but the tag that already runs in this page is only truly gone
 * after a reload, which the caller then does.
 */
export function decideConsent(choice: ConsentChoice): { reloadRequired: boolean } {
  const decision: ConsentDecision = {
    version: CONSENT_VERSION,
    analytics: choice.analytics,
    recordings: choice.recordings,
    decidedAt: new Date().toISOString(),
  };
  document.cookie = consentCookieString(decision, { secure: window.location.protocol === "https:" });

  const previouslyAnalytics = snapshot.decision?.analytics === true;
  if (previouslyAnalytics && !choice.analytics) {
    setAnalyticsDisabled(true);
    expireGoogleCookies();
  } else if (choice.analytics) {
    setAnalyticsDisabled(false);
  }

  const recordingsWithdrawn = snapshot.decision?.recordings === true && !choice.recordings;
  if (recordingsWithdrawn) withdrawClarity();

  publish({ hydrated: true, decision, settingsOpen: false });
  return { reloadRequired: recordingsWithdrawn };
}

export function openConsentSettings(): void {
  publish({ ...snapshot, hydrated: true, settingsOpen: true });
}

export function closeConsentSettings(): void {
  publish({ ...snapshot, settingsOpen: false });
}

/** Test seam. */
export function resetConsentStore(): void {
  publish(serverSnapshot);
}
