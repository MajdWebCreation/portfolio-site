import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  What the contact route writes to the server log when something fails.

  Vercel keeps those lines, so a visitor's address must not be in them: the
  failure is just as readable without it. Each failure path is driven once
  and the logged payload is checked for anything that looks like an address.
*/
const storeInquiry = vi.fn();
const send = vi.fn();

vi.mock("@/lib/contact/inquiry", () => ({
  storeInquiry: (...args: unknown[]) => storeInquiry(...args),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));

/* Work scheduled with `after` (the Meta Conversions API call) is collected here and run by the test. */
const scheduled: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => {
    scheduled.push(callback);
  },
}));

const { POST } = await import("@/app/api/contact/route");
const { isLeadEventId } = await import("@/lib/meta/event-id");
const { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } = await import("@/lib/consent/consent");
const { resetRateLimits } = await import("@/lib/payments/rate-limit");

const visitor = { name: "Anna Voorbeeld", email: "anna@example.com", message: "Een bericht van twaalf tekens of meer.", locale: "nl" };

function request(body: unknown) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let logged: unknown[][];
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  logged = [];
  error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  process.env.CONTACT_TO_EMAIL = "owner@example.com";
  process.env.CONTACT_FROM_EMAIL = "YM <site@example.com>";
  process.env.RESEND_API_KEY = "re_test";
});

afterEach(() => {
  error.mockRestore();
});

function loggedText() {
  return JSON.stringify(logged, (_key, value) => (value instanceof Error ? value.message : value));
}

describe("the contact route's error log", () => {
  it("names no address when the request could not be stored", async () => {
    storeInquiry.mockRejectedValue(new Error("db down"));

    const response = await POST(request(visitor));

    expect(response.status).toBe(500);
    expect(logged).toHaveLength(1);
    expect(loggedText()).not.toMatch(/@/);
    expect(loggedText()).toContain("Storing inquiry failed");
  });

  it("names no address when the notification mail is refused", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValueOnce({ error: { name: "validation_error", message: "rejected anna@example.com", statusCode: 422 } });

    const response = await POST(request(visitor));

    /* Stored is stored: the mail is a notification, not the record. */
    expect(response.status).toBe(200);
    expect(loggedText()).toContain("Admin email failed");
    expect(loggedText()).not.toMatch(/@/);
  });

  it("names no address when the confirmation mail is refused", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValueOnce({ data: { id: "m1" } }).mockResolvedValueOnce({ error: { message: "rejected anna@example.com" } });

    const response = await POST(request(visitor));

    expect(response.status).toBe(200);
    expect(loggedText()).toContain("Customer confirmation email failed");
    expect(loggedText()).not.toMatch(/@/);
  });

  it("still sends the confirmation to the visitor when everything works", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });

    const response = await POST(request(visitor));

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ to: "anna@example.com", subject: "Je bericht is ontvangen — YM Creations" });
    /* The contact confirmation is sent as before: no reply-to was ever set on it. */
    expect(send.mock.calls[1][0]).not.toHaveProperty("replyTo");
    expect(logged).toHaveLength(0);
  });
});

describe("attribution on the request", () => {
  it("stores a checked attribution with the inquiry", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ error: null });

    const response = await POST(
      request({
        ...visitor,
        attribution: { trafficClass: "ai_assistant", trafficSource: "chatgpt.com", trafficMedium: "ai-assistant", campaign: null, landingPath: "/nl/tarieven" },
      }),
    );

    expect(response.status).toBe(200);
    expect(storeInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        attribution: { trafficClass: "ai_assistant", trafficSource: "chatgpt.com", trafficMedium: "ai-assistant", campaign: null, landingPath: "/nl/tarieven" },
      }),
    );
  });

  it("drops an attribution that does not fit and keeps the inquiry, without logging the value", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ error: null });

    for (const attribution of [
      { trafficClass: "unknown", trafficSource: null, trafficMedium: null, campaign: null, landingPath: "/nl" },
      { trafficClass: "ai_assistant", trafficSource: "evil.example", trafficMedium: null, campaign: null, landingPath: "/nl" },
      { trafficClass: "referral", trafficSource: "https://evil.example/?x=<script>", trafficMedium: null, campaign: null, landingPath: "/nl" },
      { trafficClass: "direct", trafficSource: null, trafficMedium: null, campaign: null, landingPath: "https://evil.example/" },
      "not-an-object",
    ]) {
      storeInquiry.mockClear();
      const response = await POST(request({ ...visitor, attribution }));
      expect(response.status).toBe(200);
      expect(storeInquiry).toHaveBeenCalledTimes(1);
      expect(storeInquiry.mock.calls[0][0]).toMatchObject({ attribution: null });
    }
    expect(loggedText()).not.toContain("evil.example");
  });

  it("stores no attribution when none was sent", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ error: null });
    await POST(request(visitor));
    expect(storeInquiry.mock.calls[0][0]).toMatchObject({ attribution: null });
  });
});


