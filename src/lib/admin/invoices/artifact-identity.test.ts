import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/admin/invoices/artifact";
import { invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import { createFinalizationRpc, fakeInvoiceStorage } from "@/lib/admin/invoices/storage-fixture";

/** The single object the bucket holds, whatever hash landed in its name. */
const onlyObject = () => {
  const entries = [...bucket.files.entries()];
  expect(entries).toHaveLength(1);
  return entries[0]!;
};

/** The object the invoice actually points at. */
const referencedObject = (): [string, Buffer] => {
  const path = rows[0]!.document_path as string;
  const bytes = bucket.files.get(path);
  expect(bytes, `nothing stored at ${path}`).toBeDefined();
  return [path, bytes!];
};
import { invoiceFixture } from "@/lib/payments/fixtures";

/**
 * The claim, end to end: the PDF the admin opens after making an invoice
 * definitive is the file that is attached to the customer's mail. Not the
 * same data rendered twice -- the same bytes.
 *
 * Three call sites share one database and one bucket here: `finalizeInvoice`
 * makes the document, `invoiceDocumentFile` is what the preview panel calls,
 * and `sendInvoiceToCustomer` mails it.
 *
 * The renderer is rigged to return *different* bytes on every call. That is
 * the whole trick: if anything anywhere rendered a second time, the preview
 * and the attachment would differ and every assertion below would fail. A
 * renderer that returned the same bytes twice would let a broken design pass.
 */
let renders = 0;
const renderInvoicePdf = vi.fn(async () => Buffer.from(`%PDF-1.7\n% render number ${++renders}\n%%EOF\n`));

const rows: Record<string, unknown>[] = [];
const bucket = fakeInvoiceStorage();
const sendDocumentMail = vi.fn();
const invoicePayLink = vi.fn();

let rpcImplementation = createFinalizationRpc(
  () => rows,
  () => "YM-F-2026-000001",
);
const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => rpcImplementation(name, args ?? {}));
/* Writes land on the row, so a cancel is visible the way it would be. */
const update = vi.fn((payload: Record<string, unknown>) => ({
  eq: async () => {
    if (rows[0]) Object.assign(rows[0], payload);
    return { error: null };
  },
}));
const select = vi.fn(() => ({
  eq: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }),
}));

const db = { from: () => ({ update, select }), rpc, storage: bucket.storage };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => db,
}));
/* The repository reads the same row the fake functions write. */
vi.mock("@/lib/admin/invoices/repository", () => ({
  getInvoice: async () => (rows[0] ? invoiceFromRow(rows[0] as unknown as InvoiceRow) : undefined),
}));
vi.mock("@/lib/admin/projects/repository", () => ({ getProject: async () => undefined }));
vi.mock("@/lib/admin/quotes/repository", () => ({ getQuote: async () => undefined }));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: () => renderInvoicePdf(),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
vi.mock("@/lib/admin/documents/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/documents/email")>()),
  sendDocumentMail: (...args: unknown[]) => sendDocumentMail(...args),
}));
vi.mock("@/lib/payments/pay-link", () => ({
  invoicePayLink: (...args: unknown[]) => invoicePayLink(...args),
  serviceActivatedBy: async () => undefined,
}));
vi.mock("@/lib/payments/activation-view", () => ({ mandateByCustomer: async () => new Set<string>() }));

