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
    expect(send.mock.calls[1][0]).toMatchObject({ to: "anna@example.com" });
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

