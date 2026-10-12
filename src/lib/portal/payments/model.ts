import { directDebitStatus, type DirectDebitStatus } from "@/lib/payments/direct-debit-status";
import type { MandateState } from "@/lib/mollie/client";
import { records, text, textOrNull } from "@/lib/portal/json";
import type { PortalInvoiceView } from "@/lib/portal/invoices/model";
import type { PortalService } from "@/lib/portal/services/model";
import type { Database } from "@/lib/supabase/database.types";

/**
 * What the portal knows about paying: whether direct debit is active, and
 * which invoices it collects. Read through portal_payment_context under the
 * member's own session -- dates and states only, never a link or an id.
 *
 * The status is the admin's own (direct-debit-status.ts), worded for the
 * customer. Whether a button is offered is decided here, from that status
 * and the invoice's ledger, and decided again on the server before anything
 * is asked of Mollie.
 */
type ContextRow = Database["public"]["Functions"]["portal_payment_context"]["Returns"][number];

export type PortalPaymentContext = {
  directDebit: DirectDebitStatus;
  directDebitInvoiceIds: string[];
};

const mandateStates: readonly MandateState[] = ["none", "pending", "valid", "invalid"];

function mandateState(value: string | null): MandateState | undefined {
  if (value === null) return undefined;
  if ((mandateStates as readonly string[]).includes(value)) return value as MandateState;
  throw new Error(`machtigingsstatus ${value}`);
}

export function paymentContextFromRow(row: ContextRow): PortalPaymentContext {
  const activations = records(row.activations, "activaties").map((item) => {
    const paidAt = textOrNull(item, "paid_at");
    const archivedAt = textOrNull(item, "archived_at");
    const status = mandateState(textOrNull(item, "mandate_status"));
    return {
      createdAt: text(item, "created_at"),
      ...(paidAt ? { paidAt } : {}),
      ...(archivedAt ? { archivedAt } : {}),
      ...(status ? { mandateStatus: status } : {}),
    };
  });
  return {
    directDebit: directDebitStatus({ activations, mandateOnRecord: row.mandate_on_record }),
    directDebitInvoiceIds: [...row.direct_debit_invoice_ids],
  };
}

/** The customer's words for the admin's direct debit status. */
export type PortalDirectDebitState = "not_active" | "started" | "awaiting_confirmation" | "active" | "problem";

export function portalDirectDebitState(status: DirectDebitStatus): PortalDirectDebitState {
  switch (status) {
    case "link_created":
    case "link_mailed":
      return "started";
    case "mandate_pending":
      return "awaiting_confirmation";
    default:
      return status;
  }
}

export const portalDirectDebitLabels: Record<PortalDirectDebitState, string> = {
  not_active: "Niet geactiveerd",
  started: "Activering gestart",
  awaiting_confirmation: "Wacht op bevestiging",
  active: "Actief",
  problem: "Probleem",
};

export const portalDirectDebitTone: Record<PortalDirectDebitState, "neutral" | "accent" | "success" | "danger"> = {
  not_active: "neutral",
  started: "accent",
  awaiting_confirmation: "accent",
  active: "success",
  problem: "danger",
};

/** Why an invoice has no pay button, or nothing when it may have one. */
export type InvoicePaymentBlock = "nothing_due" | "direct_debit";

export function invoicePaymentBlock(view: Pick<PortalInvoiceView, "openCents" | "invoice">, context: Pick<PortalPaymentContext, "directDebitInvoiceIds">): InvoicePaymentBlock | undefined {
  if (view.openCents <= 0) return "nothing_due";
  if (context.directDebitInvoiceIds.includes(view.invoice.id)) return "direct_debit";
  return undefined;
}

/**
 * Whether a direct debit still has to be set up for this customer: a
 * service waits for it -- awaiting the mandate, or running without a
 * collection yet -- and the mandate is neither valid nor on its way.
 */
export function needsDirectDebit(services: readonly Pick<PortalService, "status" | "collectsByDirectDebit" | "endsOn">[], todayKey: string): boolean {
  return services.some(
    (service) =>
      (service.status === "awaiting_mandate" || (service.status === "active" && !service.collectsByDirectDebit)) &&
      !(service.endsOn && service.endsOn < todayKey),
  );
}

export function mayActivateDirectDebit(status: DirectDebitStatus, services: Parameters<typeof needsDirectDebit>[0], todayKey: string): boolean {
  if (status === "active" || status === "mandate_pending") return false;
  return needsDirectDebit(services, todayKey);
}
