import type { DocumentKind, DocumentNumber } from "@/lib/admin/documents/types";

/**
 * Document numbers.
 *
 * A document carries a provisional number (OFF-CONCEPT-… / FAC-CONCEPT-…)
 * from the moment it is created until it is actually issued to the customer.
 * Issuing is not done here: `assign_quote_number` / `assign_invoice_number`
 * in the database hand out YM-O-YYYY-000001 and YM-F-YYYY-000001 from a
 * counter per kind and year, in one transaction, and return the number the
 * document already has when it has one. Nothing in this module can compose a
 * definitive number, on purpose — a client that could would be a second
 * source of them.
 */
const prefixes: Record<DocumentKind, string> = { quote: "OFF", invoice: "FAC" };

/** Provisional number for a document that has not been issued yet. */
export function provisionalDocumentNumber(kind: DocumentKind, seed: string): DocumentNumber {
  return { value: `${prefixes[kind]}-CONCEPT-${seed.toUpperCase()}`, provisional: true };
}

/** The definitive series, as the database writes it; used by fixtures and tests. */
export function issuedDocumentNumber(kind: DocumentKind, year: number, sequence: number): DocumentNumber {
  const letter = kind === "quote" ? "O" : "F";
  return { value: `YM-${letter}-${year}-${String(sequence).padStart(6, "0")}`, provisional: false };
}

/** Whether a value looks like a number this system issued. */
export function isDefinitiveDocumentNumber(value: string): boolean {
  return /^YM-[OF]-\d{4}-\d{6}$/.test(value);
}
