import { describe, expect, it, vi } from "vitest";
import { runRetention, type RetentionStore } from "@/lib/retention/retention-runner";

/*
  The runner is the order and the counting; the policy is tested on its own.
  These pin down that what the policy says goes is what the store is asked to
  remove, that a candidate the policy protects is never touched, and that a
  dry run counts the very same rows without touching any.
*/
const now = new Date("2026-09-23T05:00:00.000Z");

function fakeStore(overrides: Partial<RetentionStore> = {}) {
  const store: RetentionStore = {
    convertedSources: vi.fn(async () => ({ inquiryIds: new Set(["inq-customer"]), leadIds: new Set(["lead-customer"]) })),
    inquiryCandidates: vi.fn(async () => [
      { id: "inq-old", received_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" },
      { id: "inq-customer", received_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" },
      { id: "inq-recent", received_at: "2025-01-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    ]),
    leadCandidates: vi.fn(async () => [
      { id: "lead-old", status: "lost", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-02-01T00:00:00.000Z", last_contact_at: null, next_follow_up_at: null },
      { id: "lead-customer", status: "quote", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-02-01T00:00:00.000Z", last_contact_at: null, next_follow_up_at: null },
      { id: "lead-won", status: "won", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-02-01T00:00:00.000Z", last_contact_at: null, next_follow_up_at: null },
      { id: "lead-planned", status: "follow_up", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-02-01T00:00:00.000Z", last_contact_at: null, next_follow_up_at: "2026-11-01T00:00:00.000Z" },
    ]),
    communicationCandidates: vi.fn(async () => [
      { id: "comm-quote", category: "quote_sent", created_at: "2025-03-01T00:00:00.000Z", sent_at: "2025-03-01T00:00:00.000Z", body_text: "offerte" },
      { id: "comm-invoice", category: "invoice_sent", created_at: "2025-03-01T00:00:00.000Z", sent_at: "2025-03-01T00:00:00.000Z", body_text: "factuur" },
    ]),
    deleteInquiries: vi.fn(async () => {}),
    deleteLeads: vi.fn(async () => {}),
    redactCommunications: vi.fn(async () => {}),
    countAnalyticsFacts: vi.fn(async () => 0),
    deleteAnalyticsFacts: vi.fn(async () => 0),
    ...overrides,
  };
  return store;
}

const expectedCounts = {
  cutoff: "2025-09-23T05:00:00.000Z",
  inquiriesSelected: 1,
  leadsSelected: 1,
  communicationsSelected: 1,
  analyticsFacts: [
    { retentionClass: "aggregate", cutoff: "2024-07-23", selected: 0 },
    { retentionClass: "query_text", cutoff: "2025-05-23", selected: 0 },
  ],
};

describe("an applied retention run", () => {
  it("removes exactly what the policy says and reports the counts", async () => {
    const store = fakeStore();

    const summary = await runRetention(store, { apply: true, now });

    expect(store.deleteInquiries).toHaveBeenCalledWith(["inq-old"]);
    expect(store.deleteLeads).toHaveBeenCalledWith(["lead-old"]);
    expect(store.redactCommunications).toHaveBeenCalledWith(["comm-quote"]);
    expect(summary).toEqual({ mode: "applied", ...expectedCounts });
  });

  it("asks the store for nothing when nothing has aged out", async () => {
    const store = fakeStore({
      inquiryCandidates: vi.fn(async () => []),
      leadCandidates: vi.fn(async () => []),
      communicationCandidates: vi.fn(async () => []),
    });

    const summary = await runRetention(store, { apply: true, now });

    expect(store.deleteInquiries).not.toHaveBeenCalled();
    expect(store.deleteLeads).not.toHaveBeenCalled();
    expect(store.redactCommunications).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ mode: "applied", inquiriesSelected: 0, leadsSelected: 0, communicationsSelected: 0 });
  });

  it("hands the cutoff it computed to every candidate query", async () => {
    const store = fakeStore();

    await runRetention(store, { apply: true, now });

    for (const query of [store.inquiryCandidates, store.leadCandidates, store.communicationCandidates]) {
      expect(query).toHaveBeenCalledWith("2025-09-23T05:00:00.000Z");
    }
  });
});

describe("a dry run", () => {
  /* The same selection, the same counts, and not one row touched. */
  it("counts what an applied run would remove and removes nothing", async () => {
    const store = fakeStore();

    const summary = await runRetention(store, { apply: false, now });

    expect(summary).toEqual({ mode: "dry-run", ...expectedCounts });
    expect(store.deleteInquiries).not.toHaveBeenCalled();
    expect(store.deleteLeads).not.toHaveBeenCalled();
    expect(store.redactCommunications).not.toHaveBeenCalled();
  });

  it("still reads every candidate set, so the count is real", async () => {
    const store = fakeStore();

    await runRetention(store, { apply: false, now });

    expect(store.convertedSources).toHaveBeenCalledTimes(1);
    for (const query of [store.inquiryCandidates, store.leadCandidates, store.communicationCandidates]) {
      expect(query).toHaveBeenCalledWith("2025-09-23T05:00:00.000Z");
    }
  });
});

describe("analytics facts in the general retention pass", () => {
  /* The facts table as the database behaves: date < cutoff, limited to the named reports when given. Only report and date are known here. */
  function analyticsTable(rows: Array<{ report: string; date: string }>) {
    const table = [...rows];
    const matches = (cutoff: string, reports: string[] | null) => (row: { report: string; date: string }) => row.date < cutoff && (!reports || reports.includes(row.report));
    return {
      table,
      countAnalyticsFacts: vi.fn(async (cutoff: string, reports: string[] | null) => table.filter(matches(cutoff, reports)).length),
      deleteAnalyticsFacts: vi.fn(async (cutoff: string, reports: string[] | null) => {
        const doomed = table.filter(matches(cutoff, reports));
        for (const row of doomed) table.splice(table.indexOf(row), 1);
        return doomed.length;
      }),
    };
  }

  const history = [
    { report: "gsc.queries", date: "2025-05-22" },
    { report: "gsc.queries", date: "2025-05-23" },
    { report: "gsc.query_page", date: "2025-02-01" },
    { report: "bing.queries", date: "2025-03-01" },
    { report: "gsc.totals", date: "2025-03-01" },
    { report: "bing.traffic", date: "2024-07-23" },
    { report: "ga4.overview", date: "2024-07-22" },
    { report: "gsc.pages", date: "2024-01-01" },
  ];

  it("removes query facts after 16 months and all facts after 26, without any provider sync, keeping the boundary days", async () => {
    const facts = analyticsTable(history);
    const summary = await runRetention(fakeStore({ countAnalyticsFacts: facts.countAnalyticsFacts, deleteAnalyticsFacts: facts.deleteAnalyticsFacts }), { apply: true, now });

    expect(facts.table.map((row) => `${row.report}@${row.date}`).sort()).toEqual(["bing.traffic@2024-07-23", "gsc.queries@2025-05-23", "gsc.totals@2025-03-01"]);
    expect(summary.analyticsFacts).toEqual([
      { retentionClass: "aggregate", cutoff: "2024-07-23", selected: 2 },
      { retentionClass: "query_text", cutoff: "2025-05-23", selected: 3 },
    ]);
    expect(facts.deleteAnalyticsFacts).toHaveBeenCalledWith("2025-05-23", ["gsc.queries", "gsc.query_page", "bing.queries"]);
    expect(facts.deleteAnalyticsFacts).toHaveBeenCalledWith("2024-07-23", null);
  });

  it("only counts in a dry run", async () => {
    const facts = analyticsTable(history);
    const summary = await runRetention(fakeStore({ countAnalyticsFacts: facts.countAnalyticsFacts, deleteAnalyticsFacts: facts.deleteAnalyticsFacts }), { apply: false, now });

    expect(facts.deleteAnalyticsFacts).not.toHaveBeenCalled();
    expect(facts.table).toHaveLength(history.length);
    expect(summary.analyticsFacts.map((entry) => entry.selected)).toEqual([2, 3]);
  });
});
