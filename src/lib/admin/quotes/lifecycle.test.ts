import { beforeEach, describe, expect, it, vi } from "vitest";
import { quoteFromRow, type QuoteRow } from "@/lib/admin/quotes/mapper";
import { quoteFixture, quoteRowFixture } from "@/lib/admin/quotes/test-support";
import type { Quote } from "@/lib/admin/quotes/types";
import { createFakeDb } from "@/lib/payments/fixtures";

/*
  A new version of a sent quote, and the decision on one, with the database
  replaced. What is under test is what the new concept is made of, that the
  old quote is left alone, and which quotes are refused a version at all.
*/
let db: ReturnType<typeof createFakeDb>;
const savedLines: { quoteId: unknown; lines: unknown }[] = [];
const customer = {
  id: "cust-1",
  companyName: "Alfa BV",
  contactName: "N. Nieuw",
  email: "new@example.com",
  address: { street: "Nieuwe Straat 2", postalCode: "2000 BB", city: "Rotterdam", country: "Nederland" },
  kvkNumber: "12345678",
  notes: "",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};
let storedCustomer: typeof customer | undefined = customer;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({
    from: (table: string) => db.from(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "save_quote_lines") return { data: null, error: { message: `rpc ${name} not provided` } };
      savedLines.push({ quoteId: args.p_quote_id, lines: args.p_lines });
      return { data: null, error: null };
    },
  }),
}));
vi.mock("@/lib/admin/customers/repository", () => ({ getCustomer: async () => storedCustomer }));
vi.mock("@/lib/admin/quotes/repository", () => ({
  getQuote: async (id: string) => {
    const row = db.rows("quotes").find((candidate) => candidate.id === id);
    return row ? quoteFromRow(row as unknown as QuoteRow) : undefined;
  },
  findQuoteSuccessor: async (id: string) => {
    const row = db.rows("quotes").find((candidate) => candidate.supersedes_quote_id === id);
    return row ? { id: row.id, number: { value: row.number_value, provisional: row.number_provisional }, status: row.status } : undefined;
  },
}));

const { createQuoteRevision, setQuoteOutcome } = await import("@/lib/admin/quotes/lifecycle");

const sent = (overrides: Partial<Quote> = {}) =>
  quoteFixture({
    number: { value: "YM-O-2026-000001", provisional: false },
    status: "sent",
    projectId: "proj-1",
    intro: "Zoals besproken.",
    notes: "Geldig tot de genoemde datum.",
    terms: { edition: "2026", publishedOn: "2026-09-29" },
    document: { path: "2026/YM-O-2026-000001-abc.pdf", sha256: "a".repeat(64), bytes: 1000, generatedAt: "2026-09-01T10:00:00.000Z" },
    sentAt: "2026-09-01T10:00:00.000Z",
    recipientEmail: "a@example.com",
    ...overrides,
  });

function place(...quotes: Quote[]) {
  const rows = db.rows("quotes");
  rows.length = 0;
  for (const quote of quotes) rows.push(quoteRowFixture(quote));
}

beforeEach(() => {
  vi.clearAllMocks();
  savedLines.length = 0;
  storedCustomer = customer;
  db = createFakeDb();
  place(sent());
});

