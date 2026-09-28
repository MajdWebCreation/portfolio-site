import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent/consent";
import { buildMetaLeadEvent, META_GRAPH_API_VERSION, metaCapiConfig, sendMetaLead, type MetaLeadEvent } from "@/lib/meta/capi";

/*
  The Conversions API Lead, built from a request and sent to a stand-in
  fetch. No test ever reaches Meta: every fetch here is a vi.fn.
*/
const PIXEL = "1119790594057101";
const TOKEN = "fake-capi-token-for-tests-only";
const EVENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const now = new Date("2026-09-29T10:00:00.000Z");
const FBP = "fb.1.1759140000000.1116446470";
const FBC = "fb.1.1759140000000.IwAR2F4-dbP0l7Mn1IawQQGCINEz7PYXQvwjNwB_qa2ofrHyiLjcbCRxTDMgk";

function consentCookie(marketing: boolean) {
  const value = serializeConsent({ version: CONSENT_VERSION, analytics: false, recordings: false, marketing, decidedAt: "2026-09-29T09:00:00Z" });
  return `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;
}

function request(headers: Record<string, string>) {
  return new Request("https://www.ymcreations.com/api/contact", {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh) Chrome/140",
      referer: "https://www.ymcreations.com/nl/websitecheck?utm_source=facebook&fbclid=abc#websitecheck-form",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      ...headers,
    },
  });
}

const build = (headers: Record<string, string>) => buildMetaLeadEvent({ request: request(headers), eventId: EVENT_ID, form: "websitecheck", now });

let logged: unknown[][];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
  delete process.env.META_CONVERSIONS_API_TEST_EVENT_CODE;
});

describe("consent", () => {
  it("builds nothing without a consent cookie", () => {
    expect(build({})).toBeNull();
  });

  it("builds nothing when marketing was refused", () => {
    expect(build({ cookie: `${consentCookie(false)}; _fbp=${FBP}` })).toBeNull();
  });

  it("builds nothing for an outdated or garbled choice", () => {
    expect(build({ cookie: `${CONSENT_COOKIE}=${encodeURIComponent("2.a1.r1.2026-09-29T09:00:00Z")}` })).toBeNull();
    expect(build({ cookie: `${CONSENT_COOKIE}=%E0%A4%A` })).toBeNull();
  });
});

describe("the event, with a yes to marketing", () => {
  it("is a website Lead under the given id, with the page, the request's browser data and the form only", () => {
    expect(build({ cookie: consentCookie(true) })).toEqual({
      event_name: "Lead",
      event_time: Math.floor(now.getTime() / 1000),
      event_id: EVENT_ID,
      action_source: "website",
      event_source_url: "https://www.ymcreations.com/nl/websitecheck",
      user_data: { client_user_agent: "Mozilla/5.0 (Macintosh) Chrome/140", client_ip_address: "203.0.113.7" },
      custom_data: { content_name: "websitecheck" },
    });
  });

  it("includes _fbp and _fbc exactly as the cookies hold them", () => {
    const event = build({ cookie: `${consentCookie(true)}; _fbp=${FBP}; _fbc=${FBC}` });
    expect(event?.user_data).toMatchObject({ fbp: FBP, fbc: FBC });
  });

  it("omits them when absent or not Meta's shape, and never makes one up", () => {
    const absent = build({ cookie: consentCookie(true) });
    expect(absent?.user_data).not.toHaveProperty("fbp");
    expect(absent?.user_data).not.toHaveProperty("fbc");

    const garbled = build({ cookie: `${consentCookie(true)}; _fbp=not-a-browser-id; _fbc=fb.1.x.<script>` });
    expect(garbled?.user_data).not.toHaveProperty("fbp");
    expect(garbled?.user_data).not.toHaveProperty("fbc");
  });

  it("omits an IP address that is not one", () => {
    expect(build({ cookie: consentCookie(true), "x-forwarded-for": "evil" })?.user_data).not.toHaveProperty("client_ip_address");
    expect(build({ cookie: consentCookie(true), "x-forwarded-for": "2001:db8::1" })?.user_data.client_ip_address).toBe("2001:db8::1");
  });

  it("names only a page of this site as the source, and sends nothing without one", () => {
    expect(build({ cookie: consentCookie(true), referer: "https://evil.example/nl/websitecheck" })).toBeNull();
    expect(build({ cookie: consentCookie(true), referer: "not a url" })).toBeNull();
    expect(build({ cookie: consentCookie(true), referer: "https://www.ymcreations.com/nl/incasso/token123" })).toBeNull();
    const withoutReferer = request({ cookie: consentCookie(true) });
    withoutReferer.headers.delete("referer");
    expect(buildMetaLeadEvent({ request: withoutReferer, eventId: EVENT_ID, form: "contact", now })).toBeNull();
  });

  it("sends nothing without a user agent, which Meta requires for website events", () => {
    const withoutAgent = request({ cookie: consentCookie(true) });
    withoutAgent.headers.delete("user-agent");
    expect(buildMetaLeadEvent({ request: withoutAgent, eventId: EVENT_ID, form: "contact", now })).toBeNull();
  });
});

describe("configuration", () => {
  it("needs both the pixel and the server-only token", () => {
    expect(metaCapiConfig()).toBeNull();
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL;
    expect(metaCapiConfig()).toBeNull();
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = TOKEN;
    expect(metaCapiConfig()).toEqual({ datasetId: PIXEL, accessToken: TOKEN, testEventCode: undefined });
  });

  it("takes a test event code only when set, and only a plain one", () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL;
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = TOKEN;
    process.env.META_CONVERSIONS_API_TEST_EVENT_CODE = " TEST12345 ";
    expect(metaCapiConfig()?.testEventCode).toBe("TEST12345");
    process.env.META_CONVERSIONS_API_TEST_EVENT_CODE = "TEST 1; drop";
    expect(metaCapiConfig()?.testEventCode).toBeUndefined();
  });
});

describe("sending", () => {
  const event = build({ cookie: `${consentCookie(true)}; _fbp=${FBP}` }) as MetaLeadEvent;
  const config = { datasetId: PIXEL, accessToken: TOKEN, testEventCode: undefined };
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  const loggedText = () => JSON.stringify(logged);

  it("posts one event to the dataset's events edge on the pinned version, without a test code", async () => {
    const fetch = answer(200, { events_received: 1, messages: [], fbtrace_id: "Abc123" });

    expect(await sendMetaLead(event, config, { fetch })).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(`${url.origin}${url.pathname}`).toBe(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${PIXEL}/events`);
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ data: [event] });
    expect(body).not.toHaveProperty("test_event_code");
    expect(logged).toEqual([]);
  });

  it("adds test_event_code at the root when configured", async () => {
    const fetch = answer(200, { events_received: 1 });
    await sendMetaLead(event, { ...config, testEventCode: "TEST12345" }, { fetch });
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ data: [event], test_event_code: "TEST12345" });
  });

  it("reports an HTTP refusal with Meta's code and trace id only, never the token or Meta's text", async () => {
    const fetch = answer(400, {
      error: { message: `Invalid parameter for ${TOKEN} fb.1.x`, type: "OAuthException", code: 100, error_subcode: 2804003, fbtrace_id: "Trace9" },
    });

    expect(await sendMetaLead(event, config, { fetch })).toEqual({ ok: false, reason: "http_error", status: 400 });
    expect(logged).toEqual([["Meta CAPI Lead failed", { reason: "http_error", status: 400, type: "OAuthException", code: "100", subcode: "2804003", fbtraceId: "Trace9" }]]);
    expect(loggedText()).not.toContain(TOKEN);
    expect(loggedText()).not.toContain("graph.facebook.com");
    expect(loggedText()).not.toContain(FBP);
  });

  it("does not take a 200 as success unless Meta received the event", async () => {
    expect(await sendMetaLead(event, config, { fetch: answer(200, { events_received: 0 }) })).toMatchObject({ ok: false, reason: "not_received" });
    expect(await sendMetaLead(event, config, { fetch: answer(200, "<html>proxy</html>") })).toMatchObject({ ok: false, reason: "invalid_response" });
    expect(await sendMetaLead(event, config, { fetch: answer(200, "null") })).toMatchObject({ ok: false, reason: "invalid_response" });
  });

  it("gives up after the timeout instead of waiting for Meta", async () => {
    const hanging = vi.fn(() => new Promise<Response>(() => {}));
    const started = Date.now();

    expect(await sendMetaLead(event, config, { fetch: hanging, timeoutMs: 30 })).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(logged).toEqual([["Meta CAPI Lead failed", { reason: "timeout" }]]);
  });

  it("reports a network failure without the error's own text", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError(`fetch failed https://graph.facebook.com/?access_token=${TOKEN}`);
    });
    expect(await sendMetaLead(event, config, { fetch: failing })).toEqual({ ok: false, reason: "network" });
    expect(loggedText()).not.toContain(TOKEN);
  });
});
