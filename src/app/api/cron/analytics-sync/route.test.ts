import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncOutcome } from "@/lib/analytics-admin/sync";

/*
  The guard on the analytics cron: no secret, no run; a provider without
  configuration is part of a normal 200 summary; only a write switch
  without a write key is a 503; the summary is logged as counts, dates
  and classes only.
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

  it("answers 503 only when writing is on and the store cannot be written", async () => {
    outcome = { ok: false, reason: "store_not_configured", missing: ["SUPABASE_SECRET_KEY"] };
    const response = await authorised();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "store_not_configured", missing: ["SUPABASE_SECRET_KEY"] });
  });

  it("treats a provider without configuration as part of a normal run, named by variable", async () => {
    outcome = {
      ok: true,
      summary: {
        mode: "dry-run",
        providers: [
          { provider: "ga4", health: "not_configured", missing: ["GA4_PROPERTY_ID"] },
          { provider: "gsc", health: "ok" },
          { provider: "bing", health: "auth_failed" },
        ],
        results: [
          { provider: "gsc", report: "gsc.queries", status: "ok", windows: [{ start: "2026-09-19", end: "2026-09-22" }], rows: 40, durationMs: 300 },
          { provider: "bing", report: "bing.traffic", status: "failed", windows: [{ start: "2026-09-09", end: "2026-09-22" }], rows: 0, durationMs: 90, error: "auth 400" },
        ],
      },
    };
    const response = await authorised();
    expect(response.status).toBe(200);
    const logged = JSON.stringify(lines);
    expect(logged).toContain("GA4_PROPERTY_ID");
    expect(logged).toContain('"health":"auth_failed"');
    expect(logged).toContain("2026-09-19..2026-09-22");
  });

  it("returns and logs the summary with counts and classes, marking a dry run as such", async () => {
    outcome = {
      ok: true,
      summary: {
        mode: "dry-run",
        providers: [{ provider: "ga4", health: "ok" }],
        results: [{ provider: "ga4", report: "ga4.sources", status: "ok", windows: [{ start: "2026-09-21", end: "2026-09-23" }], rows: 12, durationMs: 80 }],
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
