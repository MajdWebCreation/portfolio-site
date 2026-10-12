import { describe, expect, it } from "vitest";
import { portalOverview } from "@/lib/portal/dashboard";
import { invoiceFromPortalRow, invoiceSummary, paymentMethodLabel, portalInvoiceView, type PortalInvoice, type PortalInvoiceRow } from "@/lib/portal/invoices/model";
import { portalQuoteState, quoteFromPortalRow, type PortalQuote } from "@/lib/portal/quotes/model";
import { portalServiceView, serviceFromPortalRow, type PortalService } from "@/lib/portal/services/model";

/*
  The portal's derivations over what the functions return. The figures are
  the admin's own helpers; these tests pin that the portal feeds them the
  right facts and words the answer for a customer.
*/
const today = "2026-10-12";

function invoiceRow(overrides: Partial<PortalInvoiceRow> = {}): PortalInvoiceRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    number: "YM-F-2026-000001",
    issue_date: "2026-10-01",
    due_date: "2026-10-15",
    status: "sent",
    payment_reference: "",
    billing_period_start: null,
    billing_period_end: null,
    addressed_to: { company_name: "Alfa BV", contact_name: "A", street: "S 1", postal_code: "1011 AA", city: "A", country: "Nederland", kvk_number: null, vat_number: null },
    lines: [{ position: 0, description: "Website", quantity_hundredths: 100, unit_price_cents: 100000, vat_rate: 21 }],
    payments: [],
    credit_notes: [],
    refunds: [],
    ...overrides,
  };
}

function invoice(overrides: Partial<PortalInvoiceRow> = {}): PortalInvoice {
  return invoiceFromPortalRow(invoiceRow(overrides));
}

const note = (id: string, total: number, issueDate = "2026-10-05") => ({
  id,
  number: `YM-C-2026-00000${id.slice(-1)}`,
  issue_date: issueDate,
  created_at: `${issueDate}T10:00:00Z`,
  subtotal_cents: Math.round(total / 1.21),
  vat_cents: total - Math.round(total / 1.21),
  total_cents: total,
});

describe("an invoice in the portal", () => {
  it("is open for its total before anything arrived, and uses the number as reference when none was set", () => {
    const view = portalInvoiceView(invoice(), today);
    expect(view.ledger.totalCents).toBe(121000);
    expect(view.openCents).toBe(121000);
    expect(view.state).toBe("open");
    expect(view.invoice.paymentReference).toBe("YM-F-2026-000001");
  });

  it("is partially paid, then overdue after its due date, for what is left", () => {
    const partly = invoice({ payments: [{ amount_cents: 21000, paid_at: "2026-10-03T10:00:00Z", method: "ideal", source: "mollie" }] });
    expect(portalInvoiceView(partly, today)).toMatchObject({ openCents: 100000, state: "partially_paid" });
    expect(portalInvoiceView(partly, "2026-10-16")).toMatchObject({ openCents: 100000, state: "overdue" });
  });

  it("owes less after an issued credit note, and nothing after a full one", () => {
    const partial = portalInvoiceView(invoice({ credit_notes: [note("c1", 21000)] }), today);
    expect(partial.ledger.creditedCents).toBe(21000);
    expect(partial.openCents).toBe(100000);
    expect(partial.creditNotes[0]!.state).toBe("offset");

    const full = portalInvoiceView(invoice({ credit_notes: [note("c1", 121000)] }), "2026-11-01");
    expect(full).toMatchObject({ openCents: 0, state: "credited" });
  });

  it("is paid when the money arrived, and a later credit note is money owed back -- then on its way, then returned", () => {
    const paid = [{ amount_cents: 121000, paid_at: "2026-10-03T10:00:00Z", method: null, source: "manual_bank_transfer" }];
    const due = portalInvoiceView(invoice({ status: "paid", payments: paid, credit_notes: [note("c1", 21000)] }), today);
    expect(due).toMatchObject({ openCents: 0, state: "paid" });
    expect(due.creditNotes[0]).toMatchObject({ state: "refund_due" });

    const onItsWay = portalInvoiceView(
      invoice({ status: "paid", payments: paid, credit_notes: [note("c1", 21000)], refunds: [{ credit_note_id: "c1", amount_cents: 21000, status: "pending", created_at: "2026-10-06T10:00:00Z" }] }),
      today,
    );
    expect(onItsWay.creditNotes[0]!.state).toBe("in_progress");

    const back = portalInvoiceView(
      invoice({ status: "paid", payments: paid, credit_notes: [note("c1", 21000)], refunds: [{ credit_note_id: "c1", amount_cents: 21000, status: "refunded", created_at: "2026-10-06T10:00:00Z" }] }),
      today,
    );
    expect(back.creditNotes[0]).toMatchObject({ state: "processed", refundedCents: 21000 });
  });

  it("owes nothing once marked paid, even without a recorded payment (the document's own word, as in the admin)", () => {
    expect(portalInvoiceView(invoice({ status: "paid" }), "2026-12-01")).toMatchObject({ openCents: 0, state: "paid" });
    expect(portalInvoiceView(invoice({ status: "paid", credit_notes: [note("c1", 21000)] }), "2026-12-01").state).toBe("paid");
  });

  it("sums what is open and what is overdue", () => {
    const views = [
      portalInvoiceView(invoice({ id: "a", due_date: "2026-10-01" }), today),
      portalInvoiceView(invoice({ id: "b", due_date: "2026-10-30" }), today),
      portalInvoiceView(invoice({ id: "c", status: "paid" }), today),
    ];
    expect(invoiceSummary(views)).toEqual({ openCents: 242000, openCount: 2, overdueCents: 121000, overdueCount: 1 });
  });

  it("refuses a row that does not have the shape the function promises", () => {
    expect(() => invoiceFromPortalRow(invoiceRow({ status: "draft" }))).toThrow();
    expect(() => invoiceFromPortalRow(invoiceRow({ payments: [{ amount_cents: "1" }] }))).toThrow();
    expect(() => invoiceFromPortalRow(invoiceRow({ refunds: [{ credit_note_id: "c", amount_cents: 1, status: "failed", created_at: "x" }] }))).toThrow();
  });

  it("names payment methods the way a customer knows them", () => {
    expect(paymentMethodLabel({ source: "manual_bank_transfer", method: "banktransfer" })).toBe("Bankoverschrijving");
    expect(paymentMethodLabel({ source: "mollie", method: "directdebit" })).toBe("Automatische incasso");
    expect(paymentMethodLabel({ source: "mollie", method: "ideal" })).toBe("iDEAL");
    expect(paymentMethodLabel({ source: "mollie", method: null })).toBe("Online betaling");
  });
});