describe("a websitecheck request", () => {
  const websitecheck = {
    mode: "websitecheck",
    locale: "nl",
    websiteUrl: "www.Example.nl/over-ons",
    name: "Anna Voorbeeld",
    email: "Anna@Example.com",
    phone: "06 12345678",
  };

  beforeEach(() => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });
  });

  it("stores it as origin websitecheck with the normalised address, no message and the optional phone", async () => {
    const response = await POST(request(websitecheck));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, leadEventId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(storeInquiry).toHaveBeenCalledTimes(1);
    expect(storeInquiry.mock.calls[0][0]).toMatchObject({
      origin: "websitecheck",
      locale: "nl",
      name: "Anna Voorbeeld",
      email: "anna@example.com",
      phone: "06 12345678",
      message: "",
      websiteUrl: "https://www.example.nl/over-ons",
      attribution: null,
    });
    expect(storeInquiry.mock.calls[0][0].planner).toBeUndefined();
  });

  it("keeps a checked attribution, so a campaign visit stays a campaign visit", async () => {
    const attribution = { trafficClass: "campaign", trafficSource: "facebook", trafficMedium: "paid-social", campaign: "websitecheck", landingPath: "/nl/websitecheck" };

    await POST(request({ ...websitecheck, attribution }));

    expect(storeInquiry.mock.calls[0][0]).toMatchObject({ origin: "websitecheck", attribution });
  });

  it("works without a phone number and without a message", async () => {
    const response = await POST(request({ mode: "websitecheck", locale: "nl", websiteUrl: "example.nl", name: "Anna", email: "anna@example.com" }));

    expect(response.status).toBe(200);
    expect(storeInquiry.mock.calls[0][0]).toMatchObject({ origin: "websitecheck", phone: "", websiteUrl: "https://example.nl/" });
  });

  it("refuses an address that is not a website, and stores nothing", async () => {
    for (const websiteUrl of ["", "jouwbedrijf", "anna@example.com", "javascript:alert(1)", undefined]) {
      storeInquiry.mockClear();
      const response = await POST(request({ ...websitecheck, websiteUrl }));
      const body = await response.json();

      expect(response.status, String(websiteUrl)).toBe(400);
      expect(body.fieldErrors).toHaveProperty("websiteUrl");
      expect(storeInquiry).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("refuses a missing name, an invalid address or a phone number that is not one", async () => {
    const response = await POST(request({ ...websitecheck, name: "A", email: "nope", phone: "bel me" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(Object.keys(body.fieldErrors).sort()).toEqual(["email", "name", "phone"]);
    expect(storeInquiry).not.toHaveBeenCalled();
  });

  it("reports a failed store as a failure, before any mail", async () => {
    storeInquiry.mockRejectedValue(new Error("db down"));

    const response = await POST(request(websitecheck));

    expect(response.status).toBe(500);
    expect(send).not.toHaveBeenCalled();
    expect(loggedText()).not.toMatch(/@/);
  });

  it("names the site in the notification and confirms to the visitor", async () => {
    await POST(request(websitecheck));

    expect(send).toHaveBeenCalledTimes(2);
    const [notification, confirmation] = send.mock.calls.map((call) => call[0]);

    expect(notification).toMatchObject({ to: "owner@example.com", replyTo: "anna@example.com", subject: "Nieuwe websitecheck-aanvraag — example.nl" });
    expect(notification.text).toContain("Website: https://www.example.nl/over-ons");
    expect(notification.text).toContain("Phone: 06 12345678");
    expect(notification.html).toContain("New websitecheck request");
    expect(notification.html).not.toContain("Message:");

    expect(confirmation).toMatchObject({ to: "anna@example.com", replyTo: "owner@example.com", subject: "Je websitecheck-aanvraag is ontvangen" });
    expect(confirmation.text).toContain("Hallo Anna Voorbeeld,");
    expect(confirmation.text).toContain("example.nl");
    expect(confirmation.text).not.toMatch(/24 uur|korting|€/);
  });

  it("discards a submission that filled the honeypot", async () => {
    const response = await POST(request({ ...websitecheck, website: "http://spam.example" }));

    expect(response.status).toBe(200);
    expect(storeInquiry).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the existing origins after the websitecheck extension", () => {
  beforeEach(() => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });
  });

  it("still stores a contact request as contact, ignoring a website address", async () => {
    const response = await POST(request({ ...visitor, websiteUrl: "example.nl" }));

    expect(response.status).toBe(200);
    expect(storeInquiry.mock.calls[0][0]).toMatchObject({ origin: "contact", message: visitor.message, websiteUrl: "" });
  });

  it("still refuses a short contact message", async () => {
    const response = await POST(request({ ...visitor, message: "kort" }));
    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty("message");
  });

  it("treats an unknown mode as contact", async () => {
    await POST(request({ ...visitor, mode: "something_else" }));
    expect(storeInquiry.mock.calls[0][0]).toMatchObject({ origin: "contact" });
  });
});

/*
  The lead event id is what makes the browser report a Meta Lead
  (lib/meta/track.ts). It must exist on a stored, notified, confirmed
  inquiry, and on nothing else.
*/
describe("the lead event id", () => {
  beforeEach(() => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });
  });

  it("comes with every accepted inquiry, one fresh id each time, for all three origins", async () => {
    const ids = new Set<string>();
    for (const body of [
      visitor,
      { mode: "websitecheck", locale: "nl", websiteUrl: "example.nl", name: "Anna", email: "anna@example.com" },
      {
        mode: "project_planner",
        locale: "nl",
        name: "Anna",
        email: "anna@example.com",
        message: "Een webapplicatie met boekingen.",
        planner: {
          projectTypeKey: "smart",
          smartScopeSelected: true,
          launchTimelineKey: "within_3_months",
          contentReadyKey: "ready",
          brandingReadyKey: "ready",
          priorityKey: "conversion",
          businessDeclaration: true,
        },
      },
    ]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await POST(request(body));
        const json = await response.json();
        expect(response.status).toBe(200);
        expect(isLeadEventId(json.leadEventId)).toBe(true);
        ids.add(json.leadEventId);
      }
    }
    expect(ids.size).toBe(6);
  });

  it("never comes with the honeypot's answer", async () => {
    const response = await POST(request({ ...visitor, website: "http://spam.example" }));
    expect(await response.json()).toEqual({ ok: true });
  });

  it("never comes with a refusal", async () => {
    const response = await POST(request({ ...visitor, email: "nope" }));
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty("leadEventId");
  });

  it("never comes with a failed store", async () => {
    storeInquiry.mockRejectedValueOnce(new Error("db down"));
    const failedStore = await POST(request(visitor));
    expect(failedStore.status).toBe(500);
    expect(await failedStore.json()).not.toHaveProperty("leadEventId");
  });

  it("does come with a stored inquiry whose mail failed: the lead exists, and a retry would only duplicate it", async () => {
    send.mockResolvedValueOnce({ error: { message: "Resend says no" } });
    const failedAdminMail = await POST(request(visitor));
    expect(failedAdminMail.status).toBe(200);
    const adminJson = await failedAdminMail.json();
    expect(isLeadEventId(adminJson.leadEventId)).toBe(true);
    /* Resend's own text never reaches the visitor. */
    expect(JSON.stringify(adminJson)).not.toContain("Resend says no");

    send.mockResolvedValueOnce({ data: { id: "m1" } }).mockResolvedValueOnce({ error: { message: "rejected" } });
    const failedConfirmation = await POST(request(visitor));
    expect(failedConfirmation.status).toBe(200);
    expect(isLeadEventId((await failedConfirmation.json()).leadEventId)).toBe(true);

    send.mockRejectedValueOnce(new Error("network"));
    const thrown = await POST(request(visitor));
    expect(thrown.status).toBe(200);
    expect(storeInquiry).toHaveBeenCalledTimes(3);
  });

  it("does come when the mail configuration is missing, after storing", async () => {
    delete process.env.RESEND_API_KEY;
    const response = await POST(request(visitor));
    expect(response.status).toBe(200);
    expect(storeInquiry).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(loggedText()).toContain("missing mail configuration");
  });
});

