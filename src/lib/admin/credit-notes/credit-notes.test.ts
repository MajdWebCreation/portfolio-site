import { describe, expect, it, vi } from "vitest";
import { buildCreditNoteMailBody, creditNoteSubject } from "@/lib/admin/documents/credit-note-mail";
import { creditCapExceeded, creditNoteLinesInvalid, isFullyCredited } from "@/lib/admin/credit-notes/issue";
import { invoiceLedger } from "@/lib/admin/credit-notes/settlement";
import { creditNoteRpc, invoiceRowFixture } from "@/lib/admin/credit-notes/test-support";
import { invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import { creditNoteMetaRows, creditNoteSettlementNote, creditNoteTotalsLabels } from "@/lib/admin/pdf/credit-note-pdf";
import { cancellationCreditDraft, lastTermCredit, lastTermInvoice } from "@/lib/payments/cancellation-credit";
import { cancellationPlan } from "@/lib/payments/cancellation-plan";
import { createFakeDb, invoiceFixture, recurringFixture } from "@/lib/payments/fixtures";
import { formatCents } from "@/lib/money";
import { recurringManagement } from "@/lib/payments/recurring-management";

/* The PDF renderer is a megabyte of fonts; the flow only needs bytes. */
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderCreditNotePdf: vi.fn(async (note: { number: { value: string } }) => Buffer.from(`%PDF ${note.number.value}`)),
  renderInvoicePdf: vi.fn(),
  renderQuotePdf: vi.fn(),
  documentFileName: (number: string) => `${number}.pdf`,
}));

const { createCreditNote } = await import("@/lib/admin/credit-notes/issue");

function seed(invoiceOverrides: Record<string, unknown> = {}) {
  const { invoice, lines } = invoiceRowFixture(invoiceOverrides);
  return createFakeDb({ invoices: [invoice], invoice_lines: lines, credit_notes: [], credit_note_lines: [] }, { rpc: creditNoteRpc() });
}

type Db = Parameters<typeof createCreditNote>[0];

const half = { description: "50% creditering", quantityHundredths: 100, unitPriceCents: 5000, vatRate: 21 };
const full = { description: "Volledige creditering", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 };