function quote(overrides: Partial<Parameters<typeof quoteFromPortalRow>[0]> = {}): PortalQuote {
  return quoteFromPortalRow({
    id: "q1",
    number: "YM-O-2026-000002",
    issue_date: "2026-10-01",
    valid_until: "2026-10-31",
    status: "sent",
    subject: "Website",
    terms_edition: "2026",
    terms_published_on: "2026-09-14",
    sent_at: "2026-10-01T10:00:00Z",
    supersedes_quote_id: null,
    supersedes_number: null,
    superseded_by_quote_id: null,
    superseded_by_number: null,
    superseded_on: null,
    lines: [],
    ...overrides,
  });
}

describe("a quote in the portal", () => {
  it("waits for an answer while valid, and reads as expired after its date", () => {
    expect(portalQuoteState(quote(), today)).toBe("awaiting");
    expect(portalQuoteState(quote(), "2026-11-01")).toBe("expired");
    expect(portalQuoteState(quote({ status: "expired" }), today)).toBe("expired");
  });

  it("is replaced once a later version was sent, unless it was accepted", () => {
    const replaced = quote({ superseded_by_quote_id: "q2", superseded_by_number: "YM-O-2026-000003", superseded_on: "2026-10-05T10:00:00Z" });
    expect(portalQuoteState(replaced, today)).toBe("superseded");
    expect(portalQuoteState({ ...replaced, status: "accepted" }, today)).toBe("accepted");
    expect(portalQuoteState(quote({ status: "rejected" }), today)).toBe("rejected");
  });

  it("never takes a concept", () => {
    expect(() => quote({ status: "draft" })).toThrow();
  });
});

function service(overrides: Partial<Parameters<typeof serviceFromPortalRow>[0]> = {}): PortalService {
  return serviceFromPortalRow({
    id: "s1",
    name: "Websitebeheer",
    status: "active",
    amount_cents: 2500,
    vat_rate: 21,
    starts_on: "2026-09-15",
    ends_on: null,
    cancellation_requested_on: null,
    collects_by_direct_debit: true,
    last_term_amount_cents: null,
    billed_period_starts: ["2026-10-15", "2026-09-15"],
    price_changes: [],
    agreements: [
      {
        id: "a1",
        sequence: 1,
        effective_from: "2026-09-15",
        source_kind: "standard_terms",
        accepted_on: null,
        notice_months: null,
        minimum_term_months: null,
        proration_rule: null,
        has_special_terms: false,
        terms_edition: "2026",
        terms_published_on: "2026-09-14",
      },
    ],
    ...overrides,
  });
}

