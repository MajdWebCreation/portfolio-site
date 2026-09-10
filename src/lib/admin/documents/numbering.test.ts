import { describe, expect, it } from "vitest";
import {
  isDefinitiveDocumentNumber,
  issuedDocumentNumber,
  provisionalDocumentNumber,
} from "@/lib/admin/documents/numbering";

/**
 * The format is agreed with `assign_quote_number` / `assign_invoice_number` in
 * the database, which is what actually issues these numbers. If this drifts,
 * a document number produced here stops matching a stored one.
 */
describe("document numbers", () => {
  it("writes the definitive series as YM-O / YM-F with six digits", () => {
    expect(issuedDocumentNumber("quote", 2026, 1).value).toBe("YM-O-2026-000001");
    expect(issuedDocumentNumber("invoice", 2026, 1).value).toBe("YM-F-2026-000001");
    expect(issuedDocumentNumber("invoice", 2027, 1234).value).toBe("YM-F-2027-001234");
  });

  it("marks a definitive number as no longer provisional", () => {
    expect(issuedDocumentNumber("quote", 2026, 7).provisional).toBe(false);
    expect(provisionalDocumentNumber("quote", "ab12c").provisional).toBe(true);
  });

  it("keeps a provisional number recognisable as a concept", () => {
    expect(provisionalDocumentNumber("quote", "ab12c").value).toBe("OFF-CONCEPT-AB12C");
    expect(provisionalDocumentNumber("invoice", "ab12c").value).toBe("FAC-CONCEPT-AB12C");
  });

  it("tells the two kinds of number apart", () => {
    expect(isDefinitiveDocumentNumber("YM-F-2026-000001")).toBe(true);
    expect(isDefinitiveDocumentNumber("FAC-CONCEPT-AB12C")).toBe(false);
    expect(isDefinitiveDocumentNumber("YM-F-2026-1")).toBe(false);
  });
});
