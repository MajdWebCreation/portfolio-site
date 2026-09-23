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
