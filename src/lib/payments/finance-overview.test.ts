import { describe, expect, it } from "vitest";
import type { CreditNote, Refund } from "@/lib/admin/credit-notes/types";
import { customerFixtures } from "@/lib/admin/customers/fixtures";
import { invoiceCollectionViews } from "@/lib/payments/collection-state";
import { financeOverview, upcomingCollections, type FinanceInput } from "@/lib/payments/finance-overview";
import { invoiceFixture, paymentFixture, recurringFixture } from "@/lib/payments/fixtures";

/**
 * The four tabs of the payments page, from one builder. Two customers:
 * Alfa (cust-1) with a paid invoice, a half credit note and a cancelled
 * monthly service; Beta (cust-2) with an overdue invoice.
 */
const alfa = { ...customerFixtures[0]!, id: "cust-1", companyName: "Alfa BV" };
const beta = { ...customerFixtures[1]!, id: "cust-2", companyName: "Beta BV" };

const paidInvoice = invoiceFixture({ id: "inv-1", status: "paid", creditedCents: 6050 });
const overdueInvoice = invoiceFixture({
  id: "inv-2",
  number: { value: "YM-F-2026-000002", provisional: false },
  status: "sent",
  customer: { ...invoiceFixture().customer, customerId: "cust-2", companyName: "Beta BV" },
  issueDate: "2026-09-10",
  dueDate: "2026-09-24",
  paymentReference: "YM-F-2026-000002",
});
const termInvoice = invoiceFixture({
  id: "inv-dec",
  number: { value: "YM-F-2026-000012", provisional: false },
  status: "paid",
  recurringServiceId: "svc-1",
  billingPeriodStart: "2026-12-01",
  billingPeriodEnd: "2026-12-31",
  netCents: 3000,
  issueDate: "2026-11-17",
  dueDate: "2026-12-01",
});

const halfNote: CreditNote = {
  id: "cn-1",
  number: { value: "YM-C-2026-000001", provisional: false },
  status: "issued",
  customer: paidInvoice.customer,
  invoiceId: "inv-1",
  reason: "Korting achteraf",
  issueDate: "2026-10-10",
  source: "manual",
  lines: [{ id: "c1", description: "50%", quantityHundredths: 100, unitPriceCents: 5000, vatRate: 21 }],
  subtotalCents: 5000,
  vatCents: 1050,
  totalCents: 6050,
  finalizingAt: "2026-10-10T10:00:01.000Z",
  issuedAt: "2026-10-10T10:00:02.000Z",
  document: { path: "2026/YM-C-2026-000001-x.pdf", sha256: "b".repeat(64), bytes: 10, generatedAt: "2026-10-10T10:00:02.000Z" },
  createdAt: "2026-10-10T10:00:00.000Z",
  updatedAt: "2026-10-10T10:00:00.000Z",
};

const partRefund: Refund = {
  id: "rf-1",
  creditNoteId: "cn-1",
  invoiceId: "inv-1",
  customerId: "cust-1",
  amountCents: 3000,
  method: "manual",
  status: "refunded",
  idempotencyKey: "manual-rf-1",
  note: "",
  settledAt: "2026-10-11T10:00:00.000Z",
  createdAt: "2026-10-11T10:00:00.000Z",
  updatedAt: "2026-10-11T10:00:00.000Z",
};

const cancelled = recurringFixture({
  id: "svc-1",
  name: "Websitebeheer",
  amountCents: 3000,
  startsOn: "2026-11-01",
  status: "active",
  mollie: { subscriptionId: "sub_1", subscriptionCanceledAt: "2026-12-02T06:00:00.000Z" },
  endsOn: "2026-12-15",
  cancellationRequestedAt: "2026-11-15T10:00:00.000Z",
  lastTerm: { amountCents: 3000, syncedAt: "2026-11-15T10:00:01.000Z" },
});
const running = recurringFixture({ id: "svc-2", customerId: "cust-2", name: "SEO", amountCents: 5000, startsOn: "2026-09-04", status: "active", mollie: { subscriptionId: "sub_2" } });

function input(overrides: Partial<FinanceInput> = {}): FinanceInput {
  const invoices = [paidInvoice, overdueInvoice, termInvoice];
  const payments = [paymentFixture({ id: "pay-1", invoiceId: "inv-1" }), paymentFixture({ id: "pay-dec", invoiceId: "inv-dec", amountCents: 3630, paidAt: "2026-12-01T06:00:00.000Z" })];
  const todayKey = "2026-12-20";
  const collectionViews = new Map(
    invoiceCollectionViews({ invoices, payments, events: [], states: new Map(), collectingServiceIds: new Set(["svc-1", "svc-2"]), todayKey }).map((row) => [row.invoice.id, row.view]),
  );
  return {
    customers: [alfa, beta],
    invoices,
    payments,
    creditNotes: [halfNote],
    refunds: [partRefund],
    services: [cancelled, running],
    prenotifications: [],
    priceChanges: [],
    collectionViews,
    todayKey,
    ...overrides,
  };
}

