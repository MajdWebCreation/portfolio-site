import { type Cents, roundHalfUp } from "@/lib/money/money";

/**
 * VAT and totals for a document. Rates are percentages with up to two
 * decimals (21, 9, 0). VAT is calculated per rate over the summed net amount
 * of that rate, rounded once per rate, which is how Dutch invoices normally
 * show it; the sum of the rate groups is the document's VAT.
 */
export type TaxableLine = {
  /** Quantity in hundredths (250 = 2,5). */
  quantityHundredths: number;
  /** Unit price excl. VAT in cents. */
  unitPriceCents: Cents;
  /** VAT percentage, e.g. 21. */
  vatRate: number;
};

export type LineTotals = {
  netCents: Cents;
};

export type VatGroup = {
  rate: number;
  netCents: Cents;
  vatCents: Cents;
};

export type DocumentTotals = {
  subtotalCents: Cents;
  vatGroups: VatGroup[];
  vatCents: Cents;
  totalCents: Cents;
};

export const allowedVatRates: readonly number[] = [0, 9, 21];

export function isValidVatRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 && roundHalfUp(rate * 100) === rate * 100;
}

/** quantity × unit price, exact in integers, rounded to the cent. */
export function lineNetCents(line: Pick<TaxableLine, "quantityHundredths" | "unitPriceCents">): Cents {
  if (!Number.isSafeInteger(line.quantityHundredths) || !Number.isSafeInteger(line.unitPriceCents)) {
    throw new RangeError("Line values must be integers");
  }
  return roundHalfUp((line.quantityHundredths * line.unitPriceCents) / 100);
}

export function calculateTotals(lines: readonly TaxableLine[]): DocumentTotals {
  const groups = new Map<number, VatGroup>();
  let subtotalCents = 0;

  for (const line of lines) {
    if (!isValidVatRate(line.vatRate)) {
      throw new RangeError(`Invalid VAT rate: ${line.vatRate}`);
    }
    const netCents = lineNetCents(line);
    subtotalCents += netCents;
    const group = groups.get(line.vatRate) ?? { rate: line.vatRate, netCents: 0, vatCents: 0 };
    group.netCents += netCents;
    groups.set(line.vatRate, group);
  }

  const vatGroups = [...groups.values()]
    .map((group) => ({ ...group, vatCents: roundHalfUp((group.netCents * group.rate) / 100) }))
    .sort((a, b) => b.rate - a.rate);
  const vatCents = vatGroups.reduce((sum, group) => sum + group.vatCents, 0);

  return { subtotalCents, vatGroups, vatCents, totalCents: subtotalCents + vatCents };
}
