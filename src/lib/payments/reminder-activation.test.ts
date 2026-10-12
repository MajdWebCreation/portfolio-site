import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/payments/fixtures";

/*
  Whether a reminder also offers the EUR 0.01 direct debit activation. The
  activation link itself -- reused while payable, never a second one, refused
  for a valid or pending mandate -- is requestMandateActivation's, tested in
  mandate-activation.test.ts; here only who is asked, and what its answers
  become in a reminder.
*/
const requestMandateActivation = vi.fn();
vi.mock("@/lib/payments/mandate-activation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/mandate-activation")>()),
  requestMandateActivation: (...args: unknown[]) => requestMandateActivation(...args),
}));

const { reminderActivation } = await import("@/lib/payments/reminder-activation");
const { alreadyActiveReason, paidUnprocessedReason, pendingReason } = await import("@/lib/payments/mandate-activation");

const today = "2026-10-12";
const service = (overrides: Record<string, unknown> = {}) => ({ id: "svc-1", customer_id: "cust-1", status: "awaiting_mandate", mollie_subscription_id: null, ends_on: null, ...overrides });
const activation = { checkoutUrl: "https://payment-link.mollie.com/payment/pl_act" };

let db: ReturnType<typeof createFakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb({ recurring_services: [service()] });
  requestMandateActivation.mockResolvedValue({ ok: true, activation, reused: false });
});

describe("the activation a reminder carries", () => {
  it("is offered while a service waits for its mandate, through the canonical activation", async () => {
    expect(await reminderActivation(db as never, "cust-1", today)).toEqual({ kind: "offer", url: activation.checkoutUrl });
    expect(requestMandateActivation).toHaveBeenCalledWith(db, "cust-1");
  });

  it("is offered for an active service that does not collect yet", async () => {
    db = createFakeDb({ recurring_services: [service({ status: "active" })] });
    expect((await reminderActivation(db as never, "cust-1", today)).kind).toBe("offer");
  });

  it("reuses the open link on a retry: the same URL, never a second activation decided here", async () => {
    requestMandateActivation.mockResolvedValue({ ok: true, activation, reused: true });
    const first = await reminderActivation(db as never, "cust-1", today);
    const again = await reminderActivation(db as never, "cust-1", today);
    expect(again).toEqual(first);
  });

  it.each([pendingReason, paidUnprocessedReason])("becomes 'being processed' once the customer did their part (%s)", async (reason) => {
    requestMandateActivation.mockResolvedValue({ ok: false, reason });
    expect(await reminderActivation(db as never, "cust-1", today)).toEqual({ kind: "awaiting_confirmation" });
  });

  it("is not offered once the mandate is valid", async () => {
    requestMandateActivation.mockResolvedValue({ ok: false, reason: alreadyActiveReason });
    expect(await reminderActivation(db as never, "cust-1", today)).toEqual({ kind: "none" });
  });

  it.each([
    ["no service at all", []],
    ["a service collecting by direct debit", [service({ status: "active", mollie_subscription_id: "sub_1" })]],
    ["a concept service", [service({ status: "draft" })]],
    ["a cancelled service", [service({ status: "canceled" })]],
    ["a service that ended", [service({ status: "active", ends_on: "2026-10-01" })]],
  ])("is not asked for with %s", async (_label, services) => {
    db = createFakeDb({ recurring_services: services });
    expect(await reminderActivation(db as never, "cust-1", today)).toEqual({ kind: "none" });
    expect(requestMandateActivation).not.toHaveBeenCalled();
  });

  it("costs only the activation block when anything fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    requestMandateActivation.mockRejectedValue(new Error("Mollie down"));
    expect(await reminderActivation(db as never, "cust-1", today)).toEqual({ kind: "none" });

    const failing = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "connection reset" } }) }) }) };
    expect(await reminderActivation(failing as never, "cust-1", today)).toEqual({ kind: "none" });
  });

  it("only looks at this customer's services", async () => {
    db = createFakeDb({ recurring_services: [service({ customer_id: "cust-2" })] });
    expect(await reminderActivation(db as never, "cust-1", today)).toEqual({ kind: "none" });
  });
});