const { cancelInvoice, finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { invoiceDocumentFile } = await import("@/lib/admin/invoices/document-actions");
const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");

const concept = invoiceFixture({
  status: "draft",
  number: { value: "FAC-CONCEPT-QLJB5", provisional: true },
  paymentReference: "FAC-CONCEPT-OUSHO",
  finalizingAt: undefined,
  issuedAt: undefined,
  document: undefined,
  sentAt: undefined,
  recipientEmail: undefined,
});

function conceptRow(): Record<string, unknown> {
  return {
    id: concept.id,
    number_value: concept.number.value,
    number_provisional: true,
    status: "draft",
    customer_id: concept.customer.customerId,
    customer_company_name: concept.customer.companyName,
    customer_contact_name: concept.customer.contactName,
    customer_email: concept.customer.email,
    customer_street: concept.customer.street,
    customer_postal_code: concept.customer.postalCode,
    customer_city: concept.customer.city,
    customer_country: concept.customer.country,
    customer_kvk_number: null,
    customer_vat_number: null,
    project_id: null,
    recurring_service_id: null,
    billing_period_start: null,
    billing_period_end: null,
    issue_date: concept.issueDate,
    due_date: concept.dueDate,
    finalizing_at: null,
    issued_at: null,
    activation_note: null,
    document_path: null,
    document_sha256: null,
    document_bytes: null,
    document_generated_at: null,
    payment_reference: concept.paymentReference,
    notes: "",
    quote_id: null,
    sent_at: null,
    recipient_email: null,
    updated_at: concept.updatedAt,
    invoice_lines: concept.lines.map((line, position) => ({
      id: line.id,
      position,
      description: line.description,
      quantity_hundredths: line.quantityHundredths,
      unit_price_cents: line.unitPriceCents,
      vat_rate: line.vatRate,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  renders = 0;
  rows.length = 0;
  rows.push(conceptRow());
  bucket.files.clear();
  bucket.uploads.length = 0;
  bucket.refusedUploads.length = 0;
  bucket.downloads.length = 0;
  sendDocumentMail.mockResolvedValue({ sent: true, sentAt: "2026-09-20T10:00:00.000Z" });
  invoicePayLink.mockResolvedValue({ kind: "none", reason: "not-configured" });
});

describe("one invoice, one PDF", () => {
  it("is rendered once at finalize, previewed and mailed from that file", async () => {
    const finalized = await finalizeInvoice("inv-1");
    expect(finalized).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);

    const preview = await invoiceDocumentFile("inv-1");
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const sent = await sendInvoiceToCustomer("inv-1");
    expect(sent).toEqual({ ok: true, value: "YM-F-2026-000001" });

    const previewed = Buffer.from(preview.value.base64, "base64");
    const attached = Buffer.from((sendDocumentMail.mock.calls[0]![0] as { pdf: Buffer }).pdf);
    const objectInBucket = onlyObject()[1];

    // Byte for byte, all three.
    expect(previewed.equals(attached)).toBe(true);
    expect(previewed.equals(objectInBucket)).toBe(true);

    // And one hash, which is also the one recorded on the invoice.
    const digest = sha256Hex(objectInBucket);
    expect(sha256Hex(previewed)).toBe(digest);
    expect(sha256Hex(attached)).toBe(digest);
    expect(preview.value.sha256).toBe(digest);
    expect(rows[0]!.document_sha256).toBe(digest);

    // Nothing rendered after the document was made: not for the preview, not
    // for the mail. The rigged renderer would have produced other bytes.
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);
    expect(previewed.toString()).toContain("render number 1");
    expect(bucket.uploads).toHaveLength(1);
  });

  it("hands out the same file on every later look and every resend", async () => {
    await finalizeInvoice("inv-1");

    const first = await invoiceDocumentFile("inv-1");
    const second = await invoiceDocumentFile("inv-1");
    await sendInvoiceToCustomer("inv-1");
    await sendInvoiceToCustomer("inv-1");

    expect(first.ok && second.ok && first.value.base64 === second.value.base64).toBe(true);
    const attachments = sendDocumentMail.mock.calls.map(([mail]) => Buffer.from((mail as { pdf: Buffer }).pdf));
    expect(attachments).toHaveLength(2);
    expect(attachments[0]!.equals(attachments[1]!)).toBe(true);
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);
  });

  /* The file is the document; a replacement is not the same document. */
  it("refuses to preview or send a file that no longer matches its hash", async () => {
    await finalizeInvoice("inv-1");
    bucket.files.set(onlyObject()[0], Buffer.from("%PDF-1.7\n% swapped\n%%EOF\n"));

    const preview = await invoiceDocumentFile("inv-1");
    const sent = await sendInvoiceToCustomer("inv-1");

    expect(preview.ok).toBe(false);
    expect(preview.ok === false && preview.error).toContain("controlesom");
    expect(sent.ok).toBe(false);
    expect(sent.ok === false && sent.error).toContain("controlesom");
    expect(sendDocumentMail).not.toHaveBeenCalled();
    // Still no second render: the answer to a bad file is not a new file.
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);
  });

  it("refuses both when the file is gone altogether", async () => {
    await finalizeInvoice("inv-1");
    bucket.files.clear();

    const preview = await invoiceDocumentFile("inv-1");
    const sent = await sendInvoiceToCustomer("inv-1");

    expect(preview.ok).toBe(false);
    expect(sent.ok).toBe(false);
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);
  });

  /*
    The number and the reference are settled in the same statement as the
    freeze, before the PDF exists, and neither moves afterwards.
  */
  it("keeps number and payment reference identical from finalize to send", async () => {
    await finalizeInvoice("inv-1");

    const afterIssue = { number: rows[0]!.number_value, reference: rows[0]!.payment_reference };
    await sendInvoiceToCustomer("inv-1");

    expect(afterIssue).toEqual({ number: "YM-F-2026-000001", reference: "YM-F-2026-000001" });
    expect(rows[0]!.number_value).toBe("YM-F-2026-000001");
    expect(rows[0]!.payment_reference).toBe("YM-F-2026-000001");
    const mailed = sendDocumentMail.mock.calls[0]![0] as { number: string; paymentReference?: string };
    expect(mailed.number).toBe("YM-F-2026-000001");
    expect(mailed.paymentReference).toBe("YM-F-2026-000001");
  });
});

