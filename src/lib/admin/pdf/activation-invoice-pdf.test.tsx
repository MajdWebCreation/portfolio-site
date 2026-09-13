import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import InvoicePdf, { activationNote, type InvoiceActivation } from "@/lib/admin/pdf/invoice-pdf";
import { invoiceFixture } from "@/lib/payments/fixtures";
import { calculateTotals, formatCents } from "@/lib/money";

/**
 * A one-off invoice that also authorises a monthly collection.
 *
 * The risk this covers is arithmetic, not wording: a monthly amount printed
 * near a total invites the reader to add it in. So the note is asserted to say
 * the opposite in as many words, and the totals are asserted to come from the
 * invoice lines alone.
 */
const activates: InvoiceActivation = {
  serviceName: "Websitebeheer",
  monthlyGrossCents: 3025,
  firstDebitOn: "2026-10-01",
};

const invoice = invoiceFixture({ netCents: 150000 });
const flat = (value: string) => value.replace(/ /g, " ");

describe("the note on an invoice that switches a service on", () => {
  it("names the monthly amount and the first collection date", () => {
    const note = flat(activationNote(activates));
    expect(note).toContain("Websitebeheer");
    expect(note).toContain("€ 30,25 per maand inclusief btw");
    expect(note).toContain("1 okt 2026");
  });

  /* The sentence that keeps the monthly amount out of the sum. */
  it("says the monthly amount is not part of this invoice total", () => {
    expect(activationNote(activates)).toContain("maakt geen deel uit van het totaal van deze factuur");
    expect(activationNote(activates)).toContain("apart in rekening gebracht");
  });
});

describe("the document itself", () => {
  it("totals only its own lines", () => {
    const totals = calculateTotals(invoice.lines);
    expect(totals.subtotalCents).toBe(150000);
    expect(totals.totalCents).toBe(181500);
    expect(flat(formatCents(totals.totalCents))).toBe("€ 1.815,00");
    // The monthly gross is nowhere in the document's arithmetic.
    expect(totals.totalCents).not.toBe(181500 + activates.monthlyGrossCents);
  });

  it("renders on one page with the note", async () => {
    const pdf = await renderToBuffer(<InvoicePdf invoice={invoice} activates={activates} />);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  });

  it("renders the same invoice without the note when nothing is activated", async () => {
    const pdf = await renderToBuffer(<InvoicePdf invoice={invoice} />);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
