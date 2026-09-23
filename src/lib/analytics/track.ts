import { type AnalyticsEventName, type EventParams } from "@/lib/analytics/events";
import { guardEvent } from "@/lib/analytics/guard";
import { localeFromPath, pageTypeFromPath } from "@/lib/analytics/page-type";
import { hasAnalyticsConsent } from "@/lib/consent/store";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Sends one event to Google Analytics, or does not.
 *
 * Three gates, in order:
 *
 *  1. Consent. Without the visitor's yes the event is dropped -- not
 *     buffered, not pushed to a data layer for later. gtag.js drains its
 *     queue the moment it loads, so anything kept now would be sent the
 *     moment the visitor said yes, about something they did while the
 *     answer was still no.
 *  2. The guard. Only a registered event with registered parameters in the
 *     shape the register demands; see guard.ts.
 *  3. Delivery. Straight to `gtag('event')` when the tag is there. In the
 *     short moment after a yes and before the tag has executed (one render
 *     and one script), events wait in a small in-memory list that the tag
 *     drains once it is ready. That list only ever holds events from after
 *     the yes, and is emptied again should consent be withdrawn before it
 *     drains.
 *
 * `locale` and `page_type` are added here from the current path, so no call
 * site has to know or repeat them. The event goes through `gtag` only: no
 * separate object push on `dataLayer`, which gtag.js would ignore anyway.
 */
const pending: Array<{ name: string; params: Record<string, string | number> }> = [];
const isDev = process.env.NODE_ENV !== "production";

function commonParams(): Record<string, string> {
  const path = window.location.pathname;
  return { locale: localeFromPath(path), page_type: pageTypeFromPath(path) };
}

function deliver(name: string, params: Record<string, string | number>): void {
  if (typeof window.gtag === "function") {
    flushPendingEvents();
    window.gtag("event", name, params);
    return;
  }
  pending.push({ name, params });
}

export function trackEvent<N extends AnalyticsEventName>(name: N, params: EventParams<N>): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  const result = guardEvent(name, { ...commonParams(), ...params });
  if (!result.ok) {
    if (isDev) console.warn(`[analytics] dropped: ${result.reason}`);
    return;
  }

  deliver(result.name, result.params);
}

/**
 * For events that arrive as attributes off the DOM rather than as typed
 * calls: same gates, but the name is a string until the guard says otherwise.
 */
export function trackUntypedEvent(name: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  const result = guardEvent(name, { ...commonParams(), ...params });
  if (!result.ok) {
    if (isDev) console.warn(`[analytics] dropped: ${result.reason}`);
    return;
  }

  deliver(result.name, result.params);
}

/**
 * Called by the tag once `gtag` exists. Drops everything if consent went
 * away in the meantime; keeps everything if the tag is not there yet (the
 * call can come from a mount before the inline script has run), so a later
 * call or the next delivered event hands it over.
 */
export function flushPendingEvents(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) {
    pending.length = 0;
    return;
  }
  if (typeof window.gtag !== "function") return;
  while (pending.length > 0) {
    const next = pending.shift();
    if (next) window.gtag("event", next.name, next.params);
  }
}

/** Test seam. */
export function pendingEventCount(): number {
  return pending.length;
}

/** Test seam. */
export function resetPendingEvents(): void {
  pending.length = 0;
}