describe("making a credit note", () => {
  it("credits an invoice in full: own number, frozen totals, stored PDF, invoice untouched", async () => {
    const db = seed();
    const before = JSON.stringify(db.rows("invoices")[0]);
    const result = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Werk niet geleverd", issueDate: "2026-10-10", lines: [full], source: "manual" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creditNote.number).toEqual({ value: "YM-C-2026-000001", provisional: false });
    expect(result.creditNote).toMatchObject({ subtotalCents: 10000, vatCents: 2100, totalCents: 12100, status: "issued", invoiceId: "inv-1" });
    expect(result.creditNote.issuedAt).toBeTruthy();
    expect(result.creditNote.document?.path).toBe(`2026/YM-C-2026-000001-${result.creditNote.document?.sha256}.pdf`);
    expect(db.bucket.files.has(result.creditNote.document!.path)).toBe(true);
    // Invariant 1: the original invoice row did not move by a byte.
    expect(JSON.stringify(db.rows("invoices")[0])).toBe(before);
    expect(db.rows("invoice_lines")).toHaveLength(1);
  });

  it("credits half: 50,00 excl., 10,50 VAT, 60,50 incl.", async () => {
    const db = seed();
    const result = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Korting achteraf", issueDate: "2026-10-10", lines: [half], source: "manual" });
    expect(result.ok && result.creditNote).toMatchObject({ subtotalCents: 5000, vatCents: 1050, totalCents: 6050 });
    expect(db.rows("credit_note_lines")[0]).toMatchObject({ unit_price_cents: 5000, vat_rate: 21 });
  });

  it("refuses more than the invoice charged, in one note or across two", async () => {
    const db = seed();
    const tooMuch = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Fout", issueDate: "2026-10-10", lines: [{ ...full, unitPriceCents: 10001 }], source: "manual" });
    expect(tooMuch).toMatchObject({ ok: false, error: expect.stringContaining("meer gecrediteerd") });
    expect(db.rows("credit_notes")).toHaveLength(0);

    expect((await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Eerste helft", issueDate: "2026-10-10", lines: [half], source: "manual" })).ok).toBe(true);
    const second = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Te veel", issueDate: "2026-10-11", lines: [{ ...half, unitPriceCents: 5001 }], source: "manual" });
    expect(second).toMatchObject({ ok: false, error: expect.stringContaining("meer gecrediteerd") });
    const rest = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Tweede helft", issueDate: "2026-10-11", lines: [half], source: "manual" });
    expect(rest.ok && rest.creditNote.number.value).toBe("YM-C-2026-000002");

    // The same rule, as the form reads it before the database is asked.
    const invoiceLines = [{ description: "Werk", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 }];
    expect(creditCapExceeded({ invoiceLines, creditedLines: [half], draftLines: [{ ...half, unitPriceCents: 5001 }] })).toContain("maximaal 50,00 euro");
    expect(creditCapExceeded({ invoiceLines, creditedLines: [half], draftLines: [half] })).toBeNull();
    expect(creditCapExceeded({ invoiceLines, creditedLines: [], draftLines: [{ ...half, vatRate: 9 }] })).toContain("9% btw");
    expect(isFullyCredited(invoiceLines, [half, half])).toBe(true);
    expect(isFullyCredited(invoiceLines, [half])).toBe(false);
  });

  it("refuses an invoice that was never sent, a cancelled one, and bad lines", async () => {
    const unsent = seed({ sent_at: null, status: "issued" });
    expect(await createCreditNote(unsent as unknown as Db, { invoiceId: "inv-1", reason: "x", issueDate: "2026-10-10", lines: [half], source: "manual" })).toMatchObject({ ok: false, error: expect.stringContaining("nooit verstuurd") });
    const cancelled = seed({ status: "cancelled" });
    expect(await createCreditNote(cancelled as unknown as Db, { invoiceId: "inv-1", reason: "x", issueDate: "2026-10-10", lines: [half], source: "manual" })).toMatchObject({ ok: false, error: expect.stringContaining("geannuleerd") });
    expect(creditNoteLinesInvalid([])).toBe("Voeg minstens één regel toe.");
    expect(creditNoteLinesInvalid([{ ...half, unitPriceCents: -1 }])).toContain("negatief");
    expect(creditNoteLinesInvalid([{ ...half, description: " " }])).toContain("omschrijving");
    expect(await createCreditNote(seed() as unknown as Db, { invoiceId: "inv-1", reason: " ", issueDate: "2026-10-10", lines: [half], source: "manual" })).toMatchObject({ ok: false, error: "Geef een reden op." });
  });

  it("finishes a note whose PDF did not get stored, keeping its number", async () => {
    const db = seed();
    db.bucket.failNextUpload("bucket offline");
    const first = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Korting", issueDate: "2026-10-10", lines: [half], source: "manual" });
    expect(first).toMatchObject({ ok: false, error: expect.stringContaining("YM-C-2026-000001 blijft") });
    const row = db.rows("credit_notes")[0]!;
    expect(row).toMatchObject({ number_value: "YM-C-2026-000001", issued_at: null });

    const { issueCreditNoteDocument } = await import("@/lib/admin/credit-notes/issue");
    const finished = await issueCreditNoteDocument(db as unknown as Db, row.id as string);
    expect(finished.ok && finished.creditNote.number.value).toBe("YM-C-2026-000001");
    expect(row.issued_at).toBeTruthy();
    // The ledger only counts it from this moment on.
    const invoice = invoiceFromRow({ ...db.rows("invoices")[0], invoice_lines: db.rows("invoice_lines"), credit_notes: db.rows("credit_notes") } as unknown as InvoiceRow);
    expect(invoice.creditedCents).toBe(6050);
  });
});

describe("the credit for a cancelled monthly service", () => {
  /* EUR 30 per month, 30-day period, cancelled on the 15th, ends the 15th of next month: 15 of 30 days used, EUR 15 owed back. */
  const service = recurringFixture({
    id: "svc-1",
    name: "Websitebeheer",
    amountCents: 3000,
    vatRate: 21,
    startsOn: "2026-11-01",
    status: "active",
    mollie: { subscriptionId: "sub_1" },
    endsOn: "2026-12-15",
    cancellationRequestedAt: "2026-11-15T10:00:00.000Z",
  });
  const billed = ["2026-11-01", "2026-12-01"];
  const lastInvoice = invoiceFixture({ id: "inv-dec", number: { value: "YM-F-2026-000012", provisional: false }, recurringServiceId: "svc-1", billingPeriodStart: "2026-12-01", billingPeriodEnd: "2026-12-31", netCents: 3000, status: "paid" });

  it("is the lifecycle's own figure: 15 unused days of 31, net 1548, and the same in the plan, the screen and the note", () => {
    const credit = lastTermCredit({ service, priceChanges: [], billedPeriodStarts: billed });
    expect(credit).toMatchObject({ days: 16, fullNetCents: 3000, proratedNetCents: 1452, netCents: 1548, grossCents: 1873 });
    // December has 31 days: 15 used, 16 not. The plan computes the same.
    const plan = cancellationPlan({ startsOn: "2026-11-01", amountCents: 3000, vatRate: 21, priceChanges: [], billedPeriodStarts: billed, todayKey: "2026-11-15", requestedEndsOn: "2026-12-15" });
    expect(!("error" in plan) && plan.creditDue).toEqual({ days: 16, netCents: 1548, grossCents: 1873 });
    const view = recurringManagement({ service, priceChanges: [], billedPeriodStarts: billed, overview: { state: "not_needed", reason: "ended" }, todayKey: "2026-12-20" });
    expect(view.ending?.creditDue).toEqual({ days: 16, netCents: 1548, grossCents: 1873 });
    expect(lastTermInvoice(service, [lastInvoice])?.id).toBe("inv-dec");

    const draft = cancellationCreditDraft({ service, invoice: lastInvoice, credit: credit!, issueDate: "2026-12-20" });
    expect(draft).toMatchObject({ invoiceId: "inv-dec", source: "cancellation_credit", recurringServiceId: "svc-1" });
    expect(draft.lines).toEqual([{ description: expect.stringContaining("16 niet geleverde dagen (2026-12-16 t/m 2026-12-31)"), quantityHundredths: 100, unitPriceCents: 1548, vatRate: 21 }]);
  });

  it("gives the specification's example exactly: 30 days, 15 used, EUR 15 excl. to credit", () => {
    const thirtyDays = recurringFixture({ ...service, startsOn: "2026-09-01", endsOn: "2026-11-15" });
    // November has 30 days; service ends the 15th: 15 used, 15 not.
    const credit = lastTermCredit({ service: thirtyDays, priceChanges: [], billedPeriodStarts: ["2026-09-01", "2026-10-01", "2026-11-01"] });
    expect(credit).toMatchObject({ days: 15, netCents: 1500, grossCents: 1815 });
  });

  it("is made once: a second click on the same service hands back the first note", async () => {
    const { invoice, lines } = invoiceRowFixture({ id: "inv-dec", number_value: "YM-F-2026-000012", recurring_service_id: "svc-1", billing_period_start: "2026-12-01", billing_period_end: "2026-12-31" });
    lines[0]!.unit_price_cents = 3000;
    const db = createFakeDb({ invoices: [invoice], invoice_lines: lines, credit_notes: [], credit_note_lines: [] }, { rpc: creditNoteRpc() });
    const credit = lastTermCredit({ service, priceChanges: [], billedPeriodStarts: billed })!;
    const draft = cancellationCreditDraft({ service, invoice: { id: "inv-dec" }, credit, issueDate: "2026-12-20" });

    const first = await createCreditNote(db as unknown as Db, draft);
    const second = await createCreditNote(db as unknown as Db, draft);
    expect(first).toMatchObject({ ok: true, reused: false });
    expect(second).toMatchObject({ ok: true, reused: true });
    expect(first.ok && second.ok && second.creditNote.id).toBe(first.ok && first.creditNote.id);
    expect(db.rows("credit_notes")).toHaveLength(1);
    expect(db.rows("credit_notes")[0]).toMatchObject({ source: "cancellation_credit", recurring_service_id: "svc-1", total_cents: 1873 });
  });

  it("nothing is owed when the last term was collected pro rata, or ends on a period end", () => {
    expect(lastTermCredit({ service: { ...service, lastTerm: { amountCents: 1452, syncedAt: "x" } }, priceChanges: [], billedPeriodStarts: billed })).toBeUndefined();
    expect(lastTermCredit({ service: { ...service, endsOn: "2026-12-31" }, priceChanges: [], billedPeriodStarts: billed })).toBeUndefined();
    expect(lastTermCredit({ service, priceChanges: [], billedPeriodStarts: ["2026-11-01"] })).toBeUndefined();
  });
});

describe("the credit note as document and mail", () => {
  const note = {
    id: "cn-1",
    number: { value: "YM-C-2026-000001", provisional: false },
    status: "issued" as const,
    customer: invoiceFixture().customer,
    invoiceId: "inv-1",
    reason: "Korting achteraf",
    issueDate: "2026-10-10",
    source: "manual" as const,
    lines: [{ id: "c1", description: "50% creditering", quantityHundredths: 100, unitPriceCents: 5000, vatRate: 21 }],
    subtotalCents: 5000,
    vatCents: 1050,
    totalCents: 6050,
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
  };

  it("prints what it corrects, labels the totals as credited, and says where the money goes", () => {
    expect(creditNoteMetaRows(note, "YM-F-2026-000001")).toEqual([
      { label: "Creditnotadatum", value: "10 okt 2026" },
      { label: "Betreft factuur", value: "YM-F-2026-000001" },
      { label: "Kenmerk", value: "YM-C-2026-000001" },
    ]);
    expect(creditNoteTotalsLabels).toEqual({ subtotal: "Gecrediteerd excl. btw", total: "Totaal gecrediteerd incl. btw" });
    expect(creditNoteSettlementNote(note, "YM-F-2026-000001")).toContain(`corrigeert factuur YM-F-2026-000001 met ${formatCents(6050)}`);
  });

  it("mails a cover note with the number, the invoice, the amount and the reason, in both renderings", () => {
    expect(creditNoteSubject("YM-C-2026-000001")).toBe("Creditnota YM-C-2026-000001 | YM Creations");
    const paid = buildCreditNoteMailBody({ contactName: "A. Alfa", number: "YM-C-2026-000001", invoiceNumber: "YM-F-2026-000001", issueDateLabel: "10 okt 2026", reason: "Korting achteraf", totalLabel: "€ 60,50", invoicePaid: true, pdf: new Uint8Array(), fileName: "x.pdf" });
    for (const needle of ["Beste A. Alfa", "YM-C-2026-000001", "YM-F-2026-000001", "60,50", "Korting achteraf", "wordt aan u terugbetaald"]) {
      expect(paid.text).toContain(needle);
      expect(paid.html).toContain(needle);
    }
    const open = buildCreditNoteMailBody({ contactName: "A. Alfa", number: "YM-C-2026-000001", invoiceNumber: "YM-F-2026-000001", issueDateLabel: "10 okt 2026", reason: "Korting achteraf", totalLabel: "€ 60,50", invoicePaid: false, pdf: new Uint8Array(), fileName: "x.pdf" });
    expect(open.text).toContain("in mindering gebracht");
    expect(open.text).not.toContain("terugbetaald");
  });

  it("appears in the ledger of its invoice the moment it is issued", () => {
    const issued = { ...note, finalizingAt: "2026-10-10T10:00:01.000Z", issuedAt: "2026-10-10T10:00:02.000Z", document: { path: "2026/x.pdf", sha256: "b".repeat(64), bytes: 10, generatedAt: "2026-10-10T10:00:02.000Z" } };
    const ledger = invoiceLedger({ invoice: invoiceFixture(), payments: [], creditNotes: [issued], refunds: [] });
    expect(ledger.notes.map((entry) => entry.creditNoteId)).toEqual(["cn-1"]);
  });
});
