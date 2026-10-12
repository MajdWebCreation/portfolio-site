import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The guard on the request announcement cron: only Vercel Cron's secret
  gets in, and the answer and the log line carry counts -- never a request.
*/
const announcePendingRequests = vi.fn(async () => ({ considered: 2, sent: 1, failed: 1, skipped: 0 }));
vi.mock("@/lib/requests/announce-sweep", () => ({ announcePendingRequests: () => announcePendingRequests() }));
const notifyPendingQuoteDecisions = vi.fn(async () => ({ considered: 1, sent: 1, failed: 0, skipped: 0 }));
vi.mock("@/lib/quotes/decision-notify", () => ({ notifyPendingQuoteDecisions: () => notifyPendingQuoteDecisions() }));
vi.mock("@/lib/payments/admin-client", () => ({
  hasPaymentsAdminAccess: () => true,
  paymentsAdminClient: () => ({}),
}));

const { GET } = await import("@/app/api/cron/request-announcements/route");
const secret = "cron-secret-for-tests";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = secret;
});

describe("the request announcement cron", () => {
  it("is not found without the cron secret, and runs nothing", async () => {
    const response = await GET(new Request("http://localhost/api/cron/request-announcements", { headers: { authorization: "Bearer wrong" } }));
    expect(response.status).toBe(404);
    expect(announcePendingRequests).not.toHaveBeenCalled();
    expect(notifyPendingQuoteDecisions).not.toHaveBeenCalled();
  });

  it("runs the pass and answers with counts only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await GET(new Request("http://localhost/api/cron/request-announcements", { headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ considered: 2, sent: 1, failed: 1, skipped: 0, quoteDecisions: { considered: 1, sent: 1, failed: 0, skipped: 0 } });
    expect(info).toHaveBeenCalledWith("Request announcement run finished", { considered: 2, sent: 1, failed: 1, skipped: 0 });
    expect(info).toHaveBeenCalledWith("Quote decision mail run finished", { considered: 1, sent: 1, failed: 0, skipped: 0 });
    info.mockRestore();
  });

  it("runs the quote decision pass even when the request pass fails, and reports the failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    announcePendingRequests.mockRejectedValueOnce(new Error("db down"));
    const response = await GET(new Request("http://localhost/api/cron/request-announcements", { headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(500);
    expect(notifyPendingQuoteDecisions).toHaveBeenCalledTimes(1);
    error.mockRestore();
    info.mockRestore();
  });
});
