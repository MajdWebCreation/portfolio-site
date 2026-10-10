import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import type { MolliePayment } from "@/lib/mollie/client";
import { addMonths, periodForCharge } from "@/lib/payments/billing-period";
import { createFakeDb, createRecurringServiceRpc, customerRowFixture, recurringFixture } from "@/lib/payments/fixtures";
import { recurringOverview } from "@/lib/payments/prenotification";
import { lastTermOf, proratedNetCents } from "@/lib/payments/pricing";
import { recurringManagement } from "@/lib/payments/recurring-management";
import {
  agreementHistory,
  billingLabel,
  deviationNeedsSourceReason,
  headRevision,
  resolveAgreementAt,
  revisionAt,
  staleAgreementReason,
  standardTermsSourceLabel,
  unknownTermsLabel,
  validateAgreementInput,
  type ServiceAgreementInput,
  type ServiceAgreementRevision,
} from "@/lib/payments/service-agreement";
import type { PriceChange, RecurringService } from "@/lib/payments/types";

/**
 * The contract terms of a service and what the cancellation does with
 * them: the standard is one calendar month, a deviation needs its source,
 * a later revision applies from its date and not before, and a cancellation
 * keeps the terms it was decided on whatever is recorded afterwards.
 */
const getSubscription = vi.fn();
const cancelSubscription = vi.fn();
const updateSubscriptionAmount = vi.fn();
const listSubscriptionPayments = vi.fn();
const cancelPayment = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getSubscription: (...args: unknown[]) => getSubscription(...args),
  cancelSubscription: (...args: unknown[]) => cancelSubscription(...args),
  updateSubscriptionAmount: (...args: unknown[]) => updateSubscriptionAmount(...args),
  listSubscriptionPayments: (...args: unknown[]) => listSubscriptionPayments(...args),
  cancelPayment: (...args: unknown[]) => cancelPayment(...args),
}));
vi.mock("@/lib/payments/actions", () => ({ saveServiceAgreement: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { cancellationPlan, contractualLastDay, deviationReason, earlyTerminationNeedsSourceReason, requestCancellation, withdrawCancellation } = await import("@/lib/payments/cancellation");
const { minimumTermLastDay } = await import("@/lib/payments/cancellation-plan");
const { createRecurringServiceWithAgreement, listAgreementRevisionsForService, recordAgreementRevision, resolveServiceAgreement, standardBaselineInput } =
  await import("@/lib/payments/service-agreement-revisions");
const { recurringInvoiceDates, recurringInvoiceLine } = await import("@/lib/payments/recurring-invoice");
const { lastTermCredit } = await import("@/lib/payments/cancellation-credit");
const { recurringServiceFromRow } = await import("@/lib/payments/mapper");
const { default: ServiceAgreementPanel } = await import("@/components/admin/payments/service-agreement-panel");

// ------------------------------------------------------------------ data

const terms2026 = { edition: "2026", publishedOn: "2026-09-29" };

const revision = (overrides: Partial<ServiceAgreementRevision> = {}): ServiceAgreementRevision => ({
  id: "rev-1",
  recurringServiceId: "svc-1",
  customerId: "cust-1",
  sequence: 1,
  effectiveFrom: "2026-10-01",
  sourceKind: "standard_terms",
  sourceLabel: "Algemene Voorwaarden B2B 2026",
  specialTerms: "",
  terms: terms2026,
  note: "",
  createdAt: "2026-10-01T09:00:00.000Z",
  ...overrides,
});

/** Revision A: the standard from 1 October 2026. Revision B: two months, agreed later, from 1 February 2027. */
const revisionA = revision();
const revisionB = revision({
  id: "rev-2",
  sequence: 2,
  supersedesId: "rev-1",
  effectiveFrom: "2027-02-01",
  sourceKind: "later_written_amendment",
  sourceLabel: "Aanvullende afspraak per e-mail",
  acceptedOn: "2027-01-10",
  noticeMonths: 2,
  createdAt: "2027-01-10T09:00:00.000Z",
});

const flexora = (overrides: Partial<RecurringService> = {}): RecurringService =>
  recurringFixture({
    id: "svc-1",
    name: "Websitebeheer & hosting",
    amountCents: 1000,
    vatRate: 21,
    startsOn: "2026-09-04",
    status: "active",
    mollie: { subscriptionId: "sub_1" },
    ...overrides,
  });

const seo = (): RecurringService =>
  recurringFixture({ id: "svc-2", name: "SEO", amountCents: 5000, startsOn: "2026-09-04", status: "active", mollie: { subscriptionId: "sub_2" } });

const serviceRow = (service: RecurringService) => ({
  id: service.id,
  customer_id: service.customerId,
  name: service.name,
  amount_cents: service.amountCents,
  vat_rate: service.vatRate,
  status: service.status,
  starts_on: service.startsOn ?? null,
  ends_on: service.endsOn ?? null,
  cancellation_requested_at: service.cancellationRequestedAt ?? null,
  cancellation_requested_by: null,
  cancellation_notice_months: null,
  cancellation_contractual_ends_on: null,
  cancellation_agreement_revision_id: null,
  cancellation_source: null,
  cancellation_proration_rule: null,
  last_term_amount_cents: service.lastTerm?.amountCents ?? null,
  last_term_synced_at: service.lastTerm?.syncedAt ?? null,
  lifecycle_problem: null,
  mollie_subscription_id: service.mollie.subscriptionId ?? null,
  subscription_canceled_at: service.mollie.subscriptionCanceledAt ?? null,
  subscription_claim_id: null,
  subscription_claimed_at: null,
});

const revisionRow = (rev: ServiceAgreementRevision) => ({
  id: rev.id,
  recurring_service_id: rev.recurringServiceId,
  customer_id: rev.customerId,
  sequence: rev.sequence,
  supersedes_id: rev.supersedesId ?? null,
  effective_from: rev.effectiveFrom,
  source_kind: rev.sourceKind,
  source_quote_id: rev.sourceQuoteId ?? null,
  source_label: rev.sourceLabel,
  accepted_on: rev.acceptedOn ?? null,
  notice_months: rev.noticeMonths ?? null,
  minimum_term_months: rev.minimumTermMonths ?? null,
  proration_rule: rev.prorationRule ?? null,
  special_terms: rev.specialTerms,
  terms_edition: rev.terms?.edition ?? null,
  terms_published_on: rev.terms?.publishedOn ?? null,
  note: rev.note,
  created_by: null,
  created_at: rev.createdAt,
});

const acceptedQuote = { id: "quote-1", customer_id: "cust-1", number_value: "YM-O-2026-000014", number_provisional: false, status: "accepted" };

function seed(options: { revisions?: ServiceAgreementRevision[]; billed?: string[]; quotes?: Record<string, unknown>[] } = {}) {
  const billed = options.billed ?? ["2026-09-04", "2026-10-04"];
  return createFakeDb(
    {
      customers: [customerRowFixture()],
      customer_payment_providers: [{ id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_flexora", provider_mandate_id: "mdt_1" }],
      recurring_services: [serviceRow(flexora()), serviceRow(seo())],
      recurring_service_agreements: (options.revisions ?? []).map(revisionRow),
      quotes: options.quotes ?? [acceptedQuote],
      invoices: billed.map((start) => ({ id: `inv-${start}`, customer_id: "cust-1", recurring_service_id: "svc-1", billing_period_start: start, status: "paid" })),
    },
    { rpc: createRecurringServiceRpc() },
  );
}

/** A revision as the migration backfills it for a service from before the layer existed: the standard, and no claim about the set. */
const legacyRevision = (overrides: Partial<ServiceAgreementRevision> = {}): ServiceAgreementRevision => {
  const withSet = revision({ id: "rev-legacy", effectiveFrom: "2026-09-04", sourceLabel: standardTermsSourceLabel(undefined), ...overrides });
  return Object.fromEntries(Object.entries(withSet).filter(([key]) => key !== "terms")) as ServiceAgreementRevision;
};

let db: ReturnType<typeof seed>;
let atMollie: Record<string, { status: string; amount: { currency: "EUR"; value: string } }>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  atMollie = {
    sub_1: { status: "active", amount: { currency: "EUR", value: "12.10" } },
    sub_2: { status: "active", amount: { currency: "EUR", value: "60.50" } },
  };
  getSubscription.mockImplementation(async (_customer: string, id: string) => ({ id, ...atMollie[id]!, startDate: "2026-09-04" }));
  cancelSubscription.mockImplementation(async (_customer: string, id: string) => ({ id, ...atMollie[id]!, status: "canceled", canceledAt: "2027-03-05T07:00:00.000Z" }));
  updateSubscriptionAmount.mockImplementation(async (input: { subscriptionId: string; amountCents: number }) => {
    const value = `${Math.floor(input.amountCents / 100)}.${String(input.amountCents % 100).padStart(2, "0")}`;
    atMollie[input.subscriptionId] = { ...atMollie[input.subscriptionId]!, amount: { currency: "EUR", value } };
    return { id: input.subscriptionId, ...atMollie[input.subscriptionId]! };
  });
  listSubscriptionPayments.mockResolvedValue([] as MolliePayment[]);
});

const service = (id = "svc-1") => db.rows("recurring_services").find((row) => row.id === id)!;
const cancel = (todayKey: string, request = {}, serviceId = "svc-1") => requestCancellation(db as never, serviceId, request, todayKey, "admin-1");

const amendment = (overrides: Partial<ServiceAgreementInput> = {}): ServiceAgreementInput => ({
  effectiveFrom: "2027-02-01",
  sourceKind: "later_written_amendment",
  sourceLabel: "Aanvullende afspraak per e-mail",
  acceptedOn: "2027-01-10",
  noticeMonths: 2,
  specialTerms: "",
  terms: terms2026,
  note: "Klant wil langere opzegtermijn",
  supersedesId: "rev-1",
  ...overrides,
});

// --------------------------------------------------------- the standard

describe("the standard: one calendar month", () => {
  /* 1. A service with nothing recorded, and one with only the standard recorded, both give one calendar month. */
  it("gives a service without any revision, and one with a standard revision, one calendar month's notice", () => {
    for (const revisions of [[], [revisionA]]) {
      const agreement = resolveAgreementAt(revisions, "2026-12-01");
      expect(agreement).toMatchObject({ noticeMonths: 1, noticeIsStandard: true, prorationRule: "pro_rata_days", prorationIsStandard: true, source: { kind: "standard_terms" } });
      expect(agreement.minimumTermMonths).toBeUndefined();
    }
    const plan = cancellationPlan({ startsOn: "2026-09-04", amountCents: 1000, vatRate: 21, priceChanges: [], billedPeriodStarts: [], todayKey: "2026-12-01" });
    expect(plan).toMatchObject({ noticeMonths: 1, noticeEndsOn: "2027-01-01", contractualEndsOn: "2026-12-31", endsOn: "2026-12-31" });
  });

  /* 2. The cases where thirty days and a calendar month part ways. */
  it("is a calendar month and demonstrably not thirty days", () => {
    /* request day, last day by calendar month, last day if the notice were thirty days */
    const cases: [request: string, lastDay: string, thirtyDays: string][] = [
      ["2027-01-31", "2027-02-27", "2027-03-01"], // February has 28 days: 31 Jan + 1 month clamps to 28 Feb
      ["2028-01-31", "2028-02-28", "2028-02-29"], // leap year: the month clamps to 29 Feb, thirty days lands on it
      ["2027-01-30", "2027-02-27", "2027-02-28"], // 30 Jan + 1 month clamps too
      ["2026-02-28", "2026-03-27", "2026-03-29"], // out of a short month: the 28th, not thirty days on
      ["2026-12-31", "2027-01-30", "2027-01-29"], // into a long month: thirty days falls short
      ["2026-10-10", "2026-11-09", "2026-11-08"], // October has 31 days
      ["2026-03-31", "2026-04-29", "2026-04-29"], // the two coincide only by accident of the calendar
      ["2026-04-30", "2026-05-29", "2026-05-29"],
    ];
    for (const [request, lastDay, thirtyDays] of cases) {
      expect(contractualLastDay(request)).toBe(lastDay);
      expect(addDays(request, 29)).toBe(thirtyDays);
    }
    const differing = cases.filter(([, lastDay, thirtyDays]) => lastDay !== thirtyDays);
    expect(differing.length).toBeGreaterThanOrEqual(6);
    // And the end of the notice itself, the day after the last day, is never "thirty days later" in those cases.
    for (const [request] of differing) expect(addMonths(request, 1)).not.toBe(addDays(request, 30));
  });

  it("counts a longer notice in calendar months the same way", () => {
    expect(contractualLastDay("2026-12-31", 2)).toBe("2027-02-27");
    expect(contractualLastDay("2026-10-10", 3)).toBe("2027-01-09");
    expect(contractualLastDay("2027-11-30", 3)).toBe("2028-02-28");
  });
});

// ---------------------------------------------------- deviation and source

describe("a deviation and its source", () => {
  /* 4. Refused in validation, and refused by the row rules the fake database mirrors from the schema. */
  it("refuses a deviation that names the general terms as its source", async () => {
    const invalid = amendment({ sourceKind: "standard_terms", sourceLabel: undefined, acceptedOn: undefined });
    expect(validateAgreementInput(invalid)).toBe(deviationNeedsSourceReason);
    db = seed({ revisions: [revisionA] });
    expect(await recordAgreementRevision(db as never, "svc-1", invalid)).toEqual({ ok: false, reason: deviationNeedsSourceReason });

    // Straight at the table, past the application's validation: the check constraint.
    const { error } = await db
      .from("recurring_service_agreements")
      .insert({ ...revisionRow(revisionB), id: "rev-x", source_kind: "standard_terms", accepted_on: null })
      .select("id")
      .single();
    expect(error?.message).toContain("recurring_service_agreements_deviation_has_source");
    expect(await listAgreementRevisionsForService(db as never, "svc-1")).toHaveLength(1);
  });

  it("requires an acceptance date, on or before the effective date, for an offer or an amendment", () => {
    expect(validateAgreementInput(amendment({ acceptedOn: undefined }))).toMatch(/geaccepteerd/);
    expect(validateAgreementInput(amendment({ acceptedOn: "2027-02-02" }))).toMatch(/niet eerder ingaan/);
    expect(validateAgreementInput(amendment({ sourceLabel: "  " }))).toMatch(/Omschrijf de bron/);
    expect(validateAgreementInput(amendment({ noticeMonths: 0 }))).toMatch(/1 tot 24/);
    expect(validateAgreementInput(amendment({ noticeMonths: 1.5 }))).toMatch(/1 tot 24/);
    expect(validateAgreementInput(amendment())).toBeNull();
  });

  /* 3. The offer as source: its number is taken now and kept as the label. */
  it("takes an accepted offer as source, with its number as the label, and refuses one of another customer or still a concept", async () => {
    db = seed({ revisions: [revisionA], quotes: [acceptedQuote, { ...acceptedQuote, id: "quote-2", customer_id: "cust-9" }, { ...acceptedQuote, id: "quote-3", number_value: "OFF-CONCEPT-X", number_provisional: true }] });
    const fromOffer = amendment({ sourceKind: "accepted_offer", sourceQuoteId: "quote-1", sourceLabel: undefined, acceptedOn: "2026-09-12", effectiveFrom: "2026-10-04" });
    const recorded = await recordAgreementRevision(db as never, "svc-1", fromOffer, "admin-1");
    expect(recorded).toMatchObject({ ok: true, revision: { sequence: 2, sourceKind: "accepted_offer", sourceQuoteId: "quote-1", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-12", noticeMonths: 2, createdBy: "admin-1" } });

    expect(await recordAgreementRevision(db as never, "svc-1", { ...fromOffer, sourceQuoteId: "quote-2", supersedesId: (recorded as { revision: ServiceAgreementRevision }).revision.id })).toEqual({
      ok: false,
      reason: "Deze offerte hoort niet bij de klant van deze dienst.",
    });
    expect(await recordAgreementRevision(db as never, "svc-1", { ...fromOffer, sourceQuoteId: "quote-3", supersedesId: (recorded as { revision: ServiceAgreementRevision }).revision.id })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("nog een concept"),
    });
  });

  it("uses the notice from the accepted offer when a service is cancelled", async () => {
    db = seed({
      revisions: [
        revision({ id: "rev-offer", sourceKind: "accepted_offer", sourceQuoteId: "quote-1", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-12", noticeMonths: 2, effectiveFrom: "2026-09-04" }),
      ],
    });
    const result = await cancel("2026-10-10");
    expect(result).toMatchObject({ ok: true, plan: { noticeMonths: 2, noticeEndsOn: "2026-12-10", contractualEndsOn: "2026-12-09", endsOn: "2026-12-09" } });
    expect(service()).toMatchObject({
      ends_on: "2026-12-09",
      cancellation_notice_months: 2,
      cancellation_contractual_ends_on: "2026-12-09",
      cancellation_agreement_revision_id: "rev-offer",
      cancellation_source: "Offerte YM-O-2026-000014",
      cancellation_proration_rule: "pro_rata_days",
    });
  });
});

// -------------------------------------------------- revisions over time

describe("a later written amendment", () => {
  /* 5, 7, 8: the boundary is the effective date itself. */
  it("applies from its effective date and not a day before", () => {
    const chain = [revisionA, revisionB];
    expect(revisionAt(chain, "2027-01-31")?.id).toBe("rev-1");
    expect(revisionAt(chain, "2027-02-01")?.id).toBe("rev-2");
    expect(revisionAt(chain, "2026-09-30")).toBeUndefined();
    expect(resolveAgreementAt(chain, "2027-01-31")).toMatchObject({ noticeMonths: 1, noticeIsStandard: true, source: { kind: "standard_terms" } });
    expect(resolveAgreementAt(chain, "2027-02-01")).toMatchObject({ noticeMonths: 2, noticeIsStandard: false, source: { kind: "later_written_amendment", acceptedOn: "2027-01-10" } });
  });

  it("gives a cancellation on 31 January the old rule and one on 1 February the new one", async () => {
    db = seed({ revisions: [revisionA, revisionB], billed: ["2026-09-04", "2026-10-04", "2026-11-04", "2026-12-04", "2027-01-04"] });
    expect(await cancel("2027-01-31")).toMatchObject({ ok: true, plan: { noticeMonths: 1, endsOn: "2027-02-27", contractualEndsOn: "2027-02-27" } });
    expect(service()).toMatchObject({ cancellation_notice_months: 1, cancellation_agreement_revision_id: "rev-1", cancellation_source: "Algemene Voorwaarden B2B 2026" });

    db = seed({ revisions: [revisionA, revisionB], billed: ["2026-09-04", "2026-10-04", "2026-11-04", "2026-12-04", "2027-01-04"] });
    expect(await cancel("2027-02-01")).toMatchObject({ ok: true, plan: { noticeMonths: 2, endsOn: "2027-03-31", contractualEndsOn: "2027-03-31" } });
    expect(service()).toMatchObject({ cancellation_notice_months: 2, cancellation_agreement_revision_id: "rev-2", cancellation_source: "Aanvullende afspraak per e-mail" });
  });

  /* 6. Old revisions stay, readable, unchanged, with the chain's diff. */
  it("keeps the old revision and shows what changed", async () => {
    db = seed({ revisions: [revisionA] });
    const recorded = await recordAgreementRevision(db as never, "svc-1", amendment(), "admin-1");
    expect(recorded.ok).toBe(true);
    const chain = await listAgreementRevisionsForService(db as never, "svc-1");
    expect(chain.map((rev) => [rev.sequence, rev.effectiveFrom, rev.noticeMonths])).toEqual([
      [1, "2026-10-01", undefined],
      [2, "2027-02-01", 2],
    ]);
    expect(chain[1]).toMatchObject({ supersedesId: "rev-1", sourceLabel: "Aanvullende afspraak per e-mail", acceptedOn: "2027-01-10", note: "Klant wil langere opzegtermijn" });

    const history = agreementHistory(chain);
    expect(history[0]!.changes).toEqual([
      { label: "Opzegtermijn", from: "1 kalendermaand (standaard)", to: "2 kalendermaanden" },
      { label: "Bron", from: "Algemene voorwaarden: Algemene Voorwaarden B2B 2026", to: "Latere schriftelijke afspraak: Aanvullende afspraak per e-mail" },
    ]);
    expect(history[1]).toMatchObject({ first: true, changes: [] });

    // An update of a recorded revision is refused.
    const refused = (await db.from("recurring_service_agreements").update({ notice_months: 6 }).eq("id", "rev-1").select("id")) as { error: { message: string } | null };
    expect(refused.error?.message).toMatch(/wordt niet gewijzigd/);
    expect((await listAgreementRevisionsForService(db as never, "svc-1"))[0]!.noticeMonths).toBeUndefined();
  });

  it("refuses an effective date before the current revision's", async () => {
    db = seed({ revisions: [revisionA] });
    expect(await recordAgreementRevision(db as never, "svc-1", amendment({ effectiveFrom: "2026-09-30", acceptedOn: "2026-09-01" }))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("2026-10-01"),
    });
  });

  /* 14. Two admins editing from the same head: the second is refused by the chain's uniqueness. */
  it("lets only one of two concurrent edits from the same head succeed", async () => {
    db = seed({ revisions: [revisionA] });
    const [first, second] = await Promise.all([
      recordAgreementRevision(db as never, "svc-1", amendment({ noticeMonths: 2 })),
      recordAgreementRevision(db as never, "svc-1", amendment({ noticeMonths: 3, effectiveFrom: "2027-03-01" })),
    ]);
    const outcomes = [first, second].map((result) => result.ok);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toEqual({ ok: false, reason: staleAgreementReason });
    const chain = await listAgreementRevisionsForService(db as never, "svc-1");
    expect(chain).toHaveLength(2);
    expect(headRevision(chain)?.sequence).toBe(2);
    // Exactly one revision applies on any day.
    expect(chain.filter((rev) => rev.effectiveFrom <= "2027-03-01").map((rev) => rev.sequence)).toEqual([1, 2]);

    // A stale page, edited from a head that was superseded meanwhile.
    expect(await recordAgreementRevision(db as never, "svc-1", amendment({ supersedesId: "rev-1", effectiveFrom: "2027-04-01" }))).toEqual({ ok: false, reason: staleAgreementReason });
  });

  /* 9. Another service of the same customer has its own chain. */
  it("leaves the customer's other service untouched", async () => {
    const seoRevision = revision({ id: "rev-seo", recurringServiceId: "svc-2" });
    db = seed({ revisions: [revisionA, seoRevision] });
    expect((await recordAgreementRevision(db as never, "svc-1", amendment())).ok).toBe(true);
    expect(await resolveServiceAgreement(db as never, "svc-2", "2027-06-01")).toMatchObject({ noticeMonths: 1, noticeIsStandard: true, revision: { id: "rev-seo" } });
    expect(await resolveServiceAgreement(db as never, "svc-1", "2027-06-01")).toMatchObject({ noticeMonths: 2 });
    // A revision cannot be chained onto another service's head.
    const { error } = await db
      .from("recurring_service_agreements")
      .insert({ ...revisionRow(revisionB), id: "rev-cross", recurring_service_id: "svc-2", supersedes_id: "rev-1" })
      .select("id")
      .single();
    expect(error?.message).toMatch(/andere dienst/);
  });
});

// ---------------------------------------------- what stays where it was

describe("what the agreement does not own", () => {
  /* 10. The collection day has one owner: the day of starts_on. */
  it("has no billing day of its own: the collection day follows from the service's start", async () => {
    const { agreementColumns } = await import("@/lib/payments/service-agreement-revisions");
    expect(agreementColumns).not.toMatch(/anchor|billing_day|billing_interval|amount|vat/);
    db = seed({ revisions: [revisionA, revisionB] });
    const result = await cancel("2027-02-01");
    expect(result).toMatchObject({ ok: true, plan: { lastDebitOn: periodForCharge("2026-09-04", "2027-03-31").start } });
    expect((result as { plan: { lastDebitOn: string } }).plan.lastDebitOn).toBe("2027-03-04");
  });

  /* 11. The price comes from the price history, with an agreement present. */
  it("reads the current price from the price history, never from the agreement", () => {
    const change: PriceChange = {
      id: "pc-1",
      recurringServiceId: "svc-1",
      customerId: "cust-1",
      oldAmountCents: 1000,
      newAmountCents: 1500,
      effectiveFrom: "2026-12-04",
      requestedAt: "2026-10-25T10:00:00.000Z",
      providerUpdatedAt: "2026-11-20T07:00:00.000Z",
      appliedAt: "2026-12-04T07:00:00.000Z",
    };
    const management = recurringManagement({
      service: flexora(),
      priceChanges: [change],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04", "2026-12-04"],
      overview: recurringOverview({ service: flexora(), billedPeriodStarts: [], priceChanges: [change] }, [], "2026-12-10"),
      todayKey: "2026-12-10",
      agreement: resolveAgreementAt([revisionA, revisionB], "2026-12-10"),
    });
    expect(management.currentNetCents).toBe(1500);
    expect(management.agreement).toMatchObject({ noticeMonths: 1, terms: terms2026 });
    expect(JSON.stringify(management.agreement)).not.toContain("1500");
  });

  /* 12. One proration computation; the agreement only names the rule. */
  it("bills the last term through the one central computation, with the rule the agreement names", async () => {
    const period = periodForCharge("2026-09-04", "2026-11-09");
    const term = lastTermOf(period, "2026-11-09");
    const proRata = cancellationPlan({ startsOn: "2026-09-04", amountCents: 1000, vatRate: 21, priceChanges: [], billedPeriodStarts: [], todayKey: "2026-10-10" });
    expect(proRata).toMatchObject({ lastTermNetCents: proratedNetCents(1000, term), prorationRule: "pro_rata_days" });
    expect((proRata as { lastTermNetCents: number }).lastTermNetCents).toBe(200);

    const full = cancellationPlan({ startsOn: "2026-09-04", amountCents: 1000, vatRate: 21, priceChanges: [], billedPeriodStarts: [], todayKey: "2026-10-10", prorationRule: "none" });
    expect(full).toMatchObject({ lastTermNetCents: 1000, lastTermGrossCents: 1210, prorationRule: "none", lastTerm: { partial: true } });

    // The agreed full term reaches Mollie, the invoice line and the credit through the same rule.
    db = seed({ revisions: [revision({ sourceKind: "accepted_offer", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-01", effectiveFrom: "2026-09-04", prorationRule: "none" })] });
    const result = await cancel("2026-10-10");
    expect(result).toMatchObject({ ok: true, plan: { endsOn: "2026-11-09", lastTermNetCents: 1000 } });
    expect(service()).toMatchObject({ cancellation_proration_rule: "none", last_term_amount_cents: 1000 });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
    const stored = recurringServiceFromRow(service() as never);
    expect(recurringInvoiceLine(stored, [], period)).toMatchObject({ unitPriceCents: 1000, description: expect.stringContaining("volledig volgens afspraak") });
    expect(lastTermCredit({ service: stored, priceChanges: [], billedPeriodStarts: ["2026-11-04"] })).toBeUndefined();
  });

  /* 16. A service with only the standard recorded behaves exactly as before the layer existed. */
  it("changes nothing for a service whose revision only restates the standard", async () => {
    db = seed();
    const before = await cancel("2026-10-10");
    db = seed({ revisions: [revisionA] });
    const after = await cancel("2026-10-10");
    expect(after.ok && before.ok).toBe(true);
    if (!after.ok || !before.ok) return;
    const withoutAgreement = (result: object) => Object.fromEntries(Object.entries(result).filter(([key]) => key !== "agreement"));
    const planBefore = withoutAgreement(before);
    const planAfter = withoutAgreement(after);
    expect(planAfter).toEqual(planBefore);
    expect(planAfter.plan).toMatchObject({ endsOn: "2026-11-09", lastTermNetCents: 200, lastTermGrossCents: 242 });
    expect(service()).toMatchObject({ ends_on: "2026-11-09", last_term_amount_cents: 200, cancellation_notice_months: 1, cancellation_agreement_revision_id: "rev-1" });
  });

  /* 17. One service's cancellation, with its own agreement, leaves the mandate and the other subscription alone. */
  it("touches neither the mandate nor the other service when one service is cancelled on its own terms", async () => {
    db = seed({ revisions: [revisionA, revisionB, revision({ id: "rev-seo", recurringServiceId: "svc-2" })] });
    const seoBefore = { ...service("svc-2") };
    const providerBefore = { ...db.rows("customer_payment_providers")[0]! };
    expect((await cancel("2027-02-01")).ok).toBe(true);
    expect(service("svc-2")).toEqual(seoBefore);
    expect(db.rows("customer_payment_providers")[0]).toEqual(providerBefore);
    expect(cancelSubscription).not.toHaveBeenCalledWith(expect.anything(), "sub_2", expect.anything());
    expect(updateSubscriptionAmount).not.toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub_2" }));
  });
});

// ------------------------------------------------------ history holds

describe("a cancellation keeps the terms it was decided on", () => {
  /* 18. Amending the agreement afterwards changes nothing about an existing cancellation. */
  it("shows the same contractual last day after the agreement is amended", async () => {
    db = seed({ revisions: [revisionA], billed: ["2026-09-04", "2026-10-04", "2026-11-04", "2026-12-04", "2027-01-04"] });
    expect(await cancel("2027-01-20")).toMatchObject({ ok: true, plan: { noticeMonths: 1, endsOn: "2027-02-19" } });

    // Later: three months' notice, the full last term, from an offer, effective from a day before the request.
    const later = await recordAgreementRevision(
      db as never,
      "svc-1",
      amendment({ sourceKind: "accepted_offer", sourceQuoteId: "quote-1", sourceLabel: undefined, noticeMonths: 3, prorationRule: "none", effectiveFrom: "2027-01-15", acceptedOn: "2027-01-15" }),
    );
    expect(later.ok).toBe(true);
    expect(await resolveServiceAgreement(db as never, "svc-1", "2027-01-20")).toMatchObject({ noticeMonths: 3, prorationRule: "none", source: { label: "Offerte YM-O-2026-000014" } });

    // The cancellation stands as decided: the same plan again, the same snapshot on the row.
    expect(await cancel("2027-02-01")).toMatchObject({ ok: true, reused: true, plan: { noticeMonths: 1, endsOn: "2027-02-19", contractualEndsOn: "2027-02-19" }, agreement: { noticeMonths: 1 } });
    expect(service()).toMatchObject({ ends_on: "2027-02-19", cancellation_notice_months: 1, cancellation_contractual_ends_on: "2027-02-19", cancellation_agreement_revision_id: "rev-1" });

    const stored = recurringServiceFromRow(service() as never);
    const management = recurringManagement({
      service: stored,
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04", "2026-12-04", "2027-01-04"],
      overview: recurringOverview({ service: stored, billedPeriodStarts: [], priceChanges: [] }, [], "2027-03-01"),
      todayKey: "2027-03-01",
      agreement: await resolveServiceAgreement(db as never, "svc-1", "2027-03-01"),
    });
    expect(management.ending?.notice).toEqual({ months: 1, contractualEndsOn: "2027-02-19", source: "Algemene Voorwaarden B2B 2026", deviates: false, prorationRule: "pro_rata_days" });
    expect(management.ending?.lastTermNetCents).toBe(proratedNetCents(1000, lastTermOf(periodForCharge("2026-09-04", "2027-02-19"), "2027-02-19")));
    expect(management.agreement).toMatchObject({ noticeMonths: 3, prorationRule: "none" });
    // The row itself: the snapshot columns are untouched by the new revision.
    expect(service()).toMatchObject({ cancellation_notice_months: 1, cancellation_proration_rule: "pro_rata_days", cancellation_source: "Algemene Voorwaarden B2B 2026", cancellation_contractual_ends_on: "2027-02-19" });
  });

  it("clears the snapshot with the cancellation when it is withdrawn", async () => {
    db = seed({ revisions: [revisionA, revisionB] });
    expect((await cancel("2027-02-01")).ok).toBe(true);
    expect(await withdrawCancellation(db as never, "svc-1", "2027-02-02")).toEqual({ ok: true });
    expect(service()).toMatchObject({ ends_on: null, cancellation_requested_at: null, cancellation_notice_months: null, cancellation_contractual_ends_on: null, cancellation_agreement_revision_id: null, cancellation_source: null, cancellation_proration_rule: null });
  });

  /* 15. The source may be edited, archived or removed; the revision and the cancellation keep saying what they meant. */
  it("stays explicable after its source offer is renumbered or removed", async () => {
    const fromOffer = revision({ id: "rev-offer", sourceKind: "accepted_offer", sourceQuoteId: "quote-1", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-12", noticeMonths: 2, effectiveFrom: "2026-09-04" });
    db = seed({ revisions: [fromOffer] });
    expect((await cancel("2026-10-10")).ok).toBe(true);

    await db.from("quotes").update({ number_value: "YM-O-2026-000099", status: "rejected" }).eq("id", "quote-1");
    await db.from("quotes").delete().eq("id", "quote-1");
    // What the database does on delete: the reference clears, the label stays -- the one change the immutability trigger lets through.
    const cleared = await db.from("recurring_service_agreements").update({ source_quote_id: null }).eq("source_quote_id", "quote-1").select("id");
    expect(cleared.error).toBeNull();

    const chain = await listAgreementRevisionsForService(db as never, "svc-1");
    expect(chain[0]).toMatchObject({ sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-12", noticeMonths: 2 });
    expect(chain[0]!.sourceQuoteId).toBeUndefined();
    expect(service()).toMatchObject({ ends_on: "2026-12-09", cancellation_source: "Offerte YM-O-2026-000014", cancellation_agreement_revision_id: "rev-offer" });
    expect(resolveAgreementAt(chain, "2026-10-10").source).toEqual({ kind: "accepted_offer", label: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-12" });
  });
});

// ------------------------------------------------------- legacy services

describe("a service from before the agreement layer", () => {
  /* 1. No set of general terms is claimed for it. */
  it("is recorded under the standard rules without any set of general terms", () => {
    const legacy = legacyRevision();
    expect(legacy.terms).toBeUndefined();
    expect(legacy.sourceLabel).toBe("Algemene voorwaarden, versie niet historisch vastgesteld");
    const agreement = resolveAgreementAt([legacy], "2026-12-01");
    expect(agreement.terms).toBeUndefined();
    expect(agreement).toMatchObject({ noticeMonths: 1, noticeIsStandard: true, prorationRule: "pro_rata_days", source: { kind: "standard_terms", label: legacy.sourceLabel } });
    expect(JSON.stringify(agreement)).not.toContain("2026-09-29");
    expect(JSON.stringify(agreement)).not.toContain("2026-09-14");
    expect(JSON.stringify(agreement)).not.toContain("B2B 2026");
    // A service with no revision at all claims nothing either.
    expect(resolveAgreementAt([], "2026-12-01").terms).toBeUndefined();
    expect(resolveAgreementAt([], "2026-12-01").source.label).toBe(legacy.sourceLabel);
  });

  it("is cancelled on the standard rule, with the snapshot saying no set was established", async () => {
    db = seed({ revisions: [legacyRevision()] });
    expect(await cancel("2026-10-10")).toMatchObject({ ok: true, plan: { noticeMonths: 1, endsOn: "2026-11-09" } });
    expect(service()).toMatchObject({ cancellation_notice_months: 1, cancellation_agreement_revision_id: "rev-legacy", cancellation_source: "Algemene voorwaarden, versie niet historisch vastgesteld" });
  });

  /* 2. The screen says so, in so many words. */
  it("renders the unknown set as such, in the block and in the history", () => {
    const legacy = legacyRevision();
    const html = renderToStaticMarkup(
      <ServiceAgreementPanel serviceId="svc-1" agreement={resolveAgreementAt([legacy], "2026-12-01")} head={legacy} history={agreementHistory([legacy])} financials={{ currentNetCents: 1000, currentGrossCents: 1210, vatRate: 21 }} quotes={[]} todayKey="2026-12-01" />,
    );
    expect(html).toContain(unknownTermsLabel);
    expect(html).not.toContain("B2B 2026");
    expect(html).not.toContain("gepubliceerd");
    expect(agreementHistory([legacy, revision({ id: "rev-2", sequence: 2, supersedesId: "rev-legacy", effectiveFrom: "2027-01-01", createdAt: "2027-01-01T09:00:00.000Z" })])[0]!.changes).toContainEqual({
      label: "Voorwaarden",
      from: unknownTermsLabel,
      to: "B2B 2026, gepubliceerd 2026-09-29",
    });
  });

  it("refuses a set with only one of its two halves", async () => {
    db = seed();
    const { error } = await db
      .from("recurring_service_agreements")
      .insert({ ...revisionRow(revisionA), id: "rev-half", terms_published_on: null })
      .select("id")
      .single();
    expect(error?.message).toContain("recurring_service_agreements_terms_set_complete");
  });
});

// ------------------------------------------------------- a new service

describe("a new service", () => {
  const input = { customerId: "cust-1", name: "Nieuw", description: "", amountCents: 1500, vatRate: 21, status: "draft", todayKey: "2026-10-10" };

  /* 3. Service and first revision come into being together. */
  it("gets its first revision in the same write: the standard under the set published today", async () => {
    db = seed();
    const result = await createRecurringServiceWithAgreement(db as never, { ...input, startsOn: "2026-11-04" }, "admin-1");
    expect(result).toMatchObject({ ok: true });
    const id = (result as { id: string }).id;
    expect(db.rows("recurring_services").find((row) => row.id === id)).toMatchObject({ name: "Nieuw", amount_cents: 1500, starts_on: "2026-11-04", billing_interval: "monthly" });
    const chain = await listAgreementRevisionsForService(db as never, id);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ sequence: 1, effectiveFrom: "2026-11-04", sourceKind: "standard_terms", sourceLabel: "Algemene Voorwaarden B2B 2026", terms: terms2026, createdBy: "admin-1" });
    expect(await resolveServiceAgreement(db as never, id, "2026-12-01")).toMatchObject({ terms: terms2026, noticeMonths: 1, revision: { id: chain[0]!.id } });
    // Without a start: effective from today.
    const started = await createRecurringServiceWithAgreement(db as never, input);
    expect((await listAgreementRevisionsForService(db as never, (started as { id: string }).id))[0]!.effectiveFrom).toBe("2026-10-10");
  });

  /* 4. When the revision cannot be written, neither is the service. */
  it("leaves no service behind when the first revision is refused", async () => {
    db = seed();
    const before = db.rows("recurring_services").length;
    // The fake hands out the next id deterministically; a revision already there for it makes the baseline insert fail, as any refusal in the function would.
    db.rows("recurring_service_agreements").push(revisionRow(revision({ id: "rev-ghost", recurringServiceId: `recurring_services-${before + 1}` })));
    const result = await createRecurringServiceWithAgreement(db as never, input);
    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("moet de huidige opvolgen") } });
    expect(db.rows("recurring_services")).toHaveLength(before);
    expect(db.rows("recurring_services").some((row) => row.name === "Nieuw")).toBe(false);

    // And an unknown customer: the service insert itself fails, nothing is written.
    const orphan = await createRecurringServiceWithAgreement(db as never, { ...input, customerId: "cust-9" });
    expect(orphan).toMatchObject({ ok: false, error: { code: "23503" } });
    expect(db.rows("recurring_services")).toHaveLength(before);
  });
});

// --------------------------------------------------- the minimum term

describe("an agreed minimum term", () => {
  const plan = (todayKey: string, extra: Partial<Parameters<typeof cancellationPlan>[0]> = {}) =>
    cancellationPlan({ startsOn: "2026-10-04", amountCents: 1000, vatRate: 21, priceChanges: [], billedPeriodStarts: [], todayKey, ...extra });

  /* 5. Without one, nothing changes. */
  it("does not exist unless recorded: the plan without one is exactly the plan as before", () => {
    const without = plan("2027-03-10");
    expect(without).toMatchObject({ contractualEndsOn: "2027-04-09", noticeLastDay: "2027-04-09", endsOn: "2027-04-09", belowMinimumTerm: false });
    expect((without as { minimumTermEndsOn?: string }).minimumTermEndsOn).toBeUndefined();
    expect(resolveAgreementAt([revisionA], "2027-03-10").minimumTermMonths).toBeUndefined();
  });

  /* 6, 7. Twelve months from 4 October 2026 run through 3 October 2027; calendar months, not days. */
  it("runs through the day before its anniversary, in calendar months", () => {
    expect(minimumTermLastDay("2026-10-04", 12)).toBe("2027-10-03");
    expect(minimumTermLastDay("2026-01-31", 12)).toBe("2027-01-30");
    expect(minimumTermLastDay("2026-10-31", 4)).toBe("2027-02-27"); // February clamps
    expect(minimumTermLastDay("2027-10-31", 4)).toBe("2028-02-28"); // leap year
    expect(minimumTermLastDay("2026-01-31", 1)).toBe("2026-02-27");
    // Not "twelve times thirty days", and not "thirty days" for one month out of January.
    expect(minimumTermLastDay("2026-10-04", 12)).not.toBe(addDays("2026-10-04", 12 * 30 - 1));
    expect(minimumTermLastDay("2026-01-31", 1)).toBe("2026-02-27");
    expect(addDays("2026-01-31", 30 - 1)).toBe("2026-03-01");
  });

  it("holds the contractual last day at its end while the notice would end earlier", () => {
    // Request in June: the notice gives 30 June, the minimum term 3 October.
    const early = plan("2027-06-01", { minimumTermMonths: 12 });
    expect(early).toMatchObject({ minimumTermMonths: 12, minimumTermEndsOn: "2027-10-03", noticeLastDay: "2027-06-30", contractualEndsOn: "2027-10-03", endsOn: "2027-10-03", deviates: false });
    // A day inside the minimum term is a deviation below it.
    const inside = plan("2027-06-01", { minimumTermMonths: 12, requestedEndsOn: "2027-09-30" });
    expect(inside).toMatchObject({ deviates: true, belowMinimumTerm: true, belowNotice: false });
    // On the boundary: a request whose notice ends exactly on the minimum term's last day.
    expect(plan("2027-09-04", { minimumTermMonths: 12 })).toMatchObject({ noticeLastDay: "2027-10-03", contractualEndsOn: "2027-10-03" });
    // The day after: the notice decides again.
    expect(plan("2027-09-05", { minimumTermMonths: 12 })).toMatchObject({ noticeLastDay: "2027-10-04", contractualEndsOn: "2027-10-04" });
  });

  /* 8. Combined with a longer notice: whichever ends later. */
  it("combines with a deviating notice period: the later of the two decides", () => {
    expect(plan("2027-06-01", { minimumTermMonths: 12, noticeMonths: 2 })).toMatchObject({ noticeLastDay: "2027-07-31", contractualEndsOn: "2027-10-03" });
    expect(plan("2027-08-10", { minimumTermMonths: 12, noticeMonths: 2 })).toMatchObject({ noticeLastDay: "2027-10-09", contractualEndsOn: "2027-10-09" });
    expect(plan("2027-08-03", { minimumTermMonths: 12, noticeMonths: 2 })).toMatchObject({ noticeLastDay: "2027-10-02", contractualEndsOn: "2027-10-03" });
  });

  it("is applied by the cancellation and written into its snapshot", async () => {
    const withMinimum = revision({ id: "rev-min", sourceKind: "accepted_offer", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-01", effectiveFrom: "2026-09-04", minimumTermMonths: 12 });
    db = seed({ revisions: [withMinimum] });
    expect(await cancel("2026-10-10")).toMatchObject({ ok: true, plan: { minimumTermEndsOn: "2027-09-03", noticeLastDay: "2026-11-09", contractualEndsOn: "2027-09-03", endsOn: "2027-09-03" } });
    expect(service()).toMatchObject({ ends_on: "2027-09-03", cancellation_minimum_term_months: 12, cancellation_contractual_ends_on: "2027-09-03", cancellation_notice_months: 1 });

    db = seed({ revisions: [withMinimum] });
    // 1. A day inside the minimum term without a source: refused with the minimum-term reason.
    expect(await cancel("2026-10-10", { endsOn: "2026-11-09" })).toEqual({ ok: false, reason: earlyTerminationNeedsSourceReason });
  });

  const withMinimum = () =>
    revision({ id: "rev-min", sourceKind: "accepted_offer", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-01", effectiveFrom: "2026-09-04", minimumTermMonths: 12 });
  const earlyEnd = { sourceKind: "later_written_amendment" as const, sourceLabel: "E-mail van de klant, 8 oktober 2026", agreedOn: "2026-10-08", reason: "Klant verhuist naar eigen omgeving" };

  /* A. Without a deviation, the end is never inside the minimum term. */
  it("never ends inside the minimum term without a deviation", async () => {
    for (const todayKey of ["2026-10-10", "2027-03-15", "2027-09-04"]) {
      db = seed({ revisions: [withMinimum()] });
      const result = await cancel(todayKey);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.endsOn >= "2027-09-03").toBe(true);
      expect(result.plan.belowMinimumTerm).toBe(false);
      expect(service().cancellation_deviation_source_kind).toBeNull();
    }
  });

  /* B. Inside the minimum term without a source: refused, by the flow and by the row rule. */
  it("refuses an end inside the minimum term without a recorded later agreement", async () => {
    db = seed({ revisions: [withMinimum()] });
    expect(await cancel("2026-10-10", { endsOn: "2026-11-09" })).toEqual({ ok: false, reason: earlyTerminationNeedsSourceReason });
    expect(await cancel("2026-10-10", { endsOn: "2026-11-09", deviation: { ...earlyEnd, reason: " " } })).toEqual({ ok: false, reason: expect.stringContaining("reden") });
    expect(await cancel("2026-10-10", { endsOn: "2026-11-09", deviation: { ...earlyEnd, agreedOn: "2026-10-11" } })).toEqual({ ok: false, reason: expect.stringContaining("na vandaag") });
    expect(service().ends_on).toBeNull();
    // Straight at the row, past the flow: the check constraint the fake mirrors.
    const refused = (await db
      .from("recurring_services")
      .update({ cancellation_requested_at: "2026-10-10T09:00:00.000Z", ends_on: "2026-11-09", cancellation_notice_months: 1, cancellation_minimum_term_months: 12, cancellation_minimum_term_ends_on: "2027-09-03", cancellation_contractual_ends_on: "2027-09-03", cancellation_source: "x", cancellation_proration_rule: "pro_rata_days" })
      .eq("id", "svc-1")
      .select("id")) as { error: { message: string } | null };
    expect(refused.error?.message).toContain("recurring_services_deviation_has_source");
  });

  /* C. With a valid later agreement: allowed, and the snapshot says on what. */
  it("ends inside the minimum term on a recorded later agreement, kept in the snapshot", async () => {
    db = seed({ revisions: [withMinimum()] });
    const result = await cancel("2026-10-10", { endsOn: "2026-11-09", deviation: earlyEnd });
    expect(result).toMatchObject({ ok: true, plan: { endsOn: "2026-11-09", belowMinimumTerm: true, contractualEndsOn: "2027-09-03" } });
    expect(service()).toMatchObject({
      ends_on: "2026-11-09",
      cancellation_minimum_term_ends_on: "2027-09-03",
      cancellation_deviation_source_kind: "later_written_amendment",
      cancellation_deviation_source_label: "E-mail van de klant, 8 oktober 2026",
      cancellation_deviation_agreed_on: "2026-10-08",
      cancellation_deviation_reason: "Klant verhuist naar eigen omgeving",
    });
    const stored = recurringServiceFromRow(service() as never);
    expect(stored.cancellation?.deviation).toEqual(earlyEnd);
    const management = recurringManagement({
      service: stored,
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04"],
      overview: recurringOverview({ service: stored, billedPeriodStarts: [], priceChanges: [] }, [], "2026-10-11"),
      todayKey: "2026-10-11",
      agreement: await resolveServiceAgreement(db as never, "svc-1", "2026-10-11"),
    });
    expect(management.ending?.notice).toMatchObject({ minimumTermEndsOn: "2027-09-03", deviates: true, deviation: earlyEnd });
    // Provenance given for the contractual day itself is not recorded: there is no deviation to explain.
    db = seed({ revisions: [withMinimum()] });
    const contractual = await cancel("2026-10-10", { deviation: earlyEnd });
    expect(contractual).toMatchObject({ ok: true, plan: { deviates: false } });
    expect(service().cancellation_deviation_source_kind).toBeNull();
  });

  /* D. The agreement changes afterwards; the early termination's provenance does not. */
  it("keeps the early termination's provenance after the agreement and its source change", async () => {
    db = seed({ revisions: [withMinimum()] });
    expect((await cancel("2026-10-10", { endsOn: "2026-11-09", deviation: earlyEnd })).ok).toBe(true);
    const later = await recordAgreementRevision(db as never, "svc-1", amendment({ supersedesId: "rev-min", effectiveFrom: "2026-10-20", acceptedOn: "2026-10-20", noticeMonths: 3, minimumTermMonths: 24 }));
    expect(later.ok).toBe(true);
    await db.from("quotes").delete().eq("id", "quote-1");
    expect(await resolveServiceAgreement(db as never, "svc-1", "2026-11-01")).toMatchObject({ noticeMonths: 3, minimumTermMonths: 24 });

    expect(await cancel("2026-11-01")).toMatchObject({ ok: true, reused: true, plan: { endsOn: "2026-11-09", contractualEndsOn: "2027-09-03", minimumTermEndsOn: "2027-09-03", belowMinimumTerm: true } });
    expect(service()).toMatchObject({
      cancellation_minimum_term_months: 12,
      cancellation_minimum_term_ends_on: "2027-09-03",
      cancellation_contractual_ends_on: "2027-09-03",
      cancellation_source: "Offerte YM-O-2026-000014",
      cancellation_deviation_source_label: "E-mail van de klant, 8 oktober 2026",
      cancellation_deviation_reason: "Klant verhuist naar eigen omgeving",
    });
  });
});

// --------------------------------------------- a later day is contractual

describe("a last day later than the contractual one", () => {
  const laterEnd = { sourceKind: "accepted_offer" as const, sourceLabel: "Offerte YM-O-2026-000014", agreedOn: "2026-10-09", reason: "Einde maandperiode afgesproken bij opdracht" };

  /* 2. Later without a source: refused; the contractual day is not simply extended. */
  it("is refused without a recorded agreement: there is no running on without one", async () => {
    db = seed({ revisions: [revisionA] });
    expect(await cancel("2026-10-10", { endsOn: "2026-12-03" })).toEqual({ ok: false, reason: deviationReason });
    expect(await cancel("2026-10-10", { endsOn: "2026-12-03", deviation: { ...laterEnd, sourceLabel: " " } })).toEqual({ ok: false, reason: expect.stringContaining("Omschrijf") });
    expect(service().ends_on).toBeNull();
    // And at the row: a later day without provenance violates the same check as an earlier one.
    const refused = (await db
      .from("recurring_services")
      .update({ cancellation_requested_at: "2026-10-10T09:00:00.000Z", ends_on: "2026-12-03", cancellation_notice_months: 1, cancellation_contractual_ends_on: "2026-11-09", cancellation_source: "x", cancellation_proration_rule: "pro_rata_days" })
      .eq("id", "svc-1")
      .select("id")) as { error: { message: string } | null };
    expect(refused.error?.message).toContain("recurring_services_deviation_has_source");
  });

  /* 3. Later with a source: a contractual deviation, snapshotted next to the day the agreement gave. */
  it("is a contractual deviation with its agreement, kept next to the contractual day it replaces", async () => {
    db = seed({ revisions: [revisionA] });
    const result = await cancel("2026-10-10", { endsOn: "2026-12-03", deviation: laterEnd });
    expect(result).toMatchObject({ ok: true, plan: { endsOn: "2026-12-03", contractualEndsOn: "2026-11-09", deviates: true, belowNotice: false, belowMinimumTerm: false, lastTerm: { partial: false } } });
    expect(service()).toMatchObject({
      ends_on: "2026-12-03",
      cancellation_contractual_ends_on: "2026-11-09",
      cancellation_deviation_source_kind: "accepted_offer",
      cancellation_deviation_source_label: "Offerte YM-O-2026-000014",
      cancellation_deviation_agreed_on: "2026-10-09",
      cancellation_deviation_reason: "Einde maandperiode afgesproken bij opdracht",
    });
    // Billed and collected through the agreed day: the November period is the last one, in full.
    expect(result.ok && result.plan.lastDebitOn).toBe("2026-11-04");
    expect(result.ok && result.plan.collectionsAhead).toEqual(["2026-11-04"]);

    /* 5. A later revision changes nothing of it. */
    expect((await recordAgreementRevision(db as never, "svc-1", amendment({ supersedesId: "rev-1", effectiveFrom: "2026-10-20", acceptedOn: "2026-10-20", noticeMonths: 3 }))).ok).toBe(true);
    expect(await cancel("2026-11-01")).toMatchObject({ ok: true, reused: true, plan: { endsOn: "2026-12-03", contractualEndsOn: "2026-11-09", deviates: true } });
    const stored = recurringServiceFromRow(service() as never);
    expect(stored.cancellation).toMatchObject({ contractualEndsOn: "2026-11-09", deviation: laterEnd, noticeMonths: 1 });
  });
});

// ------------------------------------------------- services are not removed

describe("a used service is not removed", () => {
  it("refuses to delete a service with a subscription, a cancellation, invoices or a price change, and lets an unused draft go", async () => {
    db = seed({ revisions: [revisionA] });
    const attempt = async (id: string) => ((await db.from("recurring_services").delete().eq("id", id)) as { error: { message: string } | null }).error?.message;
    expect(await attempt("svc-1")).toMatch(/wordt niet verwijderd/);
    expect(db.rows("recurring_services").some((row) => row.id === "svc-1")).toBe(true);
    expect(db.rows("recurring_service_agreements")).toHaveLength(1);

    db.rows("recurring_services").push({ ...serviceRow(recurringFixture({ id: "svc-draft", status: "draft" })) });
    expect(await attempt("svc-draft")).toBeUndefined();
    db.rows("recurring_services").push({ ...serviceRow(recurringFixture({ id: "svc-ended", status: "canceled" })) });
    expect(await attempt("svc-ended")).toMatch(/wordt niet verwijderd/);
    db.rows("recurring_services").push({ ...serviceRow(recurringFixture({ id: "svc-billed", status: "draft" })) });
    db.rows("invoices").push({ id: "inv-x", customer_id: "cust-1", recurring_service_id: "svc-billed", billing_period_start: "2026-11-04", status: "sent" });
    expect(await attempt("svc-billed")).toMatch(/wordt niet verwijderd/);
  });
});

// --------------------------------------------------- append-only history

describe("the history is append-only", () => {
  /* 9. Not deletable through the application. */
  it("refuses to delete a revision while its service exists", async () => {
    db = seed({ revisions: [revisionA, revisionB] });
    const refused = (await db.from("recurring_service_agreements").delete().eq("id", "rev-1")) as { error: { message: string } | null };
    expect(refused.error?.message).toMatch(/wordt niet verwijderd/);
    expect(await listAgreementRevisionsForService(db as never, "svc-1")).toHaveLength(2);
  });
});

// ------------------------------------------------------------ billing

describe("billing stays where it is", () => {
  /* 14. Monthly, in advance: the invoice falls due on the first day of the period it bills. */
  it("bills monthly in advance, as the general terms say, with no override in the agreement", () => {
    expect(recurringInvoiceDates({ start: "2026-11-04", end: "2026-12-03" }, "2026-10-21")).toEqual({ issueDate: "2026-10-21", dueDate: "2026-11-04" });
    const agreement = resolveAgreementAt([revisionA, revisionB], "2027-03-01");
    expect(agreement.billing).toEqual({ frequency: "monthly", inAdvance: true });
    expect(billingLabel(agreement.billing)).toBe("Maandelijks vooraf");
    expect(Object.keys(revisionRow(revisionB))).not.toContain("billing_interval");
  });
});

// ------------------------------------------------------------ the screen

describe("the agreement block", () => {
  const financials = { currentNetCents: 1000, currentGrossCents: 1210, vatRate: 21, startsOn: "2026-10-04", anchorDay: 4 };

  /* 13. Source, acceptance date and the applicable set of general terms are on the screen. */
  it("shows the source, the acceptance date and the applicable set of general terms", () => {
    const fromOffer = revision({ id: "rev-offer", sourceKind: "accepted_offer", sourceLabel: "Offerte YM-O-2026-000014", acceptedOn: "2026-09-12", noticeMonths: 2, effectiveFrom: "2026-10-04" });
    const html = renderToStaticMarkup(
      <ServiceAgreementPanel
        serviceId="svc-1"
        agreement={resolveAgreementAt([fromOffer], "2026-12-01")}
        head={fromOffer}
        history={agreementHistory([fromOffer])}
        financials={financials}
        quotes={[]}
        todayKey="2026-12-01"
      />,
    );
    expect(html).toContain("Offerte YM-O-2026-000014");
    expect(html).toContain("Geaccepteerd");
    expect(html).toContain("12 sep 2026");
    expect(html).toContain("B2B 2026");
    expect(html).toContain("29 sep 2026");
    expect(html).toContain("2 kalendermaanden");
    expect(html).toContain("standaard 1 kalendermaand");
    expect(html).toContain("Maandelijks vooraf");
    expect(html).toContain("4e van de maand");
    expect(html).toContain("Afspraken bewerken");
  });

  it("marks every term as standard for a service with only the general terms", () => {
    const html = renderToStaticMarkup(
      <ServiceAgreementPanel serviceId="svc-1" agreement={resolveAgreementAt([revisionA], "2026-12-01")} head={revisionA} history={agreementHistory([revisionA])} financials={financials} quotes={[]} todayKey="2026-12-01" />,
    );
    expect(html).toContain("1 kalendermaand");
    expect(html).toContain("Algemene Voorwaarden B2B 2026");
    expect(html).toContain(">Geen<"); // afwijkende afspraken, minimale looptijd
    expect(html).not.toContain("Afwijkend ·");
  });

  it("announces a revision that takes effect later", () => {
    const html = renderToStaticMarkup(
      <ServiceAgreementPanel serviceId="svc-1" agreement={resolveAgreementAt([revisionA, revisionB], "2027-01-20")} head={revisionB} history={agreementHistory([revisionA, revisionB])} financials={financials} quotes={[]} todayKey="2027-01-20" />,
    );
    expect(html).toContain("gaat in op 1 feb 2027");
    expect(html).toContain("Historie van de afspraken (2)");
    expect(html).toContain("1 kalendermaand (standaard) → 2 kalendermaanden");
  });
});

describe("the first revision of a new service", () => {
  it("is the standard under the set published today, from the service's start", () => {
    const input = standardBaselineInput("2026-11-01", terms2026, "Bij aanmaken");
    expect(validateAgreementInput(input)).toBeNull();
    expect(input).toMatchObject({ sourceKind: "standard_terms", effectiveFrom: "2026-11-01", terms: terms2026 });
    expect(input.supersedesId).toBeUndefined();
  });
});
