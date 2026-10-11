import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/admin/invoices/artifact";
import { quoteFromRow, type QuoteRow } from "@/lib/admin/quotes/mapper";
import { createQuoteIssueRpc, quoteFixture, quoteRowFixture } from "@/lib/admin/quotes/test-support";
import type { Quote } from "@/lib/admin/quotes/types";
import { createFakeDb, customerRowFixture } from "@/lib/payments/fixtures";
import { termsDocument } from "@/lib/content/terms";

/*
  Sending a quote, with the database, the bucket, the renderer and the mailer
  replaced. What is under test is the chain and its failure windows: number
  and terms first, exactly one render, one stored file, the mail built from
  that file, and `sent_at` written once -- and what a retry, a resend and a
  legacy quote do with all of that.
*/
let db: ReturnType<typeof createFakeDb>;
let sequence = 1;
const renderQuotePdf = vi.fn(async () => Buffer.from(`%PDF-1.7\n% render ${Math.random()}\n%%EOF\n`));
const sendDocumentMail = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({
    from: (table: string) => db.from(table),
    storage: db.storage,
    rpc: (name: string, args: Record<string, unknown>) =>
      createQuoteIssueRpc(
        () => db.rows("quotes"),
        () => `YM-O-2026-${String(sequence++).padStart(6, "0")}`,
      )(name, args),
  }),
}));
vi.mock("@/lib/admin/quotes/repository", () => ({
  getQuote: async (id: string) => {
    const row = db.rows("quotes").find((candidate) => candidate.id === id);
    return row ? quoteFromRow(row as unknown as QuoteRow) : undefined;
  },
  findQuoteSuccessor: async (id: string) => {
    const row = db.rows("quotes").find((candidate) => candidate.supersedes_quote_id === id);
    return row
      ? { id: row.id, number: { value: row.number_value, provisional: row.number_provisional }, status: row.status, ...(row.sent_at ? { sentAt: row.sent_at } : {}) }
      : undefined;
  },
}));
vi.mock("@/lib/admin/invoices/repository", () => ({ getInvoice: async () => undefined }));
vi.mock("@/lib/admin/projects/repository", () => ({ getProject: async () => undefined }));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderQuotePdf: () => renderQuotePdf(),
  renderInvoicePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
vi.mock("@/lib/admin/documents/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/documents/email")>()),
  sendDocumentMail: (...args: unknown[]) => sendDocumentMail(...args),
}));
vi.mock("@/lib/payments/pay-link", () => ({ invoicePayLink: vi.fn() }));

const { sendQuoteToCustomer } = await import("@/lib/admin/documents/send");

const row = () => db.rows("quotes")[0]!;
const mailed = () => sendDocumentMail.mock.calls.map(([args]) => args as { number: string; pdf: Buffer; log: { category: string } });

function place(quote: Quote) {
  const quotes = db.rows("quotes");
  quotes.length = 0;
  quotes.push(quoteRowFixture(quote));
}

beforeEach(() => {
  vi.clearAllMocks();
  sequence = 1;
  db = createFakeDb({ customers: [customerRowFixture()] });
  sendDocumentMail.mockResolvedValue({ sent: true, sentAt: "2026-09-12T10:00:00.000Z" });
  place(quoteFixture());
});

