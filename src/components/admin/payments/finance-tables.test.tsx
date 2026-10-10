import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CustomerFinance from "@/components/admin/customers/customer-finance";
import AttentionList from "@/components/admin/payments/attention-list";
import CollectionsTable from "@/components/admin/payments/collections-table";
import CreditNotesTable from "@/components/admin/payments/credit-notes-table";
import FinanceSummaryRow from "@/components/admin/payments/finance-summary";
import FinanceTabs, { financeHref } from "@/components/admin/payments/finance-tabs";
import InvoiceTable from "@/components/admin/payments/invoice-table";
import { customerFixtures } from "@/lib/admin/customers/fixtures";
import type { CreditNoteRow, InvoiceRow } from "@/lib/payments/finance-overview";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

vi.mock("@/lib/payments/refund-actions", () => ({ refundCreditNoteViaMollie: vi.fn(), markCreditNoteRefundedManually: vi.fn(), refreshRefundStatus: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { default: RefundPanel } = await import("@/components/admin/payments/refund-panel");

const customers = [{ ...customerFixtures[0]!, id: "cust-1", companyName: "Alfa BV" }];

describe("the payments tables", () => {
  it("render their empty states without a table", () => {
    expect(renderToStaticMarkup(<InvoiceTable rows={[]} customers={customers} />)).toContain("Nog geen definitieve facturen.");
    expect(renderToStaticMarkup(<CollectionsTable rows={[]} customers={customers} todayKey="2026-10-10" />)).toContain("Nog geen terugkerende diensten.");
    expect(renderToStaticMarkup(<CreditNotesTable rows={[]} customers={customers} />)).toContain("Nog geen creditnota");
    expect(renderToStaticMarkup(<AttentionList items={[]} />)).toContain("Niets vraagt aandacht");
  });

  it("render invoice rows as a responsive table with labelled cells", () => {
    const row: InvoiceRow = { invoice: invoiceFixture(), customerName: "Alfa BV", totalCents: 12100, creditedCents: 6050, paidCents: 12100, outstandingCents: 0, methodLabel: "Mollie", overdue: false, daysOverdue: 0, paymentFailed: false, credited: "partial" };
    const html = renderToStaticMarkup(<InvoiceTable rows={[row]} customers={customers} customerId="cust-1" />);
    expect(html).toContain('class="adm-table"');
    expect(html).toContain('data-label="Openstaand"');
    expect(html).toContain("Deels gecrediteerd");
    expect(html).toContain("/admin/facturen/inv-1");
    /* The customer filter arrives preselected from the URL. */
    expect(html).toContain('value="cust-1" selected');
  });

  it("render credit note rows with what is still owed back, and the link to the note", () => {
    const row: CreditNoteRow = {
      creditNote: { id: "cn-1", number: { value: "YM-C-2026-000001", provisional: false }, status: "issued", customer: invoiceFixture().customer, invoiceId: "inv-1", reason: "Korting", issueDate: "2026-10-10", source: "manual", lines: [], subtotalCents: 5000, vatCents: 1050, totalCents: 6050, issuedAt: "x", createdAt: "x", updatedAt: "x" },
      customerName: "Alfa BV",
      invoiceNumber: "YM-F-2026-000001",
      ledger: { creditNoteId: "cn-1", totalCents: 6050, refundDueCents: 6050, refundedCents: 3000, inFlightCents: 0, remainingCents: 3050, lastRefundFailed: false, state: "refund_due" },
      methods: ["manual"],
      state: "refund_due",
      unfinished: false,
    };
    const html = renderToStaticMarkup(<CreditNotesTable rows={[row]} customers={customers} />);
    expect(html).toContain("/admin/betalingen/creditnotas/cn-1");
    expect(html).toContain("Nog terug te betalen");
    expect(html).toContain("30,50");
  });

  it("link the tabs with the customer kept, and the customer page to the filtered list", () => {
    expect(financeHref("creditnotas", "cust-1")).toBe("/admin/betalingen?tab=creditnotas&klant=cust-1");
    expect(financeHref("overzicht")).toBe("/admin/betalingen");
    const tabs = renderToStaticMarkup(<FinanceTabs active="facturen" customerId="cust-1" counts={{ facturen: 2 }} />);
    expect(tabs).toContain('aria-current="page"');
    expect(tabs).toContain("/admin/betalingen?tab=incassos&amp;klant=cust-1");
    const finance = renderToStaticMarkup(
      <CustomerFinance
        customerId="cust-1"
        summary={{ financials: { status: "open", outstandingCents: 12100, overdueCents: 0, openInvoiceCount: 1, lastSuccessfulPayment: paymentFixture() }, collectingServices: 1, refundDueCents: 3050, openCreditNotes: 1 }}
      />,
    );
    expect(finance).toContain("/admin/betalingen?klant=cust-1");
    expect(finance).toContain("Alle betalingen bekijken");
    expect(finance).toContain("Nog terug te betalen");
  });

  it("summarise only figures with a source", () => {
    const html = renderToStaticMarkup(
      <FinanceSummaryRow summary={{ outstandingCents: 12100, outstandingCount: 1, overdueCents: 0, overdueCount: 0, receivedThisMonthCents: 3630, receivedThisMonthCount: 1, upcomingCollections: 2, upcomingCollectionsCents: 7260, failedPayments: 0, openCreditsCount: 1, refundDueCents: 3050 }} />,
    );
    for (const label of ["Openstaand", "Achterstallig", "Deze maand ontvangen", "Komende incasso", "Mislukte betalingen", "Open crediteringen"]) expect(html).toContain(label);
  });
});

describe("the refund panel", () => {
  const ledger = { creditNoteId: "cn-1", totalCents: 6050, refundDueCents: 6050, refundedCents: 3000, inFlightCents: 0, remainingCents: 3050, lastRefundFailed: false, state: "refund_due" as const };
  const base = { creditNoteId: "cn-1", creditNoteNumber: "YM-C-2026-000001", customerName: "Alfa BV", invoiceNumber: "YM-F-2026-000001", refunds: [], todayKey: "2026-10-12" };

  it("says what is still owed back and offers both ways, Mollie only when the invoice was paid through it", () => {
    const withMollie = renderToStaticMarkup(<RefundPanel {...base} ledger={ledger} molliePayments={[{ id: "tr_1", amountCents: 12100 }]} />);
    expect(withMollie).toContain("Nog terug te betalen: ");
    expect(withMollie).toContain("30,50");
    expect(withMollie).toContain("Via Mollie terugbetalen");
    expect(withMollie).toContain("Handmatig terugbetaald markeren");
    expect(withMollie).not.toContain("disabled=\"\">Via Mollie");

    const bankOnly = renderToStaticMarkup(<RefundPanel {...base} ledger={ledger} molliePayments={[]} />);
    expect(bankOnly).toContain("niet via Mollie betaald");
  });

  it("shows an offset note as settled and a processed one as done, with no buttons", () => {
    const offset = renderToStaticMarkup(<RefundPanel {...base} ledger={{ ...ledger, refundDueCents: 0, refundedCents: 0, remainingCents: 0, state: "offset" }} molliePayments={[]} />);
    expect(offset).toContain("verrekent met wat openstond");
    expect(offset).not.toContain("Via Mollie terugbetalen");
    const done = renderToStaticMarkup(<RefundPanel {...base} ledger={{ ...ledger, refundedCents: 6050, remainingCents: 0, state: "processed" }} molliePayments={[]} />);
    expect(done).toContain("Volledig verwerkt");
  });
});
