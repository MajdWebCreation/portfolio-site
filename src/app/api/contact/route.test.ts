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

const { POST } = await import("@/app/api/contact/route");

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
    send.mockResolvedValueOnce({ error: { message: "rejected" } });

    const response = await POST(request(visitor));

    expect(response.status).toBe(500);
    expect(loggedText()).toContain("Admin email failed");
    expect(loggedText()).not.toMatch(/@/);
  });

  it("names no address when the confirmation mail is refused", async () => {
    storeInquiry.mockResolvedValue(undefined);
    send.mockResolvedValueOnce({ data: { id: "m1" } }).mockResolvedValueOnce({ error: { message: "rejected" } });

    const response = await POST(request(visitor));

    expect(response.status).toBe(500);
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
    expect(await response.json()).toEqual({ ok: true });
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
