import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  The cron endpoint. What matters here is who gets in: a route that mails
  customers may not be a button a stranger can press.
*/
const runPrenotifications = vi.fn();
const createPrenotificationStore = vi.fn();

vi.mock("@/lib/payments/prenotification-runner", () => ({
  runPrenotifications: (...args: unknown[]) => runPrenotifications(...args),
}));
vi.mock("@/lib/payments/prenotification-store", () => ({
  createPrenotificationStore: () => createPrenotificationStore(),
}));
vi.mock("@/lib/payments/prenotification-email", () => ({ sendPrenotificationMail: vi.fn() }));

const { GET, POST } = await import("@/app/api/cron/debit-prenotifications/route");

const summary = { considered: 1, announced: 1, skipped: 0, failed: 0, problems: [] };

function request(headers: Record<string, string> = {}) {
  return new Request("https://ymcreations.com/api/cron/debit-prenotifications", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  runPrenotifications.mockResolvedValue(summary);
  process.env.CRON_SECRET = "s3cret-value";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe("who may run the job", () => {
  it("runs for Vercel Cron's bearer token", async () => {
    const response = await GET(request({ authorization: "Bearer s3cret-value" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(runPrenotifications).toHaveBeenCalledTimes(1);
  });

  it("also accepts an authorised POST, for a manual rerun", async () => {
    const response = await POST(request({ authorization: "Bearer s3cret-value" }));
    expect(response.status).toBe(200);
  });

  /* A stranger learns nothing, not even that the route exists. */
  it("is invisible without the secret", async () => {
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(runPrenotifications).not.toHaveBeenCalled();
  });

  it("refuses a wrong secret", async () => {
    for (const header of ["Bearer wrong", "Bearer ", "s3cret-value", "Basic s3cret-value", "Bearer s3cret-valueX"]) {
      const response = await GET(request({ authorization: header }));
      expect(response.status).toBe(404);
    }
    expect(runPrenotifications).not.toHaveBeenCalled();
  });

  /* Without a configured secret the route refuses rather than running open. */
  it("refuses everything when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request({ authorization: "Bearer anything" }));

    expect(response.status).toBe(404);
    expect(runPrenotifications).not.toHaveBeenCalled();
  });

  it("refuses to run without the elevated database key", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const response = await GET(request({ authorization: "Bearer s3cret-value" }));

    expect(response.status).toBe(503);
    expect(runPrenotifications).not.toHaveBeenCalled();
  });

  it("answers 500 so the run can be retried when it throws", async () => {
    runPrenotifications.mockRejectedValue(new Error("database down"));
    const response = await GET(request({ authorization: "Bearer s3cret-value" }));
    expect(response.status).toBe(500);
  });
});