describe("a new version of a sent quote", () => {
  it("is a concept of the same customer that names the quote it replaces", async () => {
    const result = await createQuoteRevision("quo-1");

    expect(result.ok).toBe(true);
    const revision = db.rows("quotes").find((row) => row.id !== "quo-1")!;
    expect(revision).toMatchObject({
      supersedes_quote_id: "quo-1",
      customer_id: "cust-1",
      status: "draft",
      number_provisional: true,
      project_id: "proj-1",
      subject: "Nieuwe website",
      intro: "Zoals besproken.",
      notes: "Geldig tot de genoemde datum.",
    });
    expect(String(revision.number_value)).toMatch(/^OFF-CONCEPT-/);
    expect(result.ok && result.value).toBe(revision.id);
  });

  it("starts without a send, a document or a terms snapshot", async () => {
    await createQuoteRevision("quo-1");

    const revision = db.rows("quotes").find((row) => row.id !== "quo-1")!;
    for (const column of ["sent_at", "recipient_email", "document_path", "document_sha256", "terms_edition", "terms_published_on"]) {
      expect(revision[column] ?? null, column).toBeNull();
    }
    expect(revision.legacy_sent_without_document ?? false).toBe(false);
  });

  it("copies the lines, as the starting point they are", async () => {
    await createQuoteRevision("quo-1");

    expect(savedLines).toHaveLength(1);
    expect(savedLines[0]!.lines).toEqual([{ description: "Ontwerp", quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }]);
  });

  /* A new proposal goes out under the customer's current address, not the old copy. */
  it("snapshots the customer as they are now", async () => {
    await createQuoteRevision("quo-1");

    const revision = db.rows("quotes").find((row) => row.id !== "quo-1")!;
    expect(revision).toMatchObject({
      customer_contact_name: "N. Nieuw",
      customer_email: "new@example.com",
      customer_street: "Nieuwe Straat 2",
      customer_kvk_number: "12345678",
    });
  });

  it("dates it today and keeps the old validity span", async () => {
    await createQuoteRevision("quo-1");

    const revision = db.rows("quotes").find((row) => row.id !== "quo-1")!;
    const issue = new Date(`${revision.issue_date}T12:00:00Z`);
    const until = new Date(`${revision.valid_until}T12:00:00Z`);
    expect(Math.round((until.getTime() - issue.getTime()) / 86_400_000)).toBe(30);
  });

  it("leaves the old quote exactly as it was", async () => {
    const before = { ...db.rows("quotes")[0]! };

    await createQuoteRevision("quo-1");

    expect(db.rows("quotes").find((row) => row.id === "quo-1")).toEqual(before);
  });

  it("is refused for a quote that was never sent", async () => {
    place(quoteFixture());

    const result = await createQuoteRevision("quo-1");

    expect(result).toEqual({ ok: false, error: "Een nieuwe versie maak je van een verzonden offerte." });
    expect(db.rows("quotes")).toHaveLength(1);
  });

  it("is refused for an accepted quote", async () => {
    place(sent({ status: "accepted" }));

    const result = await createQuoteRevision("quo-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("geaccepteerd");
    expect(db.rows("quotes")).toHaveLength(1);
  });

  it("is refused when a version already exists", async () => {
    place(sent(), quoteFixture({ id: "quo-2", supersedesQuoteId: "quo-1" }));

    const result = await createQuoteRevision("quo-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("al een nieuwe versie");
    expect(db.rows("quotes")).toHaveLength(2);
  });

  it("is refused when the customer is gone", async () => {
    storedCustomer = undefined;

    const result = await createQuoteRevision("quo-1");

    expect(result.ok).toBe(false);
    expect(db.rows("quotes")).toHaveLength(1);
  });
});

describe("the status an admin sets by hand", () => {
  it("marks an open quote expired on the quote and nowhere else", async () => {
    const result = await setQuoteOutcome("quo-1", "expired");

    expect(result).toEqual({ ok: true, value: "expired" });
    expect(db.rows("quotes")[0]).toMatchObject({ status: "expired", document_sha256: "a".repeat(64), sent_at: "2026-09-01T10:00:00.000Z" });
  });

  it.each(["accepted", "rejected"])("never sets %s: that is a decision, recorded on its own", async (status) => {
    const result = await setQuoteOutcome("quo-1", status);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/beslissing/);
    expect(db.rows("quotes")[0]!.status).toBe("sent");
  });

  it.each(["accepted", "rejected"] as const)("does not move a quote that was %s", async (status) => {
    place(sent({ status }));

    const result = await setQuoteOutcome("quo-1", "sent");

    expect(result.ok).toBe(false);
    expect(db.rows("quotes")[0]!.status).toBe(status);
  });

  it("never goes back to a concept", async () => {
    const result = await setQuoteOutcome("quo-1", "draft");

    expect(result.ok).toBe(false);
    expect(db.rows("quotes")[0]!.status).toBe("sent");
  });

  it("is refused on a quote the customer does not have", async () => {
    place(quoteFixture());

    const result = await setQuoteOutcome("quo-1", "expired");

    expect(result.ok).toBe(false);
    expect(db.rows("quotes")[0]!.status).toBe("draft");
  });
});
