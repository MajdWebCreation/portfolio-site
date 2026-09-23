import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RetentionStore } from "@/lib/retention/retention-runner";

/*
  The production guard on the retention cron.

  Whatever the policy selects, nothing leaves the database unless the
  deployment says RETENTION_ENABLED=true. Every other value, and no value at
  all, is a dry run that reports counts and touches nothing. And whichever
  mode it runs in, the log line and the response carry counts, a mode and a
  cutoff -- never a row.
*/
const store: RetentionStore = {
  convertedSources: vi.fn(async () => ({ inquiryIds: new Set<string>(), leadIds: new Set<string>() })),
  inquiryCandidates: vi.fn(async () => [{ id: "inq-anna-voorbeeld", received_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" }]),
  leadCandidates: vi.fn(async () => [
    { id: "lead-bedrijf-bv", status: "lost", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z", last_contact_at: null, next_follow_up_at: null },
  ]),
  communicationCandidates: vi.fn(async () => [
    { id: "comm-1", category: "quote_sent", created_at: "2025-01-01T00:00:00.000Z", sent_at: "2025-01-01T00:00:00.000Z", body_text: "Beste Anna, mail naar anna@example.com" },
  ]),
  deleteInquiries: vi.fn(async () => {}),
  deleteLeads: vi.fn(async () => {}),
  redactCommunications: vi.fn(async () => {}),
  countAnalyticsFacts: vi.fn(async (_cutoff: string, reports: string[] | null) => (reports ? 4 : 9)),
  deleteAnalyticsFacts: vi.fn(async (_cutoff: string, reports: string[] | null) => (reports ? 4 : 9)),
};

vi.mock("@/lib/retention/retention-store", () => ({ createRetentionStore: () => store }));
vi.mock("@/lib/payments/admin-client", () => ({
  hasPaymentsAdminAccess: () => true,
  paymentsAdminClient: () => ({}),
}));

const { GET } = await import("@/app/api/cron/retention/route");

const secret = "cron-secret-for-tests";
const authorised = () => GET(new Request("http://localhost/api/cron/retention", { headers: { authorization: `Bearer ${secret}` } }));

let info: unknown[][];
let infoSpy: ReturnType<typeof vi.spyOn>;
const originalEnabled = process.env.RETENTION_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  info = [];
  infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    info.push(args);
  });
  process.env.CRON_SECRET = secret;
  delete process.env.RETENTION_ENABLED;
});

afterEach(() => {
  infoSpy.mockRestore();
  if (originalEnabled === undefined) delete process.env.RETENTION_ENABLED;
  else process.env.RETENTION_ENABLED = originalEnabled;
});

const mutations = () => [store.deleteInquiries, store.deleteLeads, store.redactCommunications, store.deleteAnalyticsFacts];

async function runAndRead() {
  const response = await authorised();
  return { response, body: await response.json() };
}

describe("without RETENTION_ENABLED", () => {
  it("runs, deletes nothing and says it was a dry run", async () => {
    const { response, body } = await runAndRead();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ mode: "dry-run", inquiriesSelected: 1, leadsSelected: 1, communicationsSelected: 1 });
    for (const mutation of mutations()) expect(mutation).not.toHaveBeenCalled();
    expect(String(info[0]?.[0])).toContain("dry run");
    expect(String(info[0]?.[0])).toContain("RETENTION_ENABLED");
  });
});

describe("with RETENTION_ENABLED set to something other than true", () => {
  it.each(["false", "", "1", "yes", "TRUE", " true"])("%j deletes nothing", async (value) => {
    process.env.RETENTION_ENABLED = value;

    const { body } = await runAndRead();

    expect(body.mode).toBe("dry-run");
    for (const mutation of mutations()) expect(mutation).not.toHaveBeenCalled();
  });
});

describe("with RETENTION_ENABLED=true", () => {
  it("carries the retention policy out", async () => {
    process.env.RETENTION_ENABLED = "true";

    const { response, body } = await runAndRead();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ mode: "applied", inquiriesSelected: 1, leadsSelected: 1, communicationsSelected: 1 });
    expect(store.deleteInquiries).toHaveBeenCalledWith(["inq-anna-voorbeeld"]);
    expect(store.deleteLeads).toHaveBeenCalledWith(["lead-bedrijf-bv"]);
    expect(store.redactCommunications).toHaveBeenCalledWith(["comm-1"]);
    expect(store.deleteAnalyticsFacts).toHaveBeenCalledTimes(3);
    expect(body.analyticsFacts).toEqual([
      { retentionClass: "aggregate", cutoff: expect.any(String), selected: 9 },
      { retentionClass: "query_text", cutoff: expect.any(String), selected: 4 },
      { retentionClass: "clarity_live", cutoff: expect.any(String), selected: 4 },
    ]);
    expect(String(info[0]?.[0])).toBe("Retention run finished");
  });
});

describe("what is logged and returned", () => {
  it.each([undefined, "true"])("with RETENTION_ENABLED=%j: counts, mode and cutoff only", async (value) => {
    if (value === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = value;

    const { body } = await runAndRead();

    expect(info).toHaveLength(1);
    const [, payload] = info[0];
    const keys = ["analyticsFacts", "communicationsSelected", "cutoff", "inquiriesSelected", "leadsSelected", "mode"];
    expect(Object.keys(payload as object).sort()).toEqual(keys);
    expect(Object.keys(body).sort()).toEqual(keys);
    for (const entry of body.analyticsFacts) expect(Object.keys(entry).sort()).toEqual(["cutoff", "retentionClass", "selected"]);
    const text = JSON.stringify(info) + JSON.stringify(body);
    for (const personal of ["anna", "Anna", "@", "bedrijf", "Beste", "inq-", "lead-", "comm-"]) {
      expect(text).not.toContain(personal);
    }
  });
});

describe("without a valid cron secret", () => {
  it("does nothing at all, in either mode", async () => {
    process.env.RETENTION_ENABLED = "true";

    const response = await GET(new Request("http://localhost/api/cron/retention"));

    expect(response.status).toBe(404);
    expect(store.convertedSources).not.toHaveBeenCalled();
    for (const mutation of mutations()) expect(mutation).not.toHaveBeenCalled();
    expect(info).toHaveLength(0);
  });
});
