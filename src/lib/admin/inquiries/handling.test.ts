import { describe, expect, it } from "vitest";
import { validateInquiryHandling } from "@/lib/admin/inquiries/handling";
import { serviceInterestOptionsMirrorTheSiteServices } from "@/lib/admin/inquiries/handling.test-support";

/*
  The rules of the pipeline panel, without a database: what the server
  action accepts and what it refuses, in the words the admin sees.
*/
describe("validateInquiryHandling", () => {
  const base = { status: "contacted", internalNote: "" };

  it("accepts a stage with nothing else", () => {
    expect(validateInquiryHandling(base)).toEqual({ ok: true, value: { status: "contacted", internalNote: "" } });
  });

  it("refuses an unknown stage, including the handling states of before", () => {
    for (const status of ["viewed", "follow_up", "completed", "rejected", "won!", ""]) {
      expect(validateInquiryHandling({ ...base, status })).toEqual({ ok: false, error: "Onbekende status." });
    }
  });

  it("needs a reason for lost, and only for lost", () => {
    expect(validateInquiryHandling({ ...base, status: "lost" })).toMatchObject({ ok: false, error: expect.stringContaining("reden") });
    expect(validateInquiryHandling({ ...base, status: "lost", lostReason: "meteor" })).toMatchObject({ ok: false });
    expect(validateInquiryHandling({ ...base, status: "lost", lostReason: "price" })).toEqual({ ok: true, value: { status: "lost", lostReason: "price", internalNote: "" } });
    expect(validateInquiryHandling({ ...base, status: "won", lostReason: "price" })).toMatchObject({ ok: false });
  });

  it("keeps whole non-negative cents and refuses anything else", () => {
    expect(validateInquiryHandling({ ...base, status: "won", wonValueCents: 149500, recurringMonthlyCents: 1500, quotedValueCents: null })).toEqual({
      ok: true,
      value: { status: "won", wonValueCents: 149500, recurringMonthlyCents: 1500, internalNote: "" },
    });
    expect(validateInquiryHandling({ ...base, status: "won", wonValueCents: 0 })).toMatchObject({ ok: true, value: { wonValueCents: 0 } });
    expect(validateInquiryHandling({ ...base, status: "quote_sent", quotedValueCents: 12.5 })).toMatchObject({ ok: false, error: expect.stringContaining("Offertewaarde") });
    expect(validateInquiryHandling({ ...base, status: "won", wonValueCents: -1 })).toMatchObject({ ok: false, error: expect.stringContaining("Eenmalige") });
    expect(validateInquiryHandling({ ...base, status: "won", recurringMonthlyCents: Number.NaN })).toMatchObject({ ok: false, error: expect.stringContaining("Maandelijkse") });
  });

  it("keeps the quoted value next to the won value: winning at a lower price never overwrites the quote", () => {
    expect(validateInquiryHandling({ ...base, status: "won", quotedValueCents: 149500, wonValueCents: 125000, recurringMonthlyCents: 1500 })).toEqual({
      ok: true,
      value: { status: "won", quotedValueCents: 149500, wonValueCents: 125000, recurringMonthlyCents: 1500, internalNote: "" },
    });
  });

  it("keeps a value whatever the stage: the current values outlive the moment they were entered", () => {
    expect(validateInquiryHandling({ ...base, status: "contacted", quotedValueCents: 100000 })).toMatchObject({ ok: true, value: { quotedValueCents: 100000 } });
  });

  it("accepts only a service the site knows", () => {
    expect(validateInquiryHandling({ ...base, serviceInterest: "business-websites" })).toMatchObject({ ok: true, value: { serviceInterest: "business-websites" } });
    expect(validateInquiryHandling({ ...base, serviceInterest: "time-travel" })).toEqual({ ok: false, error: "Onbekende dienst." });
    expect(validateInquiryHandling({ ...base, serviceInterest: "" })).toMatchObject({ ok: true });
  });

  it("checks the same service list the database and the site use", () => {
    expect(serviceInterestOptionsMirrorTheSiteServices()).toBe(true);
  });
});
