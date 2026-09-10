import { mkdirSync, writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { customerFixtures } from "@/lib/admin/customers/fixtures";
import { provisionalDocumentNumber } from "@/lib/admin/documents/numbering";
import { snapshotCustomer, type DocumentLine } from "@/lib/admin/documents/types";
import { invoiceFixtures } from "@/lib/admin/invoices/fixtures";
import type { Invoice } from "@/lib/admin/invoices/types";
import InvoicePdf from "@/lib/admin/pdf/invoice-pdf";
import QuotePdf from "@/lib/admin/pdf/quote-pdf";
import { quoteFixtures } from "@/lib/admin/quotes/fixtures";
import type { Quote } from "@/lib/admin/quotes/types";
import { calculateTotals } from "@/lib/money";

/**
 * Renders the sample documents the phase asks for. With PDF_OUT set, the
 * files are written there for visual review; the assertions always run.
 */
const outDir = process.env.PDF_OUT;

function pageCount(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

const manyLines: DocumentLine[] = Array.from({ length: 28 }, (_, i) => ({
  id: `m${i}`,
  description:
    i % 5 === 0
      ? `Regel ${i + 1}: uitgebreide omschrijving van werkzaamheden met meerdere onderdelen, afstemming met de klant, oplevering en documentatie zodat de regel over meerdere tekstregels loopt`
      : `Regel ${i + 1}: onderdeel van het project`,
  quantityHundredths: i % 3 === 0 ? 250 : 100,
  unitPriceCents: 12500 + i * 1375,
  vatRate: i % 4 === 0 ? 9 : i % 7 === 0 ? 0 : 21,
}));

const longNames = snapshotCustomer({
  ...customerFixtures[3],
  companyName: "Internationale Handelsonderneming Van der Meulen, Van den Broek & Zonen Beheer en Exploitatie B.V.",
  contactName: "Willem-Alexander van der Meulen-van den Broek",
});

const shortQuote = quoteFixtures[1];
const longQuote: Quote = { ...quoteFixtures[0], id: "q-long", number: provisionalDocumentNumber("quote", "test"), customer: longNames, lines: manyLines, notes: "Deze offerte is dertig dagen geldig. Werkzaamheden starten na schriftelijk akkoord. Doorbelaste kosten van derden zijn tegen kostprijs opgenomen." };
const shortInvoice = invoiceFixtures[2];
const longInvoice: Invoice = { ...invoiceFixtures[0], id: "i-long", number: provisionalDocumentNumber("invoice", "test"), customer: longNames, lines: manyLines, notes: "Betaling binnen 14 kalenderdagen na factuurdatum." };
const mixedVat: Invoice = { ...invoiceFixtures[1], id: "i-vat", lines: [
  { id: "a", description: "Ontwerp en bouw", quantityHundredths: 100, unitPriceCents: 149500, vatRate: 21 },
  { id: "b", description: "Doorbelaste vertaling", quantityHundredths: 100, unitPriceCents: 42000, vatRate: 9 },
  { id: "c", description: "Buitenlandse levering, btw verlegd", quantityHundredths: 300, unitPriceCents: 5000, vatRate: 0 },
] };

/** One line whose description runs well past the column, next to short ones. */
const longDescription: Invoice = {
  ...invoiceFixtures[2],
  id: "i-long-desc",
  customer: longNames,
  lines: [
    {
      id: "d1",
      description:
        "Ontwerp en bouw van de bedrijfswebsite, inclusief paginastructuur, teksten redigeren, beeldselectie, formulieren met e-mailmelding, technische SEO, meertalige voorbereiding, testen op telefoon, tablet en desktop, en begeleiding bij de livegang",
      quantityHundredths: 100,
      unitPriceCents: 149500,
      vatRate: 21,
    },
    { id: "d2", description: "Extra pagina", quantityHundredths: 300, unitPriceCents: 7500, vatRate: 21 },
    {
      id: "d3",
      description:
        "Doorbelaste kosten van derden: fotografie op locatie, licenties voor beeldmateriaal en een jaar hosting bij de gekozen provider",
      quantityHundredths: 100,
      unitPriceCents: 42000,
      vatRate: 9,
    },
  ],
  notes:
    "Betaling binnen 14 kalenderdagen na factuurdatum. Doorbelaste kosten van derden zijn tegen kostprijs opgenomen en op verzoek te specificeren.",
};

const samples = [
  { name: "01-offerte-kort", element: <QuotePdf quote={shortQuote} />, minPages: 1, totalCents: calculateTotals(shortQuote.lines).totalCents },
  { name: "02-offerte-lang", element: <QuotePdf quote={longQuote} />, minPages: 2, totalCents: calculateTotals(manyLines).totalCents },
  { name: "03-factuur-kort", element: <InvoicePdf invoice={shortInvoice} />, minPages: 1, totalCents: calculateTotals(shortInvoice.lines).totalCents },
  { name: "04-factuur-lang", element: <InvoicePdf invoice={longInvoice} />, minPages: 2, totalCents: calculateTotals(manyLines).totalCents },
  { name: "05-factuur-btw-tarieven", element: <InvoicePdf invoice={mixedVat} />, minPages: 1, totalCents: calculateTotals(mixedVat.lines).totalCents },
  { name: "06-factuur-lange-omschrijving", element: <InvoicePdf invoice={longDescription} />, minPages: 1, totalCents: calculateTotals(longDescription.lines).totalCents },
];

describe("document PDFs", () => {
  if (outDir) mkdirSync(outDir, { recursive: true });

  for (const sample of samples) {
    it(`renders ${sample.name}`, async () => {
      const pdf = await renderToBuffer(sample.element);
      expect(pdf.length).toBeGreaterThan(2000);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pageCount(pdf)).toBeGreaterThanOrEqual(sample.minPages);
      if (outDir) writeFileSync(`${outDir}/${sample.name}.pdf`, pdf);
      expect(Number.isSafeInteger(sample.totalCents)).toBe(true);
    }, 30000);
  }

  it("keeps a short document on one page", async () => {
    const pdf = await renderToBuffer(<QuotePdf quote={shortQuote} />);
    expect(pageCount(pdf)).toBe(1);
  });

  it("splits VAT per rate on the mixed invoice", () => {
    const totals = calculateTotals(mixedVat.lines);
    expect(totals.vatGroups.map((g) => g.rate)).toEqual([21, 9, 0]);
    expect(totals.subtotalCents).toBe(149500 + 42000 + 15000);
    expect(totals.vatCents).toBe(31395 + 3780);
    expect(totals.totalCents).toBe(206500 + 35175);
  });
});
