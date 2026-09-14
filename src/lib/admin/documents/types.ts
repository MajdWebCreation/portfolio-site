import type { Customer } from "@/lib/admin/customers/types";
import type { Cents } from "@/lib/money";

/**
 * Shared shape of quotes and invoices: who it is for (a snapshot), the
 * lines, and the notes. Quote and Invoice add their own dates, statuses and
 * labels in their own modules; they are not the same object.
 */
export type CustomerSnapshot = {
  customerId: string;
  companyName: string;
  contactName: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  kvkNumber?: string;
  vatNumber?: string;
};

/** Copies what a document needs, so later customer edits never change an issued document. */
export function snapshotCustomer(customer: Customer): CustomerSnapshot {
  return {
    customerId: customer.id,
    companyName: customer.companyName,
    contactName: customer.contactName,
    email: customer.email,
    street: customer.address.street,
    postalCode: customer.address.postalCode,
    city: customer.address.city,
    country: customer.address.country,
    kvkNumber: customer.kvkNumber,
    vatNumber: customer.vatNumber,
  };
}

export type DocumentLine = {
  id: string;
  description: string;
  /** Quantity in hundredths (100 = 1). */
  quantityHundredths: number;
  /** Unit price excl. VAT in cents. */
  unitPriceCents: Cents;
  /** VAT percentage, e.g. 21. */
  vatRate: number;
};

export type DocumentNumber = {
  value: string;
  /** True until a persistent sequence has issued the number. */
  provisional: boolean;
};

export type DocumentKind = "quote" | "invoice";

export const documentKindLabels: Record<DocumentKind, string> = {
  quote: "Offerte",
  invoice: "Factuur",
};

/**
 * A monthly service a one-off invoice switches on.
 *
 * Lives here rather than with the PDF because three screens now say the same
 * sentence about it -- the PDF note, the mail and the admin's own preview --
 * and they have to be talking about one set of figures. The amount is the
 * monthly charge including VAT, because that is what actually leaves the
 * customer's account; it is never part of the invoice's own total.
 */
export type InvoiceActivation = {
  serviceName: string;
  monthlyGrossCents: Cents;
  /** YYYY-MM-DD of the first automatic collection. */
  firstDebitOn: string;
};