/*
  Two admins pressing "Definitief maken" at the same instant, or one admin
  and a retry of their own request.

  Both render, and they render different files -- that is what the rigged
  renderer above imitates, and it is true of the real one too, which stamps a
  creation date and an id into every document. The danger is obvious once
  stated: if the second upload could replace the first, the row could hold
  the hash of one file and the bucket the bytes of another, and the invoice
  would be definitive and broken at the same time.

  It cannot happen, for two reasons that do not depend on each other. The
  upload does not overwrite, so the first file stored is the document. And
  the second caller, told the object exists, reads those bytes and records
  their hash -- it never records a hash of bytes it did not just read.
*/
describe("two finalizations at the same moment", () => {
  it("issues one document, and both callers end up with that one", async () => {
    const [first, second] = await Promise.all([finalizeInvoice("inv-1"), finalizeInvoice("inv-1")]);

    expect(first).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(second).toEqual({ ok: true, value: "YM-F-2026-000001" });

    /*
      Both rendered, and both may have stored their render -- they cannot
      collide, because the path carries the content hash. Exactly one of
      them is the document, and the row says which.
    */
    expect(renderInvoicePdf).toHaveBeenCalledTimes(2);
    expect(bucket.refusedUploads).toHaveLength(0);
    const [path, bytes] = referencedObject();
    expect(path).toContain(sha256Hex(bytes));
    expect(rows[0]!.document_sha256).toBe(sha256Hex(bytes));
  });

  it("records the hash of the file it points at, and never a different one", async () => {
    await Promise.all([finalizeInvoice("inv-1"), finalizeInvoice("inv-1")]);

    const [path, bytes] = referencedObject();
    expect(rows[0]!.document_sha256).toBe(sha256Hex(bytes));
    expect(rows[0]!.document_bytes).toBe(bytes.byteLength);
    expect(rows[0]!.document_path).toBe(path);

    /* Whatever else was rendered is at its own path and points at nothing. */
    for (const [otherPath, otherBytes] of bucket.files) {
      expect(otherPath).toContain(sha256Hex(otherBytes));
    }
  });

  it("leaves preview and attachment on those same bytes", async () => {
    await Promise.all([finalizeInvoice("inv-1"), finalizeInvoice("inv-1")]);

    const preview = await invoiceDocumentFile("inv-1");
    const sent = await sendInvoiceToCustomer("inv-1");

    expect(preview.ok && sent.ok).toBe(true);
    if (!preview.ok) return;

    const objectInBucket = referencedObject()[1];
    const previewed = Buffer.from(preview.value.base64, "base64");
    const attached = Buffer.from((sendDocumentMail.mock.calls[0]![0] as { pdf: Buffer }).pdf);

    expect(previewed.equals(objectInBucket)).toBe(true);
    expect(attached.equals(objectInBucket)).toBe(true);
    expect(renderInvoicePdf).toHaveBeenCalledTimes(2);
  });

  /* A document that is already recorded is never offered a different one. */
  it("refuses to record a second, different artifact", async () => {
    await finalizeInvoice("inv-1");
    const recorded = rows[0]!.document_sha256;

    const rogue = await rpc("complete_invoice_finalization", {
      p_invoice_id: "inv-1",
      p_path: rows[0]!.document_path as string,
      p_sha256: "b".repeat(64),
      p_bytes: 999,
    });

    expect(rogue.error).not.toBeNull();
    expect(rows[0]!.document_sha256).toBe(recorded);
  });
});

