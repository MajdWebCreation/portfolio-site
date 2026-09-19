import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/admin/invoices/artifact";
import { createFinalizationRpc, fakeInvoiceStorage, fixtureDocumentPath } from "@/lib/admin/invoices/storage-fixture";
import { invoiceFixture, recurringFixture } from "@/lib/payments/fixtures";
import type { RecurringService } from "@/lib/payments/types";

/*
  Making an invoice definitive, with the database and the bucket replaced.

  What is under test is the whole of issuing: which invoices may be issued,
  what is frozen into the document, that exactly one PDF is made and stored,
  and -- just as important -- everything this step refuses to do. Issuing is
  not a customer event: no mail, no communication record, no payment page.

  The row lock that serialises two simultaneous callers lives in
  `begin_invoice_finalization`; here the tables are in memory, so what is
  asserted is what the action does with the answers: one number per invoice,
  one artifact, and a second run that adds neither.
*/
const rows: Record<string, unknown>[] = [];
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
const select = vi.fn(() => ({
  eq: () => ({ maybeSingle: async () => ({ data: rows.find((row) => row.id === "inv-1") ?? null, error: null }) }),
}));
const from = vi.fn(() => ({ update, select }));
const sendDocumentMail = vi.fn();
const logCommunication = vi.fn();
const createPaymentLink = vi.fn();
const ensureInvoiceCheckout = vi.fn();
const renderInvoicePdf = vi.fn(async () => Buffer.from("%PDF-1.7 rendered once\n"));

let bucket = fakeInvoiceStorage();
let sequence = 1;
let rpcImplementation = createFinalizationRpc(
  () => rows,
  () => `YM-F-2026-${String(sequence++).padStart(6, "0")}`,
);
const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => rpcImplementation(name, args ?? {}));

let stored = invoiceFixture();
let service: RecurringService | undefined;
let mandates = new Set<string>();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({ from, rpc, storage: bucket.storage }),
}));
vi.mock("@/lib/admin/invoices/repository", () => ({ getInvoice: async () => stored }));
vi.mock("@/lib/payments/pay-link", () => ({ serviceActivatedBy: async () => service }));
vi.mock("@/lib/payments/activation-view", () => ({ mandateByCustomer: async () => mandates }));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: () => renderInvoicePdf(),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
/* Nothing below may be reached; they are mocked so that reaching them shows. */
vi.mock("@/lib/admin/documents/email", () => ({ sendDocumentMail }));
vi.mock("@/lib/admin/communications/log", () => ({ logCommunication }));
vi.mock("@/lib/payments/checkout", () => ({ ensureInvoiceCheckout }));
vi.mock("@/lib/mollie/client", () => ({ createPaymentLink, getPaymentLink: vi.fn(), payableLink: vi.fn() }));

const { cancelInvoice, finalizeInvoice } = await import("@/lib/admin/invoices/finalize");

/** The row `issueInvoiceDocument` reads back after numbering. */
function rowFor(invoice: ReturnType<typeof invoiceFixture>): Record<string, unknown> {
  return {
    id: invoice.id,
    number_value: invoice.number.value,
    number_provisional: invoice.number.provisional,
    status: invoice.status,
    customer_id: invoice.customer.customerId,
    customer_company_name: invoice.customer.companyName,
    customer_contact_name: invoice.customer.contactName,
    customer_email: invoice.customer.email,
    customer_street: invoice.customer.street,
    customer_postal_code: invoice.customer.postalCode,
    customer_city: invoice.customer.city,
    customer_country: invoice.customer.country,
    customer_kvk_number: null,
    customer_vat_number: null,
    project_id: null,
    recurring_service_id: null,
    billing_period_start: null,
    billing_period_end: null,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    finalizing_at: invoice.finalizingAt ?? null,
    issued_at: invoice.issuedAt ?? null,
    activation_note: invoice.activationNote ?? null,
    document_path: invoice.document?.path ?? null,
    document_sha256: invoice.document?.sha256 ?? null,
    document_bytes: invoice.document?.bytes ?? null,
    document_generated_at: invoice.document?.generatedAt ?? null,
    payment_reference: invoice.paymentReference,
    notes: invoice.notes,
    quote_id: null,
    sent_at: invoice.sentAt ?? null,
    recipient_email: invoice.recipientEmail ?? null,
    updated_at: invoice.updatedAt,
    invoice_lines: invoice.lines.map((line, position) => ({
      id: line.id,
      position,
      description: line.description,
      quantity_hundredths: line.quantityHundredths,
      unit_price_cents: line.unitPriceCents,
      vat_rate: line.vatRate,
    })),
  };
}

