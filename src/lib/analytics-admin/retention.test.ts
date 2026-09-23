import { describe, expect, it, vi } from "vitest";
import { bingReportKeys } from "@/lib/analytics-admin/providers/bing";
import { ga4ReportKeys } from "@/lib/analytics-admin/providers/ga4";
import { gscReportKeys } from "@/lib/analytics-admin/providers/gsc";
import { clarityReportKeys } from "@/lib/analytics-admin/providers/clarity";
import { reportRetention, reportsOfClass, retentionClassOf, retentionCutoff } from "@/lib/analytics-admin/retention";
import { factKey, runAnalyticsSync } from "@/lib/analytics-admin/runner";
import type { FactRow, FactsStore, ProviderAdapter } from "@/lib/analytics-admin/types";

describe("retention classes", () => {
  it("gives every report of every provider a class, and nothing else", () => {
    expect(Object.keys(reportRetention).sort()).toEqual([...ga4ReportKeys, ...gscReportKeys, ...bingReportKeys, ...clarityReportKeys].sort());
  });

  it("keeps query text 16 months and aggregates 26", () => {
    expect(reportsOfClass("query_text").sort()).toEqual(["bing.queries", "gsc.queries", "gsc.query_page"]);
    expect(retentionClassOf("gsc.totals")).toBe("aggregate");
    expect(retentionClassOf("gsc.something_new")).toBeNull();
    expect(retentionCutoff("query_text", "2026-09-23")).toBe("2025-05-23");
    expect(retentionCutoff("aggregate", "2026-09-23")).toBe("2024-07-23");
    expect(reportsOfClass("clarity_live").sort()).toEqual(["clarity.live", "clarity.totals"]);
    expect(retentionCutoff("clarity_live", "2026-09-23")).toBe("2026-06-25");
  });
});

/** The store as the database behaves: date < cutoff, limited to the named reports when given. */
function memoryStore(initial: FactRow[]) {
  const facts = new Map(initial.map((row) => [factKey(row), row]));
  const store: FactsStore = {
    upsert: vi.fn(async (rows) => {
      for (const row of rows) facts.set(factKey(row), row);
      return rows.length;
    }),
    deleteStale: vi.fn(async () => 0),
    startRun: vi.fn(async () => "run"),
    finishRun: vi.fn(async () => undefined),
    failStaleRuns: vi.fn(async () => 0),
    deleteOlderThan: vi.fn(async (cutoff: string, reports?: readonly string[]) => {
      let deleted = 0;
      for (const [key, row] of facts) {
        if (row.date < cutoff && (!reports || reports.includes(row.report))) {
          facts.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }),
  };
  return { store, facts };
}

const fact = (report: string, date: string, dims: Record<string, string> = {}): FactRow => ({ provider: report.split(".")[0] as FactRow["provider"], report, date, dims, metrics: { clicks: 1 } });

const oneReport: ProviderAdapter = {
  key: "gsc",
  reports: ["gsc.totals"],
  plan: () => [{ phase: "recent", window: { start: "2026-09-20", end: "2026-09-22" } }],
  fetch: async () => [fact("gsc.totals", "2026-09-22")],
};

/* 23 September 2026: query facts are kept from 23 May 2025, aggregates from 23 July 2024. */
const now = new Date("2026-09-23T06:00:00Z");

describe("retention cleanup after a sync", () => {
  const history = [
    fact("gsc.queries", "2025-05-22", { query: "oude zoekopdracht" }),
    fact("gsc.queries", "2025-05-23", { query: "grensdag" }),
    fact("gsc.query_page", "2025-04-01", { query: "oud", page: "https://ymcreations.com/nl" }),
    fact("bing.queries", "2025-01-01", { query: "bing oud" }),
    fact("gsc.totals", "2025-01-01"),
    fact("gsc.pages", "2024-07-23", { page: "https://ymcreations.com/nl" }),
    fact("ga4.overview", "2024-07-22"),
  ];

  it("removes query facts after 16 months and everything else after 26, keeping the boundary days", async () => {
    const { store, facts } = memoryStore(history);
    const summary = await runAnalyticsSync({ providers: [{ key: "gsc", configured: true, adapter: oneReport }], store, apply: true, now });

    const left = [...facts.values()].map((row) => `${row.report}@${row.date}`).sort();
    expect(left).toEqual(["gsc.pages@2024-07-23", "gsc.queries@2025-05-23", "gsc.totals@2025-01-01", "gsc.totals@2026-09-22"]);
    expect(summary.retention).toEqual([
      { retentionClass: "aggregate", cutoff: "2024-07-23", deleted: 1 },
      { retentionClass: "query_text", cutoff: "2025-05-23", deleted: 3 },
      { retentionClass: "clarity_live", cutoff: "2026-06-25", deleted: 0 },
    ]);
  });

  it("deletes nothing in a dry run", async () => {
    const { store, facts } = memoryStore(history);
    const summary = await runAnalyticsSync({ providers: [{ key: "gsc", configured: true, adapter: oneReport }], store, apply: false, now });
    expect(store.deleteOlderThan).not.toHaveBeenCalled();
    expect(facts.size).toBe(history.length);
    expect(summary.retention).toBeUndefined();
  });

  it("refuses to store a query under a report that is not in the query class", async () => {
    const { store } = memoryStore([]);
    const sneaky: ProviderAdapter = { ...oneReport, fetch: async () => [fact("gsc.totals", "2026-09-22", { query: "iets" })] };
    const summary = await runAnalyticsSync({ providers: [{ key: "gsc", configured: true, adapter: sneaky }], store, apply: true, now });
    expect(summary.results[0]).toMatchObject({ status: "failed", error: "retention: unclassified query report" });
    expect(store.upsert).not.toHaveBeenCalled();
  });
});