describe("sending a concept", () => {
  it("numbers it, snapshots the terms, stores one PDF and mails that file", async () => {
    const result = await sendQuoteToCustomer("quo-1");

    expect(result).toEqual({ ok: true, value: { number: "YM-O-2026-000001", recipient: "a@example.com" } });
    expect(renderQuotePdf).toHaveBeenCalledTimes(1);
    expect(db.bucket.uploads).toHaveLength(1);

    const path = db.bucket.uploads[0]!.path;
    const stored = db.bucket.files.get(path)!;
    expect(path).toBe(`2026/YM-O-2026-000001-${sha256Hex(stored)}.pdf`);
    expect(row()).toMatchObject({
      number_value: "YM-O-2026-000001",
      number_provisional: false,
      terms_edition: termsDocument.edition,
      terms_published_on: termsDocument.dateIso,
      document_path: path,
      document_sha256: sha256Hex(stored),
      document_bytes: stored.byteLength,
      status: "sent",
      sent_at: "2026-09-12T10:00:00.000Z",
      recipient_email: "a@example.com",
    });

    /* The attachment is the stored object, byte for byte. */
    expect(mailed()).toHaveLength(1);
    expect(Buffer.from(mailed()[0]!.pdf).equals(stored)).toBe(true);
    expect(mailed()[0]!.number).toBe("YM-O-2026-000001");
    expect(mailed()[0]!.log.category).toBe("quote_sent");
    expect(db.bucket.downloads).toEqual([path]);
  });

  it("refuses an incomplete concept before the counter moves", async () => {
    place(quoteFixture({ customer: { ...quoteFixture().customer, street: "" } }));

    const result = await sendQuoteToCustomer("quo-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("adres");
    expect(row().number_provisional).toBe(true);
    expect(renderQuotePdf).not.toHaveBeenCalled();
    expect(db.bucket.uploads).toEqual([]);
    expect(sendDocumentMail).not.toHaveBeenCalled();
  });

  it("refuses before the counter moves when the customer has no usable address", async () => {
    db.rows("customers")[0]!.email = "";

    const result = await sendQuoteToCustomer("quo-1");

    expect(result.ok).toBe(false);
    expect(row().number_provisional).toBe(true);
    expect(renderQuotePdf).not.toHaveBeenCalled();
  });
});

/*
  Storage, Postgres and the mailer are three systems. Each window between
  them has to leave a quote that is either not yet a document or exactly one
  document, and a retry has to finish on the same number with one file.
*/
describe("a send that fails halfway", () => {
  it("leaves a numbered, frozen quote without a file when storing fails, and mails nothing", async () => {
    db.bucket.failNextUpload("network unreachable");

    const result = await sendQuoteToCustomer("quo-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("kon niet worden opgeslagen");
    expect(row()).toMatchObject({ number_value: "YM-O-2026-000001", number_provisional: false, document_path: null, sent_at: null, status: "draft" });
    expect(row().terms_edition).toBe(termsDocument.edition);
    expect(sendDocumentMail).not.toHaveBeenCalled();
  });

  it("finishes on the retry: same number, one file, then the mail", async () => {
    db.bucket.failNextUpload("network unreachable");
    await sendQuoteToCustomer("quo-1");

    const retried = await sendQuoteToCustomer("quo-1");

    expect(retried).toEqual({ ok: true, value: { number: "YM-O-2026-000001", recipient: "a@example.com" } });
    expect(row().number_value).toBe("YM-O-2026-000001");
    expect(db.bucket.files.size).toBe(1);
    expect(row().document_sha256).toBe(sha256Hex(db.bucket.files.get(row().document_path as string)!));
    expect(mailed()).toHaveLength(1);
  });

  it("keeps the stored file and leaves sent_at empty when the mailer refuses, and mails that same file on the retry", async () => {
    sendDocumentMail.mockResolvedValueOnce({ sent: false, reason: "Resend 503" });

    const first = await sendQuoteToCustomer("quo-1");
    expect(first).toEqual({ ok: false, error: "Versturen mislukt: Resend 503" });
    expect(row().document_path).not.toBeNull();
    expect(row().sent_at).toBeNull();
    expect(row().status).toBe("draft");

    const second = await sendQuoteToCustomer("quo-1");

    expect(second.ok).toBe(true);
    /* No second render, no second file: the retry read the stored one. */
    expect(renderQuotePdf).toHaveBeenCalledTimes(1);
    expect(db.bucket.uploads).toHaveLength(1);
    expect(Buffer.from(mailed()[1]!.pdf).equals(db.bucket.files.get(row().document_path as string)!)).toBe(true);
    expect(row().sent_at).toBe("2026-09-12T10:00:00.000Z");
    expect(row().status).toBe("sent");
  });
});

describe("resending a sent quote", () => {
  it("mails the identical stored file and changes nothing about the quote", async () => {
    await sendQuoteToCustomer("quo-1");
    const before = { ...row() };

    const again = await sendQuoteToCustomer("quo-1");

    expect(again).toEqual({ ok: true, value: { number: "YM-O-2026-000001", recipient: "a@example.com" } });
    expect(renderQuotePdf).toHaveBeenCalledTimes(1);
    expect(db.bucket.uploads).toHaveLength(1);
    expect(mailed()).toHaveLength(2);
    expect(Buffer.from(mailed()[0]!.pdf).equals(Buffer.from(mailed()[1]!.pdf))).toBe(true);
    /* The first send stays the send; nothing moved, not even sent_at. */
    expect(row()).toEqual(before);
  });

  it("goes to the address the customer has now, and records only that", async () => {
    await sendQuoteToCustomer("quo-1");
    const sentAt = row().sent_at;
    db.rows("customers")[0]!.email = "new@example.com";

    const again = await sendQuoteToCustomer("quo-1");

    expect(again).toEqual({ ok: true, value: { number: "YM-O-2026-000001", recipient: "new@example.com" } });
    expect(row().recipient_email).toBe("new@example.com");
    expect(row().sent_at).toBe(sentAt);
    expect(row().document_sha256).toBe(sha256Hex(Buffer.from(mailed()[1]!.pdf)));
  });

  /* Bytes that no longer hash to what was recorded are not this document. */
  it("refuses when the stored file does not match its checksum", async () => {
    await sendQuoteToCustomer("quo-1");
    db.bucket.files.set(row().document_path as string, Buffer.from("%PDF-1.7 something else\n"));
    sendDocumentMail.mockClear();

    const again = await sendQuoteToCustomer("quo-1");

    expect(again.ok).toBe(false);
    expect(again.ok === false && again.error).toContain("controlesom");
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(renderQuotePdf).toHaveBeenCalledTimes(1);
  });
});

describe("a quote that was replaced", () => {
  it("is not mailed again once its successor went out", async () => {
    await sendQuoteToCustomer("quo-1");
    db.rows("quotes").push(
      quoteRowFixture(
        quoteFixture({
          id: "quo-2",
          number: { value: "YM-O-2026-000002", provisional: false },
          status: "sent",
          supersedesQuoteId: "quo-1",
          sentAt: "2026-09-13T10:00:00.000Z",
          terms: { edition: "2026", publishedOn: "2026-09-29" },
          document: { path: "2026/YM-O-2026-000002-x.pdf", sha256: "b".repeat(64), bytes: 10, generatedAt: "2026-09-13T10:00:00.000Z" },
        }),
      ),
    );
    sendDocumentMail.mockClear();

    const again = await sendQuoteToCustomer("quo-1");

    expect(again.ok).toBe(false);
    expect(again.ok === false && again.error).toContain("vervangen door YM-O-2026-000002");
    expect(sendDocumentMail).not.toHaveBeenCalled();
  });

  /* A successor that is still a concept changes nothing: the customer has only the old one. */
  it("is still resent while the successor is a concept", async () => {
    await sendQuoteToCustomer("quo-1");
    db.rows("quotes").push(quoteRowFixture(quoteFixture({ id: "quo-2", supersedesQuoteId: "quo-1" })));

    const again = await sendQuoteToCustomer("quo-1");

    expect(again.ok).toBe(true);
  });
});

describe("a quote sent before documents were stored", () => {
  it("is not mailed again and nothing is rendered for it", async () => {
    place(
      quoteFixture({
        number: { value: "YM-O-2026-000900", provisional: false },
        status: "sent",
        sentAt: "2026-09-01T10:00:00.000Z",
        recipientEmail: "a@example.com",
        legacyWithoutDocument: true,
      }),
    );

    const result = await sendQuoteToCustomer("quo-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("nieuwe versie");
    expect(renderQuotePdf).not.toHaveBeenCalled();
    expect(db.bucket.uploads).toEqual([]);
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(row().legacy_sent_without_document).toBe(true);
  });
});
