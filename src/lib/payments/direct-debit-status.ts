import type { MandateActivation } from "@/lib/payments/mandate-activation";

/**
 * Where a customer's direct debit stands, in the admin's words.
 *
 *   not_active          nothing asked yet, or the last link was replaced
 *   link_created        a link exists and has not been paid; no activation
 *                       mail has gone out for it (it may have been copied)
 *   link_mailed         the same, and the activation mail for it was
 *                       actually sent -- the only state that says "verstuurd"
 *   mandate_pending     paid; Mollie has not (yet) called the mandate valid
 *   active              Mollie called the mandate valid when last asked
 *   problem             paid, but Mollie reports no usable mandate
 *
 * The latest paid activation carries what Mollie last said and wins; the
 * cached mandate on the customer covers a mandate that came about otherwise.
 */
export type DirectDebitStatus = "not_active" | "link_created" | "link_mailed" | "mandate_pending" | "active" | "problem";

export function directDebitStatus(input: {
  activations: readonly Pick<MandateActivation, "paidAt" | "archivedAt" | "createdAt" | "mandateStatus" | "mailedAt">[];
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
  if (open) return open.mailedAt ? "link_mailed" : "link_created";
  return "not_active";
}

export const directDebitStatusLabels: Record<DirectDebitStatus, string> = {
  not_active: "Incasso niet actief",
  link_created: "Activatielink aangemaakt, nog niet gemaild",
  link_mailed: "Activatielink verstuurd, wacht op betaling",
  mandate_pending: "Betaling ontvangen, machtiging in behandeling",
  active: "Incasso actief",
  problem: "Incasso probleem",
};

export const directDebitStatusTone: Record<DirectDebitStatus, "neutral" | "accent" | "success" | "danger"> = {
  not_active: "neutral",
  link_created: "accent",
  link_mailed: "accent",
  mandate_pending: "accent",
  active: "success",
  problem: "danger",
};
