import { isIP } from "node:net";
import { after } from "next/server";
import { fetchWithTimeout, type ProviderResponse } from "@/lib/analytics-admin/http";
import { ProviderError } from "@/lib/analytics-admin/types";
import { CONSENT_COOKIE, parseConsent, readCookieValue } from "@/lib/consent/consent";
import type { LeadForm } from "@/lib/meta/event-id";
import { metaPixelAllowedOnPath, metaPixelId } from "@/lib/meta/pixel";

/**
 * The server half of a Meta Lead: the Conversions API.
 *
 * One accepted inquiry is one Lead, reported twice under the same id -- by
 * the browser pixel (`eventID`, lib/meta/pixel.ts) and from here
 * (`event_id`) -- so Meta counts it once. The id is the contact route's
 * `leadEventId`, passed through unchanged; this module never makes one.
 *
 * A Lead is only sent when the request that carried the inquiry also carried
 * a current yes to marketing in its own `ym_consent` cookie, read with the
 * same parser the browser uses. No cookie, a no, an outdated or garbled
 * value: nothing is read, nothing is sent.
 *
 * What Meta gets is what its pixel would have seen on that page and nothing
 * more: the page address (same origin, without query or fragment), the IP
 * address and user agent of the request, and the `_fbp`/`_fbc` cookies when
 * they exist and look like Meta's. No e-mail, phone, name or anything typed
 * into a form, hashed or not; the form's identifier is the only custom value.
 *
 * Meta is secondary to the inquiry. The request is scheduled with `after`
 * (Next's primitive for work after the response; Vercel keeps the function
 * alive for it with `waitUntil`), so the visitor never waits for Meta and a
 * Meta failure can never turn an accepted inquiry into an error. It is
 * bounded in time and never retried. A failure is logged with Meta's status,
 * error code and trace id only -- never the token, the request URL (it holds
 * the token), Meta's message text or any visitor data.
 *
 * Server only: the token is read here and nowhere else, never under a
 * NEXT_PUBLIC_ name (boundaries.test.ts), and the guard below makes a browser
 * import a crash rather than a leak.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/meta/capi.ts is server-only");
}

/**
 * The Graph API version. v26.0 is the newest on Meta's version list
 * (developers.facebook.com/docs/graph-api/changelog/versions, released
 * 29 July 2026, checked 29 September 2026). Raise it here when Meta
 * announces the end of this one.
 */
export const META_GRAPH_API_VERSION = "v26.0";

/** Generous for one small POST, and invisible to the visitor: it runs after the response. */
export const META_CAPI_TIMEOUT_MS = 5_000;

export const metaCapiEnv = {
  accessToken: "META_CONVERSIONS_API_ACCESS_TOKEN",
  testEventCode: "META_CONVERSIONS_API_TEST_EVENT_CODE",
} as const;

type MetaCapiConfig = { datasetId: string; accessToken: string; testEventCode: string | undefined };

/** Null when the pixel or the token is missing: then there is no server Lead at all. */
export function metaCapiConfig(): MetaCapiConfig | null {
  const datasetId = metaPixelId();
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN?.trim();
  if (!datasetId || !accessToken) return null;
  /* Meta's test codes are short and alphanumeric; anything else is ignored rather than sent. */
  const rawTestCode = process.env.META_CONVERSIONS_API_TEST_EVENT_CODE?.trim();
  const testEventCode = rawTestCode && /^[A-Za-z0-9]{1,64}$/.test(rawTestCode) ? rawTestCode : undefined;
  return { datasetId, accessToken, testEventCode };
}

export type MetaLeadUserData = {
  client_ip_address?: string;
  client_user_agent: string;
  fbp?: string;
  fbc?: string;
};

export type MetaLeadEvent = {
  event_name: "Lead";
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: MetaLeadUserData;
  custom_data: { content_name: LeadForm };
};

/** A cookie value, or undefined for an absent or undecodable one. */
function cookie(header: string, name: string): string | undefined {
  try {
    return readCookieValue(header, name);
  } catch {
    return undefined;
  }
}

/* `fb.<subdomain index>.<creation time in ms>.<random number | fbclid>`, as Meta documents both. */
const fbpPattern = /^fb\.\d\.\d{10,16}\.\d{1,32}$/;
const fbcPattern = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/;

/**
 * The page the inquiry was sent from, from the request's Referer: only when
 * it is this site (the same origin as the request), and only as origin plus
 * path. A route the pixel never runs on is not a source either.
 */
function eventSourceUrl(request: Request): string | undefined {
  const referer = request.headers.get("referer");
  if (!referer) return undefined;
  try {
    const page = new URL(referer);
    if (page.origin !== new URL(request.url).origin) return undefined;
    if (!metaPixelAllowedOnPath(page.pathname)) return undefined;
    return `${page.origin}${page.pathname}`;
  } catch {
    return undefined;
  }
}

