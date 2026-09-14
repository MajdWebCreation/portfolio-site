import { describe, expect, it } from "vitest";
import { invoiceFixture, recurringFixture } from "@/lib/payments/fixtures";
import { activationStatus, decidePaymentSequence, documentActivation } from "@/lib/payments/activation-decision";

/*
  Whether a customer is asked to authorise direct debit is a decision with
  money on both sides: asking when we already have permission is rude, and not
  asking when we need it leaves a service that can never collect. The rule is
  pure, so it is tested as a rule.
*/
const invoice = invoiceFixture();

describe("choosing between a one-off and a first payment", () => {
  it("keeps a plain invoice a one-off payment", () => {
    expect(decidePaymentSequence({ invoice, hasUsableMandate: false })).toEqual({
      sequence: "oneoff",
      reason: "no-recurring-service",
    });
  });

  it("asks for a first payment when a service still needs a mandate", () => {
    const service = recurringFixture({ activationInvoiceId: invoice.id });
    const decision = decidePaymentSequence({ invoice, service, hasUsableMandate: false });

    expect(decision.sequence).toBe("first");
    expect(decision.service).toBe(service);
    expect(decision.reason).toBe("needs-mandate");
  });

  /* The customer already authorised us; asking again would be asking twice. */
  it("stays a one-off payment when the customer already gave a mandate", () => {
    const service = recurringFixture({ activationInvoiceId: invoice.id });
    expect(decidePaymentSequence({ invoice, service, hasUsableMandate: true })).toMatchObject({
      sequence: "oneoff",
      reason: "mandate-already-given",
    });
  });

  it("stays a one-off payment when the service already collects", () => {
    const service = recurringFixture({ activationInvoiceId: invoice.id, mollie: { subscriptionId: "sub_1" } });
    expect(decidePaymentSequence({ invoice, service, hasUsableMandate: false })).toMatchObject({
      sequence: "oneoff",
      reason: "already-subscribed",
    });
  });
});

describe("what the admin is told about the collection", () => {
  it("says nothing for an invoice with no monthly service", () => {
    expect(activationStatus({ hasUsableMandate: false })).toBe("not_applicable");
  });

  it("waits for the first payment while nothing has happened", () => {
    expect(activationStatus({ service: recurringFixture(), hasUsableMandate: false })).toBe("awaiting_first_payment");
  });

  it("reports an active mandate before the subscription exists", () => {
    expect(activationStatus({ service: recurringFixture(), hasUsableMandate: true })).toBe("mandate_active");
  });

  it("reports an active subscription once money will be collected monthly", () => {
    const service = recurringFixture({ mollie: { subscriptionId: "sub_1" } });
    expect(activationStatus({ service, hasUsableMandate: true })).toBe("subscription_active");
  });

  /* The case worth a red badge: the money arrived, the authorisation did not. */
  it("flags an invoice that was paid without producing a mandate", () => {
    expect(
      activationStatus({ service: recurringFixture(), hasUsableMandate: false, activationInvoicePaid: true }),
    ).toBe("problem");
  });

  it("flags a cancelled service", () => {
    expect(activationStatus({ service: recurringFixture({ status: "canceled" }), hasUsableMandate: true })).toBe(
      "problem",
    );
  });
});

/*
  The admin's PDF preview and the send confirmation say what the customer is
  about to read. They may only say it while paying really is what establishes
  the mandate -- otherwise the screen promises a monthly collection the mail
  will not mention.
*/
describe("the activation note an admin screen may show", () => {
  const service = recurringFixture({ startsOn: "2026-10-01", amountCents: 2500, vatRate: 21 });

  it("quotes the monthly charge including VAT and the first collection", () => {
    expect(documentActivation({ service, status: "awaiting_first_payment" })).toEqual({
      serviceName: "Websitebeheer",
      monthlyGrossCents: 3025,
      firstDebitOn: "2026-10-01",
    });
  });

  it("says nothing for an invoice with no monthly service", () => {
    expect(documentActivation({ status: "not_applicable" })).toBeUndefined();
  });

  /* The customer authorised us earlier, so this mail is an ordinary invoice. */
  it("says nothing once a mandate exists", () => {
    expect(documentActivation({ service, status: "mandate_active" })).toBeUndefined();
  });

  it("says nothing while the service has no first collection date", () => {
    const undated = recurringFixture();
    expect(documentActivation({ service: undated, status: "awaiting_first_payment" })).toBeUndefined();
  });
});