/*
  The crash this design has to survive: the upload landed, the process died
  before the row was written. The object is there, the invoice is numbered
  and frozen, and nothing says it is a document yet.
*/
describe("a finalization that died between storing and recording", () => {
  async function crashAfterUpload() {
    const real = rpcImplementation;
    rpcImplementation = async (name, args) =>
      name === "complete_invoice_finalization"
        ? { data: null, error: { message: "connection reset" } }
        : real(name, args);
    const result = await finalizeInvoice("inv-1");
    rpcImplementation = real;
    return result;
  }

  it("adopts the stored file instead of replacing it", async () => {
    const crashed = await crashAfterUpload();
    expect(crashed.ok).toBe(false);
    expect(bucket.uploads).toHaveLength(1);
    expect(rows[0]!.issued_at).toBeNull();

    const retried = await finalizeInvoice("inv-1");

    expect(retried).toEqual({ ok: true, value: "YM-F-2026-000001" });
    // The retry rendered again -- and threw that render away, unstored.
    expect(renderInvoicePdf).toHaveBeenCalledTimes(2);
    expect(bucket.uploads).toHaveLength(1);

    const objectInBucket = onlyObject()[1];
    expect(objectInBucket.toString()).toContain("render number 1");
    expect(rows[0]!.document_sha256).toBe(sha256Hex(objectInBucket));
  });

  it("hands that same file to the preview and the mail afterwards", async () => {
    await crashAfterUpload();
    await finalizeInvoice("inv-1");

    const preview = await invoiceDocumentFile("inv-1");
    await sendInvoiceToCustomer("inv-1");

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const objectInBucket = referencedObject()[1];
    expect(Buffer.from(preview.value.base64, "base64").equals(objectInBucket)).toBe(true);
    expect(Buffer.from((sendDocumentMail.mock.calls[0]![0] as { pdf: Buffer }).pdf).equals(objectInBucket)).toBe(true);
  });

  /* Nothing is left to do once the document exists. */
  it("does nothing at all when the invoice is already issued", async () => {
    await finalizeInvoice("inv-1");
    renderInvoicePdf.mockClear();

    const again = await finalizeInvoice("inv-1");

    expect(again).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(bucket.uploads).toHaveLength(1);
    expect(bucket.refusedUploads).toHaveLength(0);
  });
});

/*
  Cancelling is not a way back. The number was taken from a sequence that
  hands each one out once, and it stays taken -- whether the invoice got as
  far as having a PDF or not.
*/
describe("cancelling an invoice that was never finished", () => {
  it("keeps the number and never returns it to the series", async () => {
    await crashBeforeRecording();

    const cancelled = await cancelInvoice("inv-1");

    expect(cancelled).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(rows[0]!.number_value).toBe("YM-F-2026-000001");
    expect(rows[0]!.number_provisional).toBe(false);
    expect(rows[0]!.finalizing_at).not.toBeNull();
    expect(rows[0]!.status).toBe("cancelled");
  });

  it("cannot be finished afterwards, and issues no second number", async () => {
    await crashBeforeRecording();
    rows[0]!.status = "cancelled";

    const result = await finalizeInvoice("inv-1");

    expect(result).toEqual({ ok: false, error: "Een geannuleerde factuur wordt niet definitief gemaakt." });
    expect(rows[0]!.number_value).toBe("YM-F-2026-000001");
    expect(rows[0]!.issued_at).toBeNull();
  });

  async function crashBeforeRecording() {
    const real = rpcImplementation;
    rpcImplementation = async (name, args) =>
      name === "complete_invoice_finalization"
        ? { data: null, error: { message: "connection reset" } }
        : real(name, args);
    await finalizeInvoice("inv-1");
    rpcImplementation = real;
  }
});