/** Puts an invoice in front of the action and in the fake table. */
function place(invoice: ReturnType<typeof invoiceFixture>) {
  stored = invoice;
  rows.length = 0;
  rows.push(rowFor(invoice));
}

/** A concept as the builder leaves it: provisional number, nothing issued. */
function concept(overrides: Parameters<typeof invoiceFixture>[0] = {}) {
  return invoiceFixture({
    status: "draft",
    number: { value: "FAC-CONCEPT-QLJB5", provisional: true },
    paymentReference: "FAC-CONCEPT-OUSHO",
    finalizingAt: undefined,
    issuedAt: undefined,
    document: undefined,
    sentAt: undefined,
    recipientEmail: undefined,
    ...overrides,
  });
}

/** What the fake table says about the invoice after the action ran. */
const row = () => rows[0]!;

beforeEach(() => {
  vi.clearAllMocks();
  bucket = fakeInvoiceStorage();
  sequence = 1;
  rpcImplementation = createFinalizationRpc(
    () => rows,
    () => `YM-F-2026-${String(sequence++).padStart(6, "0")}`,
  );
  place(concept());
  service = undefined;
  mandates = new Set();
});

describe("making a concept definitive", () => {
  it("numbers the invoice, renders one PDF and stores it", async () => {
    const result = await finalizeInvoice("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);
    expect(bucket.uploads).toHaveLength(1);
    const path = bucket.uploads[0]!.path;
    // Number plus the hash of the bytes: nothing else can land on that path.
    const pdf = bucket.files.get(path)!;
    expect(path).toBe(`2026/YM-F-2026-000001-${sha256Hex(pdf)}.pdf`);
    expect(row().document_path).toBe(path);
    expect(row().document_sha256).toBe(sha256Hex(pdf));
    expect(row().document_bytes).toBe(pdf.byteLength);
    expect(row().issued_at).not.toBeNull();
    expect(row().status).toBe("issued");
  });

  /* The concept reference follows the number it was always going to become. */
  it("settles the payment reference against that number", async () => {
    await finalizeInvoice("inv-1");

    expect(row().payment_reference).toBe("YM-F-2026-000001");
  });

  it("keeps a reference the admin typed", async () => {
    place(concept({ paymentReference: "PO-4417" }));

    await finalizeInvoice("inv-1");

    expect(row().payment_reference).toBe("PO-4417");
    expect(row().number_value).toBe("YM-F-2026-000001");
  });

  it("writes nothing of its own beside the two functions", async () => {
    await finalizeInvoice("inv-1");

    expect(update).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "begin_invoice_finalization",
      "complete_invoice_finalization",
    ]);
  });

  it("tells no customer anything", async () => {
    await finalizeInvoice("inv-1");

    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(logCommunication).not.toHaveBeenCalled();
  });

  it("creates no payment", async () => {
    await finalizeInvoice("inv-1");

    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(ensureInvoiceCheckout).not.toHaveBeenCalled();
  });

  /* A second click is not an error, not a second number and not a second file. */
  it("is idempotent once the invoice is a document", async () => {
    await finalizeInvoice("inv-1");
    const storedPath = bucket.uploads[0]!.path;
    const first = bucket.files.get(storedPath);
    renderInvoicePdf.mockClear();

    /* What the screen would hand the action on a second click. */
    place(
      invoiceFixture({
        status: "issued",
        sentAt: undefined,
        recipientEmail: undefined,
        document: {
          path: storedPath,
          sha256: sha256Hex(first!),
          bytes: first!.byteLength,
          generatedAt: "2026-09-20T09:00:01.000Z",
        },
      }),
    );
    const again = await finalizeInvoice("inv-1");

    expect(again).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(bucket.uploads).toHaveLength(1);
    expect(bucket.files.get(storedPath)).toEqual(first);
  });

  it("refuses a cancelled invoice", async () => {
    place(concept({ status: "cancelled" }));

    const result = await finalizeInvoice("inv-1");

    expect(result).toEqual({ ok: false, error: "Een geannuleerde factuur wordt niet definitief gemaakt." });
    expect(rpc).not.toHaveBeenCalled();
    expect(renderInvoicePdf).not.toHaveBeenCalled();
  });

  /*
    Refusing costs nothing; a number does. The sequence never hands the same
    one out twice, so an invoice issued with a customer who cannot be mailed
    leaves a gap that has to be explained.
  */
  it("refuses an incomplete document before the counter moves", async () => {
    place(concept({ customer: { ...invoiceFixture().customer, street: "" } }));

    const result = await finalizeInvoice("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("adres");
    expect(rpc).not.toHaveBeenCalled();
    expect(bucket.uploads).toEqual([]);
  });

  it("reports a refusal from the database instead of claiming success", async () => {
    rpcImplementation = async () => ({ data: null, error: { message: "permission denied" } });

    const result = await finalizeInvoice("inv-1");

    expect(result).toEqual({ ok: false, error: "permission denied" });
    expect(bucket.uploads).toEqual([]);
  });
});

