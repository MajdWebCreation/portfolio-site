import { adminDb } from "@/lib/admin/db";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { MolliePayment } from "@/lib/mollie/client";
import { isMollieConfigured } from "@/lib/mollie/config";
import { centsFromMollie, paymentStatusFromMollie } from "@/lib/mollie/client";
import { ensureInvoiceCheckout } from "@/lib/payments/checkout";
import { paymentFromRow } from "@/lib/payments/mapper";
import { listPaymentsForInvoice } from "@/lib/payments/repository";
import { isCollecting } from "@/lib/payments/types";

/**
 * The pay-by-link for an invoice mail.
 *
 * Three outcomes, and the caller has to tell them apart:
 *
 *   link           a working checkout URL; the mail carries the button.
 *
 *   none           there deliberately is no link. Either Mollie is not
 *                  configured at all, or this invoice is collected by direct
 *                  debit -- a button beside an active mandate invites paying
 *                  the same debt twice.
 *
 *   failed         Mollie is configured and could not produce a link. That is
 *                  not a mail to send quietly without a way to pay: the caller
 *                  reports it and leaves the invoice unsent.
 */
async function collectedByDirectDebit(invoice: Invoice): Promise<boolean> {
  if (!invoice.recurringServiceId) return false;
  const db = await adminDb();
  const { data } = await db
    .from("recurring_services")
    .select("status")
    .eq("id", invoice.recurringServiceId)
    .maybeSingle();
  return data ? isCollecting({ status: data.status as never }) : false;
}

export type PayLinkResult =
  | { kind: "link"; url: string }
  | { kind: "none"; reason: "not-configured" | "direct-debit" }
  | { kind: "failed"; reason: string };

export async function invoicePayLink(invoice: Invoice): Promise<PayLinkResult> {
  if (!isMollieConfigured()) return { kind: "none", reason: "not-configured" };
  if (await collectedByDirectDebit(invoice)) return { kind: "none", reason: "direct-debit" };

  try {
    const existing = await listPaymentsForInvoice(invoice.id);
    const db = await adminDb();

    const result = await ensureInvoiceCheckout(invoice, {
      existing,
      // The admin is signed in here, so this write goes through row level
      // security like every other admin write; the webhook has its own store.
      persist: async (payment: MolliePayment) => {
        const status = paymentStatusFromMollie(payment.status);
        const row = {
          invoice_id: invoice.id,
          customer_id: invoice.customer.customerId,
          amount_cents: centsFromMollie(payment.amount.value),
          currency: "EUR",
          status,
          source: "mollie",
          provider_payment_id: payment.id,
          method: payment.method ?? null,
          paid_at: status === "paid" ? (payment.paidAt ?? new Date().toISOString()) : null,
          description: payment.description,
        };

        const { data: found } = await db
          .from("payments")
          .select("id, status")
          .eq("source", "mollie")
          .eq("provider_payment_id", payment.id)
          .maybeSingle();

        if (!found) {
          const { error } = await db.from("payments").insert(row);
          // 23505 means the webhook got there first; its row is the good one.
          if (error && error.code !== "23505") throw new Error(error.message);
          return;
        }

        // Never walk a payment back from money-arrived.
        if (found.status === "paid") return;
        const { error } = await db.from("payments").update(row).eq("id", found.id);
        if (error) throw new Error(error.message);
        void paymentFromRow;
      },
    });

    return result.ok ? { kind: "link", url: result.checkoutUrl } : { kind: "failed", reason: result.reason };
  } catch (error) {
    // The provider's own message, never the key or the request.
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Could not create a payment link", { invoiceId: invoice.id, reason });
    return { kind: "failed", reason };
  }
}