/** The visitor's address as the platform's proxy reports it; Vercel overwrites X-Forwarded-For. */
function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}

/**
 * The Lead for one accepted inquiry, or null when none may or can be sent:
 * no current yes to marketing, no user agent (Meta requires it for website
 * events), or no page on this site to name as the source (also required).
 */
export function buildMetaLeadEvent(input: { request: Request; eventId: string; form: LeadForm; now?: Date }): MetaLeadEvent | null {
  const cookies = input.request.headers.get("cookie") ?? "";
  const consent = parseConsent(cookie(cookies, CONSENT_COOKIE), input.now);
  if (consent?.marketing !== true) return null;

  const userAgent = input.request.headers.get("user-agent")?.trim().slice(0, 1024);
  const sourceUrl = eventSourceUrl(input.request);
  if (!userAgent || !sourceUrl) return null;

  const userData: MetaLeadUserData = { client_user_agent: userAgent };
  const ip = clientIp(input.request);
  if (ip) userData.client_ip_address = ip;
  const fbp = cookie(cookies, "_fbp");
  if (fbp && fbpPattern.test(fbp)) userData.fbp = fbp;
  const fbc = cookie(cookies, "_fbc");
  if (fbc && fbcPattern.test(fbc)) userData.fbc = fbc;

  return {
    event_name: "Lead",
    event_time: Math.floor((input.now ?? new Date()).getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: sourceUrl,
    user_data: userData,
    custom_data: { content_name: input.form },
  };
}

export type MetaCapiOutcome =
  | { ok: true }
  | { ok: false; reason: "timeout" | "network" | "http_error" | "invalid_response" | "not_received"; status?: number };

/** Meta's answer: `{ events_received, messages, fbtrace_id }`, or `{ error: { type, code, error_subcode, fbtrace_id } }`. */
type MetaResponseBody = {
  events_received?: unknown;
  fbtrace_id?: unknown;
  error?: { type?: unknown; code?: unknown; error_subcode?: unknown; fbtrace_id?: unknown };
};

function parseBody(text: string): MetaResponseBody | null {
  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" ? (body as MetaResponseBody) : null;
  } catch {
    return null;
  }
}

/** The only fields ever logged: numbers and Meta's own identifiers, never message text. */
function diagnostic(body: MetaResponseBody | null) {
  const pick = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).slice(0, 64) : undefined);
  return {
    type: pick(body?.error?.type),
    code: pick(body?.error?.code),
    subcode: pick(body?.error?.error_subcode),
    fbtraceId: pick(body?.error?.fbtrace_id ?? body?.fbtrace_id),
  };
}

/**
 * Sends one Lead and says whether Meta took it. Never throws. A 2xx is only
 * a success when Meta also reports exactly one event received.
 */
export async function sendMetaLead(
  event: MetaLeadEvent,
  config: MetaCapiConfig,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<MetaCapiOutcome> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${config.datasetId}/events`);
  url.searchParams.set("access_token", config.accessToken);
  const body = { data: [event], ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) };

  let response: ProviderResponse;
  try {
    response = await fetchWithTimeout(
      options.fetch ?? fetch,
      url,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      options.timeoutMs ?? META_CAPI_TIMEOUT_MS,
    );
  } catch (error) {
    const reason = error instanceof ProviderError && error.kind === "timeout" ? "timeout" : "network";
    console.error("Meta CAPI Lead failed", { reason });
    return { ok: false, reason };
  }

  const parsed = parseBody(response.text);
  if (!response.ok) {
    console.error("Meta CAPI Lead failed", { reason: "http_error", status: response.status, ...diagnostic(parsed) });
    return { ok: false, reason: "http_error", status: response.status };
  }
  if (!parsed) {
    console.error("Meta CAPI Lead failed", { reason: "invalid_response", status: response.status });
    return { ok: false, reason: "invalid_response", status: response.status };
  }
  if (parsed.events_received !== 1) {
    console.error("Meta CAPI Lead failed", { reason: "not_received", status: response.status, ...diagnostic(parsed) });
    return { ok: false, reason: "not_received", status: response.status };
  }
  return { ok: true };
}

/**
 * The contact route's one call, right before it answers `{ ok: true,
 * leadEventId }`. Decides now, from the request, whether a Lead may be sent;
 * sends it after the response. Nothing here can throw into the route.
 */
export function reportMetaLead(input: { request: Request; eventId: string; form: LeadForm }): void {
  try {
    const config = metaCapiConfig();
    if (!config) return;
    const event = buildMetaLeadEvent(input);
    if (!event) return;
    after(() => sendMetaLead(event, config).then(() => undefined));
  } catch {
    console.error("Meta CAPI Lead failed", { reason: "schedule" });
  }
}