/*
  Storage and Postgres are not one transaction, so the interesting question is
  what a failure in between leaves behind. The answer has to be: a numbered,
  frozen invoice that is not a document, cannot be sent, and can be finished
  by pressing the button again.
*/
describe("when storing the PDF fails", () => {
  it("leaves no usable invoice behind, and says so", async () => {
    bucket.failNextUpload("network unreachable");

    const result = await finalizeInvoice("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("kon niet worden opgeslagen");
    // Numbered and frozen, but not issued: no artifact, no document.
    expect(row().number_value).toBe("YM-F-2026-000001");
    expect(row().finalizing_at).not.toBeNull();
    expect(row().issued_at).toBeNull();
    expect(row().document_path).toBeNull();
    expect(row().status).toBe("draft");
  });

  it("is finished by trying again, on the same number and with one file", async () => {
    bucket.failNextUpload("network unreachable");
    await finalizeInvoice("inv-1");

    /* The screen reloads: numbered, frozen, no document yet. */
    place(
      invoiceFixture({
        status: "draft",
        finalizingAt: "2026-09-20T09:00:00.000Z",
        issuedAt: undefined,
        document: undefined,
        sentAt: undefined,
        recipientEmail: undefined,
      }),
    );
    rows[0]!.finalizing_at = "2026-09-20T09:00:00.000Z";

    const result = await finalizeInvoice("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    // The same number: the counter did not move a second time.
    expect(row().number_value).toBe("YM-F-2026-000001");
    expect(row().issued_at).not.toBeNull();
    expect(bucket.files.size).toBe(1);
    expect(row().document_sha256).toBe(sha256Hex(bucket.files.get(row().document_path as string)!));
  });
});

describe("the monthly-service note that is frozen into the document", () => {
  beforeEach(() => {
    service = recurringFixture({ id: "svc-1", name: "Websitebeheer", amountCents: 2500, vatRate: 21, startsOn: "2026-10-01" });
  });

  it("is frozen when paying this invoice is what establishes the mandate", async () => {
    await finalizeInvoice("inv-1");

    expect(rpc).toHaveBeenCalledWith("begin_invoice_finalization", {
      p_invoice_id: "inv-1",
      p_activation: {
        serviceId: "svc-1",
        serviceName: "Websitebeheer",
        monthlyNetCents: 2500,
        monthlyGrossCents: 3025,
        firstDebitOn: "2026-10-01",
      },
    });
    expect(row().activation_note).toMatchObject({ serviceName: "Websitebeheer", monthlyGrossCents: 3025 });
  });

  /* Already authorised: the document must not announce a mandate again. */
  it("is left off when the customer already gave a mandate", async () => {
    mandates = new Set(["cust-1"]);

    await finalizeInvoice("inv-1");

    expect(rpc).toHaveBeenCalledWith("begin_invoice_finalization", { p_invoice_id: "inv-1" });
    expect(row().activation_note).toBeNull();
  });

  it("is left off when no service hangs off the invoice", async () => {
    service = undefined;

    await finalizeInvoice("inv-1");

    expect(rpc).toHaveBeenCalledWith("begin_invoice_finalization", { p_invoice_id: "inv-1" });
  });

  /* A retry keeps the note the document was frozen with, not today's answer. */
  it("is not recomputed when an unfinished finalization is completed", async () => {
    const note = {
      serviceId: "svc-1",
      serviceName: "Websitebeheer",
      monthlyNetCents: 2500,
      monthlyGrossCents: 3025,
      firstDebitOn: "2026-10-01",
    };
    place(
      invoiceFixture({
        status: "draft",
        finalizingAt: "2026-09-20T09:00:00.000Z",
        issuedAt: undefined,
        document: undefined,
        sentAt: undefined,
        recipientEmail: undefined,
        activationNote: note,
      }),
    );
    mandates = new Set(["cust-1"]);

    await finalizeInvoice("inv-1");

    expect(rpc).toHaveBeenCalledWith("begin_invoice_finalization", { p_invoice_id: "inv-1", p_activation: note });
  });
});

describe("an invoice that is definitive but is not going to be sent", () => {
  it("is cancelled without giving the number back", async () => {
    place(invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined }));

    const result = await cancelInvoice("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    // Only the status moves: the number, the reference and the figures stay.
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    // The number and its file stay exactly where they are.
    expect(row().number_value).toBe("YM-F-2026-000001");
    expect(row().document_path).toBe(fixtureDocumentPath);
  });

  it("is refused once the customer has it", async () => {
    place(invoiceFixture({ status: "sent", sentAt: "2026-09-18T10:00:00.000Z" }));

    const result = await cancelInvoice("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("creditfactuur");
    expect(update).not.toHaveBeenCalled();
  });

  it("says the same thing twice when it is already cancelled", async () => {
    place(invoiceFixture({ status: "cancelled", sentAt: undefined, recipientEmail: undefined }));

    const result = await cancelInvoice("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("the invariants the migration states", () => {
  const sql = readFileSync("supabase/migrations/20260919201342_invoice_finalization.sql", "utf8");

  it("ties the number, the issue moment and the file to each other", () => {
    expect(sql).toContain("check ((finalizing_at is null) = number_provisional)");
    expect(sql).toContain("check (issued_at is null or finalizing_at is not null)");
    expect(sql).toContain("check (sent_at is null or issued_at is not null)");
  });

  /* No invoice counts as definitive without its PDF. */
  it("requires a document for anything issued from now on", () => {
    expect(sql).toContain("add constraint invoices_issued_has_document");
    expect(sql).toContain("or document_path is not null");
    expect(sql).toContain("document_sha256 ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("document_bytes > 0");
  });

  it("knows the definitive-but-unsent status", () => {
    expect(sql).toContain("check (status in ('draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled'))");
  });

  /* The freeze starts when the number is taken: the PDF is rendered after. */
  it("freezes the document from the moment it is numbered", () => {
    expect(sql).toContain("if old.finalizing_at is null then\n    return new;");
    expect(sql).toContain("select finalizing_at, number_value into v_frozen_at, v_number");
    expect(sql).not.toContain("if old.sent_at is null then");
  });

  it("writes the file and the issue moment once, and never again", () => {
    expect(sql).toContain("if new.finalizing_at is distinct from old.finalizing_at then");
    expect(sql).toContain("if new.issued_at             is distinct from old.issued_at");
    expect(sql).toContain("or new.document_sha256    is distinct from old.document_sha256");
    expect(sql).toContain("if new.status = 'draft' then");
  });

  it("keeps both functions reachable only for a signed-in admin", () => {
    for (const signature of [
      "public.begin_invoice_finalization(uuid, jsonb)",
      "public.complete_invoice_finalization(uuid, text, text, integer)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    }
    expect(sql).toContain("security invoker");
  });

  /* A private bucket, and one nobody can write over. */
  it("stores the PDFs in a private bucket that cannot be overwritten", () => {
    expect(sql).toContain("'invoice-documents', 'invoice-documents', false, 10485760, array['application/pdf']");
    expect(sql).toContain("create policy invoice_documents_admin_read");
    expect(sql).toContain("create policy invoice_documents_admin_insert");
    // The two that would let a stored document be replaced or removed.
    expect(sql).not.toContain("create policy invoice_documents_admin_update");
    expect(sql).not.toContain("create policy invoice_documents_admin_delete");
  });

  /*
    The second half of the same rule: a document that is recorded is never
    exchanged for another, and a caller that arrives late is handed the one
    that is there rather than writing its own.
  */
  it("refuses a second, different artifact and returns the first", () => {
    expect(sql).toContain("if p_path is distinct from v_path");
    expect(sql).toContain("or p_sha256 is distinct from v_sha256");
    expect(sql).toContain("or p_bytes is distinct from v_bytes");
    expect(sql).toContain("een afwijkend document wordt niet vastgelegd");
    expect(sql).toContain("'adopted', true");
  });

  /* Serialised on the row, and the write itself asks again. */
  it("completes under a row lock and only while nothing is recorded", () => {
    const complete = sql.slice(sql.indexOf("create or replace function public.complete_invoice_finalization"));
    expect(complete.slice(0, complete.indexOf("$$;"))).toContain("for update");
    expect(complete).toContain("where id = p_invoice_id\n     and issued_at is null;");
  });

  /* The payment reference rule, as SQL asks it. */
  it("treats an empty or provisional reference as the concept's own", () => {
    expect(sql).toContain("coalesce(btrim(v_reference), '') = ''");
    expect(sql).toContain("v_reference like 'FAC-CONCEPT-%'");
    expect(sql).toContain("v_reference like 'OFF-CONCEPT-%'");
    expect(sql).toContain("v_reference := v_number;");
  });

  it("writes the number and the reference in one statement, and the file with the issue moment in another", () => {
    const begin = sql.slice(sql.indexOf("update public.invoices\n     set number_value"));
    for (const column of ["number_value", "number_provisional", "finalizing_at", "payment_reference", "activation_note"]) {
      expect(begin.slice(0, begin.indexOf(";"))).toContain(column);
    }

    const complete = sql.slice(sql.indexOf("update public.invoices\n     set issued_at"));
    for (const column of ["issued_at", "document_path", "document_sha256", "document_bytes", "document_generated_at"]) {
      expect(complete.slice(0, complete.indexOf(";"))).toContain(column);
    }
  });

  /*
    Historical invoices keep whatever they were. Generating a PDF today and
    filing it as the document a customer received last month is the one thing
    an artifact store must never do.
  */
  it("leaves invoices issued before it without a fabricated artifact", () => {
    expect(sql).toContain("set finalizing_at = coalesce(sent_at, created_at),");
    expect(sql).toContain("issued_at < timestamptz '2026-09-19 21:00:00+00'");
  });
});
