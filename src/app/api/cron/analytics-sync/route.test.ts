import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncOutcome } from "@/lib/analytics-admin/sync";

/*
  The guard on the analytics cron: no secret, no run; no configuration, a
  503 that names the variable; otherwise the summary, logged as counts and
  classes only.
*/
let outcome: SyncOutcome;
const execute = vi.fn(async () => outcome);
vi.mock("@/lib/analytics-admin/sync", () => ({
  executeAnalyticsSync: () => execute(),
}));

const { GET } = await import("@/app/api/cron/analytics-sync/route");

const secret = "cron-secret-for-tests";
const authorised = () => GET(new Request("http://localhost/api/cron/analytics-sync", { headers: { authorization: `Bearer ${secret}` } }));

let lines: unknown[][];
let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  lines = [];
  info = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => void lines.push(args));
  error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lines.push(args));
  process.env.CRON_SECRET = secret;
});

afterEach(() => {
  info.mockRestore();
  error.mockRestore();
});

describe("the analytics sync cron", () => {
  it("refuses without the secret and runs nothing", async () => {
    const response = await GET(new Request("http://localhost/api/cron/analytics-sync"));
    expect(response.status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports missing configuration by variable name", async () => {
    outcome = { ok: false, preflight: { ok: false, reason: "google_not_configured", missing: ["GA4_PROPERTY_ID"] } };
    const response = await authorised();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "google_not_configured", missing: ["GA4_PROPERTY_ID"] });
  });

  it("returns and logs the summary with counts and classes, marking a dry run as such", async () => {
    outcome = {
      ok: true,
      summary: {
        mode: "dry-run",
        window: { start: "2026-09-21", end: "2026-09-23" },
        results: [{ provider: "ga4", report: "ga4.sources", status: "ok", rows: 12, durationMs: 80 }],
      },
    };
    const response = await authorised();
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("dry-run");
    expect(JSON.stringify(lines)).toContain("dry run");
    expect(JSON.stringify(lines)).toContain('"rows":12');
    expect(JSON.stringify(lines)).not.toContain("Organic");
  });

  it("does not leak an exception message", async () => {
    execute.mockRejectedValueOnce(new Error("Bearer ya29.token in a message"));
    const response = await authorised();
    expect(response.status).toBe(500);
    expect(JSON.stringify(lines)).not.toContain("ya29");
  });
});