describe("the payments overview", () => {
  it("lists every definitive invoice with what was paid, credited and is still owed", () => {
    const { invoices } = financeOverview(input());
    const byNumber = Object.fromEntries(invoices.map((row) => [row.invoice.number.value, row]));
    expect(byNumber["YM-F-2026-000001"]).toMatchObject({ customerName: "Alfa BV", totalCents: 12100, creditedCents: 6050, paidCents: 12100, outstandingCents: 0, credited: "partial", methodLabel: "Mollie" });
    expect(byNumber["YM-F-2026-000002"]).toMatchObject({ customerName: "Beta BV", outstandingCents: 12100, overdue: true, daysOverdue: 87, methodLabel: "—" });
    expect(byNumber["YM-F-2026-000012"]).toMatchObject({ methodLabel: "Automatische incasso", outstandingCents: 0 });
  });

  it("narrows everything to one customer when asked", () => {
    const only = financeOverview(input({ customerId: "cust-2" }));
    expect(only.invoices.map((row) => row.invoice.id)).toEqual(["inv-2"]);
    expect(only.collections.map((row) => row.service.id)).toEqual(["svc-2"]);
    expect(only.creditNotes).toEqual([]);
    expect(only.summary).toMatchObject({ outstandingCents: 12100, overdueCents: 12100, refundDueCents: 0, openCreditsCount: 0 });
  });

  it("lists credit notes with refunded and remaining amounts, and their state", () => {
    const { creditNotes } = financeOverview(input());
    expect(creditNotes).toHaveLength(1);
    expect(creditNotes[0]).toMatchObject({ customerName: "Alfa BV", invoiceNumber: "YM-F-2026-000001", state: "refund_due", methods: ["manual"], unfinished: false });
    expect(creditNotes[0]!.ledger).toMatchObject({ refundedCents: 3000, remainingCents: 3050 });
  });

  it("lists the monthly services with their next collection and lifecycle, soonest first", () => {
    const { collections } = financeOverview(input());
    expect(collections.map((row) => row.service.id)).toEqual(["svc-2", "svc-1"]);
    const seo = collections[0]!;
    expect(seo).toMatchObject({ customerName: "Beta BV", lifecycle: "active", monthlyNetCents: 5000, monthlyGrossCents: 6050, bucket: "active" });
    expect(seo.overview.debitOn).toBe("2026-09-04");
    const ending = collections[1]!;
    expect(ending).toMatchObject({ lifecycle: "ended", bucket: "problem" });
    expect(ending.lastPayment?.amountCents).toBe(3630);
    expect(upcomingCollections(collections).map((row) => row.service.id)).toEqual(["svc-2"]);
  });

  it("puts the open refund, the overdue invoice and the open cancellation credit on the attention list", () => {
    const { attention, summary } = financeOverview(input());
    const kinds = attention.map((item) => item.kind);
    expect(kinds).toContain("overdue");
    expect(kinds).toContain("refund_due");
    expect(kinds).toContain("credit_open");
    expect(attention.find((item) => item.kind === "refund_due")).toMatchObject({ amountCents: 3050, href: "/admin/betalingen/creditnotas/cn-1" });
    expect(attention.find((item) => item.kind === "credit_open")).toMatchObject({ amountCents: 1873, href: "/admin/betalingen/incassos/svc-1" });
    expect(summary).toMatchObject({ outstandingCents: 12100, outstandingCount: 1, overdueCount: 1, refundDueCents: 3050, openCreditsCount: 1, receivedThisMonthCents: 3630, receivedThisMonthCount: 1 });
  });

  it("shows a lifecycle problem the daily job left, and a failed payment", () => {
    const stuck = { ...cancelled, lifecycleProblem: "Mollie heeft al een incasso aangemaakt voor 2027-01-01." };
    const failedPayment = paymentFixture({ id: "pay-fail", invoiceId: "inv-2", customerId: "cust-2", status: "failed", amountCents: 12100 });
    const base = input();
    const view = financeOverview({ ...base, services: [stuck, running], payments: [...base.payments, failedPayment] });
    expect(view.attention.find((item) => item.kind === "lifecycle")).toMatchObject({ detail: expect.stringContaining("Mollie heeft al een incasso"), tone: "danger" });
    expect(view.attention.find((item) => item.kind === "payment_failed")).toMatchObject({ label: expect.stringContaining("YM-F-2026-000002") });
    expect(view.summary.failedPayments).toBe(1);
  });

  it("is honest about nothing: empty inputs give empty lists and zero figures", () => {
    const empty = financeOverview(input({ invoices: [], payments: [], creditNotes: [], refunds: [], services: [], collectionViews: new Map() }));
    expect(empty).toMatchObject({ attention: [], invoices: [], collections: [], creditNotes: [] });
    expect(empty.summary).toEqual({ outstandingCents: 0, outstandingCount: 0, overdueCents: 0, overdueCount: 0, receivedThisMonthCents: 0, receivedThisMonthCount: 0, upcomingCollections: 0, upcomingCollectionsCents: 0, failedPayments: 0, openCreditsCount: 0, refundDueCents: 0 });
  });

  it("marks a cancellation credit as settled through its credit note, so the service panel can say so", () => {
    const settledNote: CreditNote = { ...halfNote, id: "cn-svc", number: { value: "YM-C-2026-000002", provisional: false }, invoiceId: "inv-dec", source: "cancellation_credit", recurringServiceId: "svc-1", lines: [{ id: "c", description: "16 dagen", quantityHundredths: 100, unitPriceCents: 1548, vatRate: 21 }], subtotalCents: 1548, vatCents: 325, totalCents: 1873 };
    const refund: Refund = { ...partRefund, id: "rf-svc", creditNoteId: "cn-svc", invoiceId: "inv-dec", amountCents: 1873 };
    const base = input();
    const view = financeOverview({ ...base, creditNotes: [...base.creditNotes, settledNote], refunds: [...base.refunds, refund] });
    const service = view.collections.find((row) => row.service.id === "svc-1")!;
    expect(service.management.ending?.creditDue?.creditNote).toEqual({ id: "cn-svc", number: "YM-C-2026-000002", state: "processed", remainingCents: 0 });
    expect(service.problem).toBeUndefined();
    expect(view.attention.map((item) => item.kind)).not.toContain("credit_open");
  });
});
