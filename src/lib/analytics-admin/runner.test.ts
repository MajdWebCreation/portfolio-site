import { describe, expect, it, vi } from "vitest";
import { dedupeFactRows, factKey, retentionCutoffDate, runAnalyticsSync, shiftDate, summaryLogFields, syncWindow } from "@/lib/analytics-admin/runner";
import { ProviderError, type FactRow, type FactsStore, type ProviderAdapter } from "@/lib/analytics-admin/types";

const row = (over: Partial<FactRow> = {}): FactRow => ({
  provider: "ga4",
  report: "ga4.sources",
  date: "2026-09-22",
  dims: { channel: "Organic Search", source_medium: "google / organic" },
  metrics: { sessions: 12 },
  ...over,
});

/** A store that remembers, keyed the way the database keys: idempotent by construction. */
function memoryStore() {
  const facts = new Map<string, FactRow>();
  const runs: Array<{ id: string; provider: string; report: string; status: string; rows?: number; error?: string }> = [];
  const store: FactsStore = {
    upsert: vi.fn(async (rows) => {
      for (const r of rows) facts.set(factKey(r), r);
      return rows.length;
    }),
    startRun: vi.fn(async (provider, report) => {
      const id = `run-${runs.length + 1}`;
      runs.push({ id, provider, report, status: "running" });
      return id;
    }),
    finishRun: vi.fn(async (id, outcome) => {
      const run = runs.find((r) => r.id === id);
      if (run) Object.assign(run, outcome);
    }),
    deleteOlderThan: vi.fn(async (cutoff) => {
      let deleted = 0;
      for (const [key, r] of facts) {
        if (r.date < cutoff) {
          facts.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }),
  };
  return { store, facts, runs };
}

const adapter = (reports: Record<string, () => Promise<FactRow[]>>, check?: (report: string) => Promise<void>): ProviderAdapter => ({
  key: "ga4",
  reports: Object.keys(reports),
  check,
  fetch: (report) => reports[report](),
});

const window = { start: "2026-09-20", end: "2026-09-22" };

describe("fact keys", () => {
  it("treats the same dims in another order as one row", () => {
    expect(factKey(row({ dims: { a: "1", b: "2" } }))).toBe(factKey(row({ dims: { b: "2", a: "1" } })));
    expect(factKey(row({ dims: { a: "1" } }))).not.toBe(factKey(row({ dims: { a: "2" } })));
  });

  it("dedupes a batch, last row winning", () => {
    const rows = dedupeFactRows([row({ metrics: { sessions: 1 } }), row({ metrics: { sessions: 5 } }), row({ date: "2026-09-21" })]);
    expect(rows).toHaveLength(2);
    expect(rows[0].metrics.sessions).toBe(5);
  });
});

describe("windows and cutoffs", () => {
  it("syncs the last three days including today, Amsterdam time", () => {
    expect(syncWindow(new Date("2026-09-23T04:00:00Z"))).toEqual({ start: "2026-09-21", end: "2026-09-23" });
    expect(syncWindow(new Date("2026-09-22T23:30:00Z"))).toEqual({ start: "2026-09-21", end: "2026-09-23" });
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("keeps 26 months", () => {
    expect(retentionCutoffDate(new Date("2026-09-23T12:00:00Z"))).toBe("2024-07-23");
  });
});

describe("runAnalyticsSync", () => {
  it("upserts idempotently: the same dims update, other dims are separate rows", async () => {
    const { store, facts } = memoryStore();
    const first = adapter({ "ga4.sources": async () => [row({ metrics: { sessions: 1 } }), row({ dims: { channel: "Direct", source_medium: "(direct) / (none)" } })] });
    await runAnalyticsSync({ providers: [first], store, window, apply: true });
    expect(facts.size).toBe(2);

    const second = adapter({ "ga4.sources": async () => [row({ metrics: { sessions: 9 } })] });
    await runAnalyticsSync({ providers: [second], store, window, apply: true });
    expect(facts.size).toBe(2);
    expect(facts.get(factKey(row()))?.metrics.sessions).toBe(9);
  });

  it("writes nothing in a dry run, and still counts", async () => {
    const { store, facts, runs } = memoryStore();
    const summary = await runAnalyticsSync({
      providers: [adapter({ "ga4.overview": async () => [row({ report: "ga4.overview", dims: {} }), row({ report: "ga4.overview", dims: {}, date: "2026-09-21" })] })],
      store,
      window,
      apply: false,
    });
    expect(summary.mode).toBe("dry-run");
    expect(summary.results).toEqual([expect.objectContaining({ report: "ga4.overview", status: "ok", rows: 2 })]);
    expect(summary.retention).toBeUndefined();
    expect(facts.size).toBe(0);
    expect(runs).toHaveLength(0);
    expect(store.upsert).not.toHaveBeenCalled();
    expect(store.deleteOlderThan).not.toHaveBeenCalled();
  });

  it("removes facts older than 26 months after an applied run", async () => {
    const { store, facts } = memoryStore();
    facts.set(factKey(row({ date: "2024-01-01" })), row({ date: "2024-01-01" }));
    facts.set(factKey(row({ date: "2025-01-01" })), row({ date: "2025-01-01" }));
    const summary = await runAnalyticsSync({
      providers: [adapter({ "ga4.sources": async () => [row()] })],
      store,
      window,
      apply: true,
      now: new Date("2026-09-23T12:00:00Z"),
    });
    expect(summary.retention).toEqual({ cutoff: "2024-07-23", deleted: 1 });
    expect(facts.has(factKey(row({ date: "2025-01-01" })))).toBe(true);
  });

  it("isolates a failing report: the others run, the failure is recorded as a class only", async () => {
    const { store, facts, runs } = memoryStore();
    const provider = adapter({
      "ga4.overview": async () => {
        throw new ProviderError("quota", 429);
      },
      "ga4.sources": async () => [row()],
      "ga4.geo": async () => {
        throw new Error("Bearer ya29.secret-token leaked in message");
      },
    });
    const summary = await runAnalyticsSync({ providers: [provider], store, window, apply: true });

    expect(summary.results.map((r) => [r.report, r.status, r.error])).toEqual([
      ["ga4.overview", "failed", "quota 429"],
      ["ga4.sources", "ok", undefined],
      ["ga4.geo", "failed", "unexpected"],
    ]);
    expect(facts.size).toBe(1);
    expect(runs.map((r) => [r.report, r.status, r.error])).toEqual([
      ["ga4.overview", "failed", "quota 429"],
      ["ga4.sources", "ok", undefined],
      ["ga4.geo", "failed", "unexpected"],
    ]);
    expect(JSON.stringify(summaryLogFields(summary))).not.toContain("secret");
    expect(summary.retention?.deleted).toBe(0);
  });

  it("fails a report its compatibility check refuses, without fetching it", async () => {
    const { store, facts } = memoryStore();
    const fetchSpy = vi.fn(async () => [row()]);
    const provider: ProviderAdapter = {
      key: "ga4",
      reports: ["ga4.sources"],
      check: async () => {
        throw new ProviderError("compatibility");
      },
      fetch: fetchSpy,
    };
    const summary = await runAnalyticsSync({ providers: [provider], store, window, apply: true });
    expect(summary.results[0]).toMatchObject({ status: "failed", error: "compatibility", rows: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(facts.size).toBe(0);
  });

  it("does not run retention when every report failed", async () => {
    const { store } = memoryStore();
    const summary = await runAnalyticsSync({
      providers: [
        adapter({
          "ga4.sources": async () => {
            throw new ProviderError("auth", 403);
          },
        }),
      ],
      store,
      window,
      apply: true,
    });
    expect(summary.retention).toBeUndefined();
    expect(store.deleteOlderThan).not.toHaveBeenCalled();
  });

  it("logs counts and classes only", () => {
    const fields = summaryLogFields({
      mode: "applied",
      window,
      results: [{ provider: "ga4", report: "ga4.geo", status: "ok", rows: 40, durationMs: 120 }],
      retention: { cutoff: "2024-07-23", deleted: 0 },
    });
    expect(fields).toEqual({
      mode: "applied",
      window,
      reports: [{ provider: "ga4", report: "ga4.geo", status: "ok", rows: 40, ms: 120 }],
      retention: { cutoff: "2024-07-23", deleted: 0 },
    });
  });
});
