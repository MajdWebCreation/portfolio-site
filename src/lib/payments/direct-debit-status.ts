import type { MandateActivation } from "@/lib/payments/mandate-activation";

/**
 * Where a customer's direct debit stands, in the admin's words.
 *
 *   not_active          nothing asked yet, or the last link was replaced
 *   awaiting_customer   a link is out and has not been paid
 *   mandate_pending     paid; Mollie has not (yet) called the mandate valid
 *   active              Mollie called the mandate valid when last asked
 *   problem             paid, but Mollie reports no usable mandate
 *
 * The latest paid activation carries what Mollie last said and wins; the
 * cached mandate on the customer covers a mandate that came about otherwise.
 */
export type DirectDebitStatus = "not_active" | "awaiting_customer" | "mandate_pending" | "active" | "problem";

export function directDebitStatus(input: {
  activations: readonly Pick<MandateActivation, "paidAt" | "archivedAt" | "createdAt" | "mandateStatus">[];
  mandateOnRecord: boolean;
}): DirectDebitStatus {
  const latestPaid = input.activations.find((activation) => activation.paidAt);
  const open = input.activations.find((activation) => !activation.paidAt && !activation.archivedAt);

  if (latestPaid && (!open || latestPaid.createdAt > open.createdAt)) {
    if (latestPaid.mandateStatus === "valid") return "active";
    if (!latestPaid.mandateStatus || latestPaid.mandateStatus === "pending") return "mandate_pending";
    return "problem";
  }
  if (input.mandateOnRecord) return "active";
  if (open) return "awaiting_customer";
  return "not_active";
}

export const directDebitStatusLabels: Record<DirectDebitStatus, string> = {
  not_active: "Incasso niet actief",
  awaiting_customer: "Activatielink verstuurd, wacht op klant",
  mandate_pending: "Machtiging in behandeling",
  active: "Incasso actief",
  problem: "Incasso probleem",
};

export const directDebitStatusTone: Record<DirectDebitStatus, "neutral" | "accent" | "success" | "danger"> = {
  not_active: "neutral",
  awaiting_customer: "accent",
  mandate_pending: "accent",
  active: "success",
  problem: "danger",
};