describe("a monthly service in the portal", () => {
  it("shows the running price, the next collection after the billed periods, and the standard terms", () => {
    const view = portalServiceView(service(), today);
    expect(view.state).toBe("active");
    expect(view.currentNetCents).toBe(2500);
    expect(view.currentGrossCents).toBe(3025);
    expect(view.next).toEqual({ debitOn: "2026-11-15", grossCents: 3025, period: { start: "2026-11-15", end: "2026-12-14" } });
    expect(view.agreement).toMatchObject({ noticeMonths: 1, noticeIsStandard: true, prorationRule: "pro_rata_days", terms: { edition: "2026" } });
    expect(view.minimumTermEndsOn).toBeUndefined();
  });

  it("prices each period off the history: the old amount now, the new one from its date, an announced one ahead", () => {
    const view = portalServiceView(
      service({
        amount_cents: 3000,
        price_changes: [
          { effective_from: "2026-10-15", old_amount_cents: 2500, new_amount_cents: 3000, applied: false },
          { effective_from: "2026-12-15", old_amount_cents: 3000, new_amount_cents: 3500, applied: false },
        ],
      }),
      today,
    );
    expect(view.currentNetCents).toBe(2500);
    expect(view.next?.grossCents).toBe(3630);
    expect(view.scheduledChange).toEqual({ effectiveFrom: "2026-10-15", newNetCents: 3000, newGrossCents: 3630 });
  });

  it("lists the prices that took effect, newest first", () => {
    const view = portalServiceView(
      service({ price_changes: [{ effective_from: "2026-10-15", old_amount_cents: 2500, new_amount_cents: 3000, applied: true }] }),
      "2026-10-20",
    );
    expect(view.currentNetCents).toBe(3000);
    expect(view.priceHistory).toEqual([{ effectiveFrom: "2026-10-15", oldNetCents: 2500, newNetCents: 3000 }]);
    expect(view.scheduledChange).toBeUndefined();
  });

  it("resolves the agreement in force today, with a minimum term from the start date", () => {
    const view = portalServiceView(
      service({
        agreements: [
          { id: "a1", sequence: 1, effective_from: "2026-09-15", source_kind: "standard_terms", accepted_on: null, notice_months: null, minimum_term_months: null, proration_rule: null, has_special_terms: false, terms_edition: "2026", terms_published_on: "2026-09-14" },
          { id: "a2", sequence: 2, effective_from: "2026-10-01", source_kind: "accepted_offer", accepted_on: "2026-09-30", notice_months: 2, minimum_term_months: 12, proration_rule: "none", has_special_terms: true, terms_edition: "2026", terms_published_on: "2026-09-14" },
          { id: "a3", sequence: 3, effective_from: "2027-01-01", source_kind: "later_written_amendment", accepted_on: "2026-12-01", notice_months: 3, minimum_term_months: null, proration_rule: null, has_special_terms: false, terms_edition: "2026", terms_published_on: "2026-09-14" },
        ],
      }),
      today,
    );
    expect(view.agreement).toMatchObject({ noticeMonths: 2, noticeIsStandard: false, minimumTermMonths: 12, prorationRule: "none", source: { kind: "accepted_offer", acceptedOn: "2026-09-30" } });
    expect(view.minimumTermEndsOn).toBe("2027-09-14");
    expect(view.hasSpecialTerms).toBe(true);
  });

  it("never calls a collection date that has passed the next one", () => {
    expect(portalServiceView(service({ billed_period_starts: [] }), today).next).toBeUndefined();
    expect(portalServiceView(service({ billed_period_starts: [], starts_on: "2026-11-01" }), today).next?.debitOn).toBe("2026-11-01");
  });

  it("schedules nothing before the direct debit runs, or after the last day", () => {
    expect(portalServiceView(service({ status: "awaiting_mandate", collects_by_direct_debit: false, billed_period_starts: [] }), today)).toMatchObject({ state: "awaiting_mandate" });
    expect(portalServiceView(service({ status: "awaiting_mandate", collects_by_direct_debit: false, billed_period_starts: [] }), today).next).toBeUndefined();

    const ending = portalServiceView(service({ ends_on: "2026-11-30", cancellation_requested_on: "2026-10-01" }), today);
    expect(ending.state).toBe("cancellation_scheduled");
    /* The last period runs 15 to 30 November: sixteen of its thirty days, pro rata. */
    expect(ending.next).toMatchObject({ debitOn: "2026-11-15" });
    expect(ending.next!.grossCents).toBeLessThan(3025);

    const ended = portalServiceView(service({ ends_on: "2026-10-14", status: "canceled" }), today);
    expect(ended.state).toBe("ended");
    expect(ended.next).toBeUndefined();
  });
});

describe("the overview", () => {
  it("adds up what each invoice leaves open, picks the soonest collection and the offers that wait", () => {
    const overview = portalOverview({
      invoices: [
        portalInvoiceView(invoice({ id: "a", number: "YM-F-2026-000001", due_date: "2026-10-01" }), today),
        portalInvoiceView(invoice({ id: "b", number: "YM-F-2026-000002", status: "paid" }), today),
      ],
      quotes: [quote(), quote({ id: "q0", number: "YM-O-2026-000001", status: "accepted" })],
      services: [portalServiceView(service(), today), portalServiceView(service({ id: "s2", name: "Hosting", starts_on: "2026-09-20", billed_period_starts: ["2026-09-20", "2026-10-20"] }), today)],
      todayKey: today,
    });
    expect(overview.invoices).toMatchObject({ openCents: 121000, openCount: 1, overdueCount: 1 });
    expect(overview.openInvoices.map((view) => view.invoice.id)).toEqual(["a"]);
    expect(overview.awaitingQuotes.map((item) => item.id)).toEqual(["q1"]);
    expect(overview.nextCollection?.service.id).toBe("s1");
    expect(overview.activeServices).toBe(2);
    expect(overview.recent.length).toBeLessThanOrEqual(5);
  });
});
