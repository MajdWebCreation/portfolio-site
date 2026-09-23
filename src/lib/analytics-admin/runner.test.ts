import { describe, expect, it, vi } from "vitest";
import { dedupeFactRows, factKey, retentionCutoffDate, runAnalyticsSync, shiftDate, summaryLogFields, syncWindow } from "@/lib/analytics-admin/runner";
import { ProviderError, type AnalyticsProvider, type FactRow, type FactsStore, type ProviderAdapter, type ProviderEntry } from "@/lib/analytics-admin/types";

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
  const stamps = new Map<string, string>();
  const runs: Array<{ id: string; provider: string; report: string; status: string; rows?: number; error?: string }> = [];
  const store: FactsStore = {
    upsert: vi.fn(async (rows, syncedAt) => {
      for (const r of rows) {
        facts.set(factKey(r), r);
        stamps.set(factKey(r), syncedAt);
      }
      return rows.length;
    }),
    deleteStale: vi.fn(async ({ provider, report, dates, syncedAt }) => {
      let deleted = 0;
      for (const [key, r] of facts) {
        if (r.provider === provider && r.report === report && dates.includes(r.date) && (stamps.get(key) ?? "") < syncedAt) {
          facts.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }),
    startRun: vi.fn(async (provider, report) => {
      const id = `run-${runs.length + 1}`;
      runs.push({ id, provider, report, status: "running" });
      return id;
    }),
    failStaleRuns: vi.fn(async () => 0),
    finishRun: vi.fn(async (id, outcome) => {
      const run = runs.find((r) => r.id === id);
      if (run) Object.assign(run, outcome);
    }),
    deleteOlderThan: vi.fn(async (cutoff: string, reports?: readonly string[]) => {
      let deleted = 0;
      for (const [key, r] of facts) {
        if (r.date < cutoff && (!reports || reports.includes(r.report))) {
          facts.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }),
  };
  return { store, facts, runs, stamps };
}

const window = { start: "2026-09-20", end: "2026-09-22" };

const adapter = (reports: Record<string, () => Promise<FactRow[]>>, check?: (report: string) => Promise<void>, key: AnalyticsProvider = "ga4"): ProviderAdapter => ({
  key,
  reports: Object.keys(reports),
  plan: () => [{ phase: "recent", window }],
  check,
  fetch: (report) => reports[report](),
});

const on = (provider: ProviderAdapter): ProviderEntry => ({ key: provider.key, configured: true, adapter: provider });

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
    await runAnalyticsSync({ providers: [on(first)], store, apply: true });
    expect(facts.size).toBe(2);

    const second = adapter({ "ga4.sources": async () => [row({ metrics: { sessions: 9 } }), row({ dims: { channel: "Direct", source_medium: "(direct) / (none)" } })] });
    await runAnalyticsSync({ providers: [on(second)], store, apply: true });
    expect(facts.size).toBe(2);
    expect(facts.get(factKey(row()))?.metrics.sessions).toBe(9);
  });

  it("writes nothing in a dry run, and still counts", async () => {
    const { store, facts, runs } = memoryStore();
    const summary = await runAnalyticsSync({
      providers: [on(adapter({ "ga4.overview": async () => [row({ report: "ga4.overview", dims: {} }), row({ report: "ga4.overview", dims: {}, date: "2026-09-21" })] }))],
      store,
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
      providers: [on(adapter({ "ga4.sources": async () => [row()] }))],
      store,
      apply: true,
      now: new Date("2026-09-23T12:00:00Z"),
    });
    expect(summary.retention).toEqual([
      { retentionClass: "aggregate", cutoff: "2024-07-23", deleted: 1 },
      { retentionClass: "query_text", cutoff: "2025-05-23", deleted: 0 },
    ]);
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
    const summary = await runAnalyticsSync({ providers: [on(provider)], store, apply: true });

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
    expect(summary.retention?.map((entry) => entry.deleted)).toEqual([0, 0]);
  });

  it("fails a report its compatibility check refuses, without fetching it", async () => {
    const { store, facts } = memoryStore();
    const fetchSpy = vi.fn(async () => [row()]);
    const provider: ProviderAdapter = {
      key: "ga4",
      reports: ["ga4.sources"],
      plan: () => [{ phase: "recent", window }],
      check: async () => {
        throw new ProviderError("compatibility");
      },
      fetch: fetchSpy,
    };
    const summary = await runAnalyticsSync({ providers: [on(provider)], store, apply: true });
    expect(summary.results[0]).toMatchObject({ status: "failed", error: "compatibility", rows: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(facts.size).toBe(0);
  });

  it("does not run retention when every report failed", async () => {
    const { store } = memoryStore();
    const summary = await runAnalyticsSync({
      providers: [
        on(
          adapter({
            "ga4.sources": async () => {
              throw new ProviderError("auth", 403);
            },
          }),
        ),
      ],
      store,
      apply: true,
    });
    expect(summary.retention).toBeUndefined();
    expect(store.deleteOlderThan).not.toHaveBeenCalled();
  });

  it("logs counts and classes only", () => {
    const fields = summaryLogFields({
      mode: "applied",
      providers: [
        { provider: "ga4", health: "ok" },
        { provider: "bing", health: "not_configured", missing: ["BING_WEBMASTER_API_KEY"] },
      ],
      results: [{ provider: "ga4", report: "ga4.geo", status: "ok", windows: [window], rows: 40, durationMs: 120 }],
      retention: [{ retentionClass: "aggregate", cutoff: "2024-07-23", deleted: 0 }],
    });
    expect(fields).toEqual({
      mode: "applied",
      providers: [
        { provider: "ga4", health: "ok" },
        { provider: "bing", health: "not_configured", missing: ["BING_WEBMASTER_API_KEY"] },
      ],
      reports: [{ provider: "ga4", report: "ga4.geo", status: "ok", windows: ["2026-09-20..2026-09-22"], rows: 40, ms: 120 }],
      retention: [{ retentionClass: "aggregate", cutoff: "2024-07-23", deleted: 0 }],
    });
  });
});

describe("multi-provider isolation", () => {
  const gscRow = (over: Partial<FactRow> = {}): FactRow => row({ provider: "gsc", report: "gsc.totals", dims: {}, metrics: { clicks: 3 }, ...over });
  const bingRow = (over: Partial<FactRow> = {}): FactRow => row({ provider: "bing", report: "bing.traffic", dims: {}, metrics: { clicks: 1 }, ...over });
  const ga = (fail?: ProviderError) => adapter({ "ga4.overview": async () => (fail ? Promise.reject(fail) : [row({ report: "ga4.overview", dims: {} })]) });
  const gsc = (fail?: ProviderError) => adapter({ "gsc.totals": async () => (fail ? Promise.reject(fail) : [gscRow()]) }, undefined, "gsc");
  const bing = (fail?: ProviderError) => adapter({ "bing.traffic": async () => (fail ? Promise.reject(fail) : [bingRow()]) }, undefined, "bing");
  const off = (key: AnalyticsProvider, missing: string[]): ProviderEntry => ({ key, configured: false, missing });

  it("runs Search Console and Bing when GA4 is not configured", async () => {
    const { store, facts } = memoryStore();
    const summary = await runAnalyticsSync({ providers: [off("ga4", ["GA4_PROPERTY_ID"]), on(gsc()), on(bing())], store, apply: true });
    expect(summary.providers).toEqual([
      { provider: "ga4", health: "not_configured", missing: ["GA4_PROPERTY_ID"] },
      { provider: "gsc", health: "ok" },
      { provider: "bing", health: "ok" },
    ]);
    expect([...facts.values()].map((f) => f.provider).sort()).toEqual(["bing", "gsc"]);
  });

  it("runs GA4 and Bing when Search Console is not configured", async () => {
    const { store, facts } = memoryStore();
    const summary = await runAnalyticsSync({ providers: [on(ga()), off("gsc", ["GSC_SITE_URL"]), on(bing())], store, apply: true });
    expect(summary.providers.map((p) => p.health)).toEqual(["ok", "not_configured", "ok"]);
    expect([...facts.values()].map((f) => f.provider).sort()).toEqual(["bing", "ga4"]);
  });

  it("runs both Google providers when Bing is not configured", async () => {
    const { store } = memoryStore();
    const summary = await runAnalyticsSync({ providers: [on(ga()), on(gsc()), off("bing", ["BING_WEBMASTER_API_KEY", "BING_SITE_URL"])], store, apply: true });
    expect(summary.results.map((r) => [r.provider, r.status])).toEqual([
      ["ga4", "ok"],
      ["gsc", "ok"],
    ]);
  });

  it("keeps Search Console and Bing running when GA4 refuses its credentials", async () => {
    const { store } = memoryStore();
    const summary = await runAnalyticsSync({ providers: [on(ga(new ProviderError("auth", 403))), on(gsc()), on(bing())], store, apply: true });
    expect(summary.providers.map((p) => [p.provider, p.health])).toEqual([
      ["ga4", "auth_failed"],
      ["gsc", "ok"],
      ["bing", "ok"],
    ]);
  });

  it("keeps GA4 and Bing running when Search Console refuses its credentials", async () => {
    const { store } = memoryStore();
    const summary = await runAnalyticsSync({ providers: [on(ga()), on(gsc(new ProviderError("auth", 401))), on(bing())], store, apply: true });
    expect(summary.providers.map((p) => p.health)).toEqual(["ok", "auth_failed", "ok"]);
  });

  it("keeps both Google providers running when Bing fails", async () => {
    const { store } = memoryStore();
    const summary = await runAnalyticsSync({ providers: [on(ga()), on(gsc()), on(bing(new ProviderError("invalid_response")))], store, apply: true });
    expect(summary.providers.map((p) => p.health)).toEqual(["ok", "ok", "provider_error"]);
    expect(summary.retention).toBeDefined();
  });

  it("stops asking a provider that refused its credentials, and fails its other reports with the same class", async () => {
    const { store, runs } = memoryStore();
    const second = vi.fn(async () => [row()]);
    const provider = adapter({
      "ga4.overview": async () => {
        throw new ProviderError("auth", 403);
      },
      "ga4.sources": second,
    });
    /* One at a time, so the second report starts after the refusal; with more at once it may already be in flight. */
    const summary = await runAnalyticsSync({ providers: [on(provider)], store, apply: true, reportConcurrency: 1 });
    expect(second).not.toHaveBeenCalled();
    expect(summary.results.map((r) => [r.report, r.status, r.error])).toEqual([
      ["ga4.overview", "failed", "auth 403"],
      ["ga4.sources", "failed", "auth 403"],
    ]);
    expect(runs.map((r) => r.status)).toEqual(["failed", "failed"]);
  });

  it("skips a report its plan says is not due, without recording a run", async () => {
    const { store, runs } = memoryStore();
    const fetchSpy = vi.fn(async () => [row()]);
    const weekly: ProviderAdapter = { key: "bing", reports: ["bing.queries"], plan: () => [], fetch: fetchSpy };
    const summary = await runAnalyticsSync({ providers: [on(weekly)], store, apply: true });
    expect(summary.results).toEqual([expect.objectContaining({ report: "bing.queries", status: "skipped", rows: 0, windows: [] })]);
    expect(summary.providers).toEqual([{ provider: "bing", health: "ok" }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });

  it("hands every planned range to the fetch and reports the windows", async () => {
    const { store } = memoryStore();
    const seen: string[] = [];
    const twoPhase: ProviderAdapter = {
      key: "gsc",
      reports: ["gsc.totals"],
      plan: () => [
        { phase: "final", window: { start: "2026-09-12", end: "2026-09-18" } },
        { phase: "recent", window: { start: "2026-09-19", end: "2026-09-22" } },
      ],
      fetch: async (_report, plan) => {
        seen.push(`${plan.phase}:${plan.window.start}`);
        return [gscRow({ date: plan.window.end })];
      },
    };
    const summary = await runAnalyticsSync({ providers: [on(twoPhase)], store, apply: false });
    expect(seen).toEqual(["final:2026-09-12", "recent:2026-09-19"]);
    expect(summary.results[0]).toMatchObject({ rows: 2, windows: [{ start: "2026-09-12", end: "2026-09-18" }, { start: "2026-09-19", end: "2026-09-22" }] });
  });

  it("makes no write, run record or delete in a dry run, whatever the providers do", async () => {
    const { store } = memoryStore();
    await runAnalyticsSync({ providers: [on(ga()), on(gsc(new ProviderError("auth", 403))), on(bing())], store, apply: false });
    expect(store.upsert).not.toHaveBeenCalled();
    expect(store.deleteStale).not.toHaveBeenCalled();
    expect(store.startRun).not.toHaveBeenCalled();
    expect(store.finishRun).not.toHaveBeenCalled();
    expect(store.deleteOlderThan).not.toHaveBeenCalled();
  });
});

describe("preliminary and final rows", () => {
  it("replaces a day's rows with what the latest run returned, leaving days it did not return alone", async () => {
    const { store, facts } = memoryStore();
    const q = (query: string, date: string, clicks: number): FactRow => ({ provider: "gsc", report: "gsc.queries", date, dims: { query }, metrics: { clicks } });
    let answer: FactRow[] = [q("webdesign", "2026-09-20", 2), q("ym creations", "2026-09-20", 5), q("webshop", "2026-09-21", 1)];
    const provider = adapter({ "gsc.queries": async () => answer }, undefined, "gsc");

    await runAnalyticsSync({ providers: [on(provider)], store, apply: true, now: new Date("2026-09-22T06:00:00Z") });
    expect(facts.size).toBe(3);

    /* The final read of the 20th: "webdesign" has left the list, "ym creations" settled at 6. The 21st is not in this answer. */
    answer = [q("ym creations", "2026-09-20", 6)];
    await runAnalyticsSync({ providers: [on(provider)], store, apply: true, now: new Date("2026-09-23T06:00:00Z") });

    const left = [...facts.values()].map((f) => `${f.date}:${f.dims.query}:${f.metrics.clicks}`).sort();
    expect(left).toEqual(["2026-09-20:ym creations:6", "2026-09-21:webshop:1"]);
    expect(store.deleteStale).toHaveBeenLastCalledWith({ provider: "gsc", report: "gsc.queries", dates: ["2026-09-20"], syncedAt: "2026-09-23T06:00:00.000Z" });
  });
});

describe("stale runs", () => {
  it("closes runs a cut-off invocation left running, before an applied sync, and reports the count", async () => {
    const { store } = memoryStore();
    store.failStaleRuns = vi.fn(async () => 2);
    const summary = await runAnalyticsSync({ providers: [on(adapter({ "ga4.sources": async () => [row()] }))], store, apply: true, now: new Date("2026-09-23T06:00:00Z") });
    expect(store.failStaleRuns).toHaveBeenCalledWith("2026-09-23T05:45:00.000Z");
    expect(summary.staleRunsRecovered).toBe(2);
    expect(summaryLogFields(summary)).toMatchObject({ staleRunsRecovered: 2 });
  });

  it("leaves runs alone in a dry run, and does not stop the sync when recovery fails", async () => {
    const { store } = memoryStore();
    await runAnalyticsSync({ providers: [on(adapter({ "ga4.sources": async () => [row()] }))], store, apply: false });
    expect(store.failStaleRuns).not.toHaveBeenCalled();

    store.failStaleRuns = vi.fn(async () => Promise.reject(new Error("db down")));
    const summary = await runAnalyticsSync({ providers: [on(adapter({ "ga4.sources": async () => [row()] }))], store, apply: true });
    expect(summary.results[0].status).toBe("ok");
    expect(summary.staleRunsRecovered).toBeUndefined();
  });
});

describe("orchestration under load", () => {
  const deferred = () => {
    let resolve!: (rows: FactRow[]) => void;
    const promise = new Promise<FactRow[]>((r) => (resolve = r));
    return { promise, resolve };
  };

  it("runs providers side by side: a slow one does not hold up another", async () => {
    const { store } = memoryStore();
    const slow = deferred();
    const order: string[] = [];
    const ga: ProviderAdapter = adapter({
      "ga4.overview": async () => {
        const rows = await slow.promise;
        order.push("ga4");
        return rows;
      },
    });
    const bing: ProviderAdapter = adapter(
      {
        "bing.traffic": async () => {
          order.push("bing");
          slow.resolve([row({ report: "ga4.overview", dims: {} })]);
          return [row({ provider: "bing", report: "bing.traffic", dims: {} })];
        },
      },
      undefined,
      "bing",
    );
    const summary = await runAnalyticsSync({ providers: [on(ga), on(bing)], store, apply: false });
    expect(order).toEqual(["bing", "ga4"]);
    /* Results in provider order, not completion order. */
    expect(summary.results.map((r) => r.provider)).toEqual(["ga4", "bing"]);
  });

  it("runs at most three reports of one provider at once", async () => {
    const { store } = memoryStore();
    let running = 0;
    let peak = 0;
    const report = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running -= 1;
      return [row()];
    };
    const many = adapter(Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`ga4.r${index}`, report])));
    const summary = await runAnalyticsSync({ providers: [on(many)], store, apply: false });
    expect(peak).toBe(3);
    expect(summary.results.map((r) => r.report)).toEqual(Array.from({ length: 9 }, (_, index) => `ga4.r${index}`));
  });

  it("isolates a timed-out report: the provider's other reports and other providers still finish", async () => {
    const { store } = memoryStore();
    const ga = adapter({
      "ga4.overview": async () => {
        throw new ProviderError("timeout");
      },
      "ga4.sources": async () => [row()],
    });
    const bing = adapter({ "bing.traffic": async () => [row({ provider: "bing", report: "bing.traffic", dims: {} })] }, undefined, "bing");
    const summary = await runAnalyticsSync({ providers: [on(ga), on(bing)], store, apply: true });
    expect(summary.results.map((r) => [r.report, r.status, r.error])).toEqual([
      ["ga4.overview", "failed", "timeout"],
      ["ga4.sources", "ok", undefined],
      ["bing.traffic", "ok", undefined],
    ]);
    expect(summary.providers.map((p) => p.health)).toEqual(["provider_error", "ok"]);
  });

  it("does not start a report once the start budget is spent", async () => {
    const { store, runs } = memoryStore();
    let clock = 0;
    const late = vi.fn(async () => [row()]);
    const provider = adapter({
      "ga4.overview": async () => {
        clock = 50_000;
        return [row({ report: "ga4.overview", dims: {} })];
      },
      "ga4.sources": late,
    });
    const summary = await runAnalyticsSync({ providers: [on(provider)], store, apply: true, clock: () => clock, reportConcurrency: 1 });
    expect(late).not.toHaveBeenCalled();
    expect(summary.results.map((r) => [r.report, r.status, r.error])).toEqual([
      ["ga4.overview", "ok", undefined],
      ["ga4.sources", "failed", "deadline"],
    ]);
    expect(runs.map((r) => r.status)).toEqual(["ok", "failed"]);
  });

  it("reports filtered queries as a count, never as text", async () => {
    const { store } = memoryStore();
    const gsc: ProviderAdapter = {
      key: "gsc",
      reports: ["gsc.queries"],
      plan: () => [{ phase: "recent", window }],
      fetch: async () => ({ rows: [row({ provider: "gsc", report: "gsc.queries", dims: { query: "website laten maken" } })], filtered: 2 }),
    };
    const summary = await runAnalyticsSync({ providers: [on(gsc)], store, apply: false });
    expect(summary.results[0]).toMatchObject({ status: "ok", rows: 1, filtered: 2 });
    const logged = JSON.stringify(summaryLogFields(summary));
    expect(logged).toContain('"filtered":2');
    expect(logged).not.toContain("website laten maken");
  });
});
