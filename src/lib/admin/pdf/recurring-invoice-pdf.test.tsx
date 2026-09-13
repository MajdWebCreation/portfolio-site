import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import InvoicePdf, { invoiceMetaRows, isRecurringTerm } from "@/lib/admin/pdf/invoice-pdf";
import { invoiceFixture } from "@/lib/payments/fixtures";
import { calculateTotals, formatCents } from "@/lib/money";

/**
 * The monthly term as a PDF, which is the primary financial document.
 *
 * The rendered bytes are compressed, so reading words back out of them would
 * prove nothing. What is asserted instead is the decision that produces those
 * words -- which rows the document shows -- plus that the file renders, and
 * that the figures come from the invoice lines and from nowhere else.
 */
const term = invoiceFixture({
  id: "inv-term",
  number: { value: "YM-F-2026-000042", provisional: false },
  recurringServiceId: "svc-1",
  billingPeriodStart: "2026-10-12",
  billingPeriodEnd: "2026-11-11",
  issueDate: "2026-09-28",
  dueDate: "2026-10-12",
  paymentReference: "YM-F-2026-000042",
  lines: [
    {
      id: "l1",
      description: "Websitebeheer — 2026-10-12 t/m 2026-11-11",
      quantityHundredths: 100,
      unitPriceCents: 2500,
      vatRate: 21,
    },
  ],
});

describe("what the monthly term PDF shows", () => {
  it("is recognised as a term of a recurring service", () => {
    expect(isRecurringTerm(term)).toBe(true);
    expect(isRecurringTerm(invoiceFixture())).toBe(false);
    // All three facts are needed; a stray service id is not a term.
    expect(isRecurringTerm(invoiceFixture({ recurringServiceId: "svc-1" }))).toBe(false);
  });

  it("names the period and the collection date instead of a due date", () => {
    const rows = invoiceMetaRows(term);
    const labels = rows.map((row) => row.label);

    expect(labels).toEqual(["Factuurdatum", "Incassodatum", "Periode", "Betalingskenmerk"]);
    expect(labels).not.toContain("Vervaldatum");
    expect(rows.find((row) => row.label === "Periode")?.value).toBe("12 okt 2026 t/m 11 nov 2026");
    expect(rows.find((row) => row.label === "Incassodatum")?.value).toBe("12 okt 2026");
    expect(rows.find((row) => row.label === "Factuurdatum")?.value).toBe("28 sep 2026");
  });

  it("leaves an ordinary invoice with its due date and no period", () => {
    const labels = invoiceMetaRows(invoiceFixture()).map((row) => row.label);
    expect(labels).toEqual(["Factuurdatum", "Vervaldatum", "Betalingskenmerk"]);
  });

  /*
    The first term is paid before the document goes out. Printing a collection
    date on it would promise a second debit that is never coming.
  */
  it("shows no collection date on a term that is already paid", () => {
    const labels = invoiceMetaRows({ ...term, status: "paid" }).map((row) => row.label);
    expect(labels).toEqual(["Factuurdatum", "Periode", "Betalingskenmerk"]);
    expect(labels).not.toContain("Incassodatum");
    expect(labels).not.toContain("Vervaldatum");
  });

  it("renders a paid term too", async () => {
    const pdf = await renderToBuffer(<InvoicePdf invoice={{ ...term, status: "paid" }} />);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  /* The invoice lines are the single source for net, VAT and gross. */
  it("takes net, VAT and gross from the lines", () => {
    const totals = calculateTotals(term.lines);
    expect(totals.subtotalCents).toBe(2500);
    expect(totals.vatGroups).toEqual([{ rate: 21, netCents: 2500, vatCents: 525 }]);
    expect(totals.vatCents).toBe(525);
    expect(totals.totalCents).toBe(3025);
    // Intl formats with a non-breaking space; normalise before comparing.
    expect(formatCents(totals.totalCents).replace(/\u00a0/g, " ")).toBe("€ 30,25");
  });

  it("renders to a real file", async () => {
    const pdf = await renderToBuffer(<InvoicePdf invoice={term} />);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    // One page, the way the other document tests count them.
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  });

  it("still renders an ordinary invoice", async () => {
    const pdf = await renderToBuffer(<InvoicePdf invoice={invoiceFixture()} />);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
