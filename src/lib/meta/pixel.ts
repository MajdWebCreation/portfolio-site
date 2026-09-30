import { clarityAllowedOnPath } from "@/lib/clarity/client";
import type { LeadForm } from "@/lib/meta/event-id";

/**
 * The Meta Pixel in the browser: when it may exist, how it is started, and
 * the only two events it is ever given.
 *
 * The pixel is never a default. `syncMetaPixel` starts it only when the
 * deployment names a pixel, the visitor said yes to marketing (a category of
 * its own, never implied by analytics or recordings), and the page is not one
 * of the excluded routes. Before that there is no fbq, no script element, no
 * request to connect.facebook.net or facebook.com and no `_fbp` cookie. Meta's
 * `<noscript>` image is deliberately not used: it would fire before, and
 * regardless of, any choice.
 *
 * Exactly two events leave this module:
 *  - `PageView`, once per path, on the first allowed page after consent and on
 *    every client-side navigation to another path. Meta's own history
 *    listener is switched off (`disablePushState`), so the pixel never counts
 *    a navigation by itself and nothing is counted twice. With that listener
 *    off, fbevents would also drop every PageView after the first in the same
 *    document as a duplicate (verified against the real library, 29 September
 *    2026), so `allowDuplicatePageViews` hands that decision to the per-path
 *    check below.
 *  - `Lead`, only through `sendMetaLead`, once per event id, with the form's
 *    identifier as the only parameter.
 *
 * Nothing identifying is handed to Meta from this code: `init` gets no user
 * data (no advanced matching), and automatic configuration is off, so the
 * pixel does not collect button texts or page metadata on its own.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
  /** Meta's switch for its automatic PageView on history changes. */
  disablePushState?: boolean;
  /** Without it, fbevents drops every PageView after the first in one document. */
  allowDuplicatePageViews?: boolean;
};

type MetaWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

export const META_PIXEL_SCRIPT_ID = "ym-meta-pixel";
export const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * `NEXT_PUBLIC_` values are inlined at build time, so this must stay a literal
 * lookup. A value that is not a plain numeric pixel id is ignored.
 */
export function metaPixelId(): string | undefined {
  return normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

export function normalizeMetaPixelId(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value && /^\d{10,20}$/.test(value) ? value : undefined;
}

/**
 * Where the pixel never runs, even with consent: the same routes Clarity stays
 * off, for the same reasons -- the admin, the direct-debit page whose URL
 * carries a personal token, and the payment return pages. A page URL is part
 * of every pixel event, so on these routes it must not be sent at all.
 */
export function metaPixelAllowedOnPath(pathname: string): boolean {
  return clarityAllowedOnPath(pathname);
}

let initializedPixelId: string | null = null;
/** The path the last PageView was sent for, or passed through without one. */
let lastPath: string | null = null;
const sentLeadIds = new Set<string>();

function metaWindow(): MetaWindow {
  return window as MetaWindow;
}

/**
 * Meta's documented base code, minus the automatic PageView and the
 * `<noscript>` image: a queueing stub, then the async library. Runs once per
 * page; a second call is a no-op.
 */
function startPixel(pixelId: string): void {
  const w = metaWindow();
  if (!w.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    w.fbq = fbq;
    if (!w._fbq) w._fbq = fbq;
  }
  w.fbq.disablePushState = true;
  w.fbq.allowDuplicatePageViews = true;

  if (!document.getElementById(META_PIXEL_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = META_PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = META_PIXEL_SCRIPT_SRC;
    document.head.appendChild(script);
  }

  w.fbq("set", "autoConfig", false, pixelId);
  w.fbq("init", pixelId);
  initializedPixelId = pixelId;
}

/**
 * The one entry point for the pixel's lifecycle, called whenever the consent
 * or the path changes. Starts the pixel the first time everything allows it,
 * and sends a PageView for each new path. Calling it again with the same
 * input -- a re-render, React's development double effects -- sends nothing.
 */
export function syncMetaPixel(input: { pixelId: string | undefined; marketingConsent: boolean; pathname: string }): void {
  if (typeof window === "undefined" || !input.pixelId || !input.marketingConsent) return;

  if (!metaPixelAllowedOnPath(input.pathname)) {
    /* Remembered, so returning to the previous page still counts as a new page view. */
    lastPath = input.pathname;
    return;
  }

  if (!initializedPixelId) startPixel(input.pixelId);
  if (initializedPixelId !== input.pixelId) return;

  if (input.pathname === lastPath) return;
  lastPath = input.pathname;
  metaWindow().fbq?.("track", "PageView");
}

/**
 * A Lead, once per event id, on a page the pixel runs on. The caller is
 * responsible for consent (lib/meta/track.ts); this only refuses to start a
 * pixel that is not running. The event id is passed as Meta's `eventID`, the
 * key a later server-side Conversions API event with the same id is
 * de-duplicated against.
 */
export function sendMetaLead(form: LeadForm, eventId: string): boolean {
  if (typeof window === "undefined" || !initializedPixelId) return false;
  if (!metaPixelAllowedOnPath(window.location.pathname)) return false;
  if (sentLeadIds.has(eventId)) return false;
  const fbq = metaWindow().fbq;
  if (!fbq) return false;

  sentLeadIds.add(eventId);
  try {
    fbq("track", "Lead", { content_name: form }, { eventID: eventId });
  } catch {
    /* A failing pixel must never turn an accepted inquiry into an error for the visitor. */
    return false;
  }
  return true;
}

/** Meta's first-party cookies: the browser id, and the ad click id when a visit came from an ad. */
export const metaFirstPartyCookies = ["_fbp", "_fbc"] as const;

/** What fbevents.js keeps in localStorage: the last referrer from outside the site, and when it was seen. */
export const metaLocalStorageKeys = ["lastExternalReferrer", "lastExternalReferrerTime"] as const;

/**
 * Withdrawal. `fbq('consent', 'revoke')` is Meta's documented call that stops
 * the pixel from sending; the first-party cookies and the library's
 * localStorage entries are removed as well, best effort. The caller then
 * reloads the page, so the library is not in the document any more and
 * nothing depends on a running script keeping the no.
 */
export function withdrawMetaPixel(): void {
  if (typeof window === "undefined") return;
  try {
    metaWindow().fbq?.("consent", "revoke");
  } catch {
    /* The library may be half-loaded; the cookie removal and the reload still hold. */
  }

  const present = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => (metaFirstPartyCookies as readonly string[]).includes(name));
  const host = window.location.hostname;
  const domains = [undefined, host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of present) {
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
    }
  }

  try {
    for (const key of metaLocalStorageKeys) window.localStorage.removeItem(key);
  } catch {
    /* Storage refused (private window, blocked site data): then there is nothing in it either. */
  }
}