/*
  The server half of the Lead (lib/meta/capi.ts), through the route. Meta is
  a vi.fn on the global fetch; nothing leaves the test.
*/
describe("the Conversions API Lead", () => {
  const TOKEN = "fake-capi-token-for-route-tests";
  const FBP = "fb.1.1759140000000.1116446470";
  const FBC = "fb.1.1759140000000.IwAR2F4dbP0l7Mn1IawQQ";
  let metaFetch: ReturnType<typeof vi.fn>;

  function consentCookie(marketing: boolean) {
    const value = serializeConsent({ version: CONSENT_VERSION, analytics: true, recordings: false, marketing, decidedAt: new Date().toISOString() });
    return `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;
  }

  function leadRequest(body: unknown, cookie?: string) {
    return new Request("https://www.ymcreations.com/api/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Macintosh) Chrome/140",
        referer: "https://www.ymcreations.com/nl/contact",
        "x-forwarded-for": "203.0.113.7",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function runScheduled() {
    await Promise.all(scheduled.splice(0).map((callback) => callback()));
  }

  function metaBodies() {
    return metaFetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  }

  beforeEach(() => {
    scheduled.length = 0;
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1119790594057101";
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = TOKEN;
    metaFetch = vi.fn(async () => new Response(JSON.stringify({ events_received: 1, messages: [], fbtrace_id: "T1" }), { status: 200 }));
    vi.stubGlobal("fetch", metaFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
    delete process.env.META_CONVERSIONS_API_TEST_EVENT_CODE;
  });

  it("A: sends nothing to Meta without a consent cookie, while the inquiry succeeds", async () => {
    const response = await POST(leadRequest(visitor, `_fbp=${FBP}`));
    await runScheduled();
    expect(response.status).toBe(200);
    expect(scheduled).toEqual([]);
    expect(metaFetch).not.toHaveBeenCalled();
  });

  it("B: sends nothing to Meta when marketing was refused", async () => {
    await POST(leadRequest(visitor, `${consentCookie(false)}; _fbp=${FBP}`));
    await runScheduled();
    expect(metaFetch).not.toHaveBeenCalled();
  });

  it("C + L: sends exactly one website Lead under the very id the browser gets", async () => {
    const response = await POST(leadRequest(visitor, consentCookie(true)));
    const { leadEventId } = await response.json();
    await runScheduled();

    expect(metaFetch).toHaveBeenCalledTimes(1);
    const [event] = metaBodies()[0].data;
    expect(event).toMatchObject({ event_name: "Lead", action_source: "website", event_id: leadEventId, event_source_url: "https://www.ymcreations.com/nl/contact" });
    expect(event.custom_data).toEqual({ content_name: "contact" });
  });

  it("sends no form content: the Lead's only visitor data is browser data", async () => {
    await POST(leadRequest({ ...visitor, company: "Voorbeeld BV", phone: "0612345678" }, consentCookie(true)));
    await runScheduled();
    const sent = JSON.stringify(metaBodies());
    for (const typed of ["Anna", "anna@example.com", "twaalf tekens", "Voorbeeld BV", "0612345678"]) expect(sent).not.toContain(typed);
    expect(Object.keys(metaBodies()[0].data[0].user_data).sort()).toEqual(["client_ip_address", "client_user_agent"]);
  });

  it("D: sends no Lead when storing failed or the request was refused", async () => {
    storeInquiry.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(leadRequest(visitor, consentCookie(true)))).status).toBe(500);

    expect((await POST(leadRequest({ ...visitor, email: "nope" }, consentCookie(true)))).status).toBe(400);

    await runScheduled();
    expect(metaFetch).not.toHaveBeenCalled();
  });

  it("E: sends no Lead for the honeypot's fake success", async () => {
    const response = await POST(leadRequest({ ...visitor, website: "http://spam.example" }, consentCookie(true)));
    await runScheduled();
    expect(await response.json()).toEqual({ ok: true });
    expect(metaFetch).not.toHaveBeenCalled();
  });

  it("F: keeps the inquiry successful when Meta refuses, and logs no secret", async () => {
    metaFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: `bad ${TOKEN}`, code: 190, fbtrace_id: "T2" } }), { status: 401 }));

    const response = await POST(leadRequest(visitor, consentCookie(true)));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    await expect(runScheduled()).resolves.toBeUndefined();

    expect(metaFetch).toHaveBeenCalledTimes(1);
    expect(loggedText()).toContain("Meta CAPI Lead failed");
    expect(loggedText()).not.toContain(TOKEN);
    expect(loggedText()).not.toMatch(/@/);
  });

  it("G: answers the visitor before Meta does, so a hanging Meta cannot hold the inquiry", async () => {
    metaFetch.mockImplementation(() => new Promise<Response>(() => {}));

    const response = await POST(leadRequest(visitor, consentCookie(true)));
    expect(response.status).toBe(200);
    expect(isLeadEventId((await response.json()).leadEventId)).toBe(true);
    /* The Meta request only starts once the response exists; its own timeout is tested in capi.test.ts. */
    expect(metaFetch).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    scheduled.length = 0;
  });

  it("H + I: passes _fbp and _fbc when the cookies exist, omits them when not", async () => {
    await POST(leadRequest(visitor, `${consentCookie(true)}; _fbp=${FBP}; _fbc=${FBC}`));
    await POST(leadRequest(visitor, consentCookie(true)));
    await runScheduled();

    const [withCookies, without] = metaBodies().map((body) => body.data[0].user_data);
    expect(withCookies).toMatchObject({ fbp: FBP, fbc: FBC });
    expect(without).not.toHaveProperty("fbp");
    expect(without).not.toHaveProperty("fbc");
  });

  it("J + K: carries test_event_code only while the variable is set", async () => {
    process.env.META_CONVERSIONS_API_TEST_EVENT_CODE = "TEST12345";
    await POST(leadRequest(visitor, consentCookie(true)));
    await runScheduled();
    delete process.env.META_CONVERSIONS_API_TEST_EVENT_CODE;
    await POST(leadRequest(visitor, consentCookie(true)));
    await runScheduled();

    const [test, production] = metaBodies();
    expect(test.test_event_code).toBe("TEST12345");
    expect(production).not.toHaveProperty("test_event_code");
  });

  it("sends nothing while the token is not configured", async () => {
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
    const response = await POST(leadRequest(visitor, consentCookie(true)));
    await runScheduled();
    expect(response.status).toBe(200);
    expect(metaFetch).not.toHaveBeenCalled();
  });
});

/*
  Paid search attribution: utm_term/utm_content travel with the checked
  attribution; the Google Ads click identifiers are kept only when the
  request's own consent cookie says yes to marketing.
*/
describe("Google Ads attribution on the request", () => {
  const GCLID = "Cj0KCQjw_test-GCLID_abc123BwE";
  const paid = {
    trafficClass: "campaign",
    trafficSource: "google",
    trafficMedium: "cpc",
    campaign: "search-website-laten-maken",
    term: "website laten maken",
    content: "rsa-1",
    landingPath: "/nl/diensten/website-laten-maken",
  };

  function withConsent(body: unknown, marketing: boolean | null) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (marketing !== null) {
      const value = serializeConsent({ version: CONSENT_VERSION, analytics: false, recordings: false, marketing, decidedAt: new Date().toISOString() });
      headers.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;
    }
    return new Request("http://localhost/api/contact", { method: "POST", headers, body: JSON.stringify(body) });
  }

  beforeEach(() => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });
  });

  it("stores the click id with marketing consent, together with term and content", async () => {
    const response = await POST(withConsent({ ...visitor, attribution: paid, adClickIds: { gclid: GCLID } }, true));
    expect(response.status).toBe(200);
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ attribution: paid, adClickIds: { gclid: GCLID } }));
  });

  it("drops the click id without marketing consent, or without any choice, and keeps the channel", async () => {
    for (const marketing of [false, null]) {
      storeInquiry.mockClear();
      await POST(withConsent({ ...visitor, attribution: paid, adClickIds: { gclid: GCLID } }, marketing));
      expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ attribution: paid, adClickIds: null }));
    }
  });

  it("stores the same lead event id it returns, so the row and Google Ads / Meta name one event", async () => {
    const response = await POST(withConsent({ ...visitor, attribution: paid, adClickIds: { gclid: GCLID } }, true));
    const json = await response.json();
    expect(isLeadEventId(json.leadEventId)).toBe(true);
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ leadEventId: json.leadEventId }));
  });

  it("stores the consent snapshot the request carried: yes, no, or nothing", async () => {
    const decidedAt = "2026-09-30T18:00:00Z";
    for (const marketing of [true, false]) {
      storeInquiry.mockClear();
      const value = serializeConsent({ version: CONSENT_VERSION, analytics: false, recordings: false, marketing, decidedAt });
      await POST(
        new Request("http://localhost/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: `${CONSENT_COOKIE}=${encodeURIComponent(value)}` },
          body: JSON.stringify(visitor),
        }),
      );
      expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ consent: { marketing, version: CONSENT_VERSION, decidedAt } }));
    }

    storeInquiry.mockClear();
    await POST(withConsent(visitor, null));
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ consent: null }));

    /* An outdated version is no current choice. */
    storeInquiry.mockClear();
    const stale = serializeConsent({ version: CONSENT_VERSION - 1, analytics: true, recordings: true, marketing: true, decidedAt });
    await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `${CONSENT_COOKIE}=${encodeURIComponent(stale)}` },
        body: JSON.stringify({ ...visitor, adClickIds: { gclid: GCLID } }),
      }),
    );
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ consent: null, adClickIds: null }));
  });

  it("keeps the ad group id and match type of an attributed request, and refuses them tampered", async () => {
    await POST(withConsent({ ...visitor, attribution: { ...paid, adgroupId: "112233445566", matchType: "e" } }, true));
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ attribution: { ...paid, adgroupId: "112233445566", matchType: "e" } }));

    storeInquiry.mockClear();
    await POST(withConsent({ ...visitor, attribution: { ...paid, adgroupId: "<script>" } }, true));
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ attribution: null }));
    expect(loggedText()).not.toContain("script");
  });

  it("drops a click id that is not shaped like one, and never logs it", async () => {
    await POST(withConsent({ ...visitor, adClickIds: { gclid: "<script>alert(1)</script>", wbraid: "short" } }, true));
    expect(storeInquiry).toHaveBeenCalledWith(expect.objectContaining({ adClickIds: null }));
    expect(loggedText()).not.toContain("script");
  });
});

describe("rate limiting", () => {
  beforeEach(() => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValue({ data: { id: "m1" } });
  });

  function from(ip: string) {
    return new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(visitor),
    });
  }

  it("answers 429 after the limit, per address, before storing anything", async () => {
    for (let i = 0; i < 6; i++) expect((await POST(from("203.0.113.9"))).status).toBe(200);
    const refused = await POST(from("203.0.113.9"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await refused.json()).not.toHaveProperty("leadEventId");
    expect(storeInquiry).toHaveBeenCalledTimes(6);

    /* Another visitor is not affected. */
    expect((await POST(from("198.51.100.4"))).status).toBe(200);
  });
});
