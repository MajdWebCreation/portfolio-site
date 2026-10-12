import type { SupabaseClient } from "@supabase/supabase-js";
import { paidUnprocessedReason, pendingReason, requestMandateActivation } from "@/lib/payments/mandate-activation";
import { needsDirectDebit } from "@/lib/portal/payments/model";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Whether a reminder also asks the customer to activate direct debit.
 *
 * A separate action from paying the invoice, with its own decision. Paying
 * an invoice settles that invoice and nothing else; a customer with a
 * monthly service who pays the reminder's invoice link and never activates
 * the collection would otherwise be chased for the invoice and lost for the
 * service. So a reminder carries the EUR 0.01 activation next to -- never
 * instead of -- the invoice's own button, whenever:
 *
 *   - a service of this customer still waits for direct debit, by the rule
 *     the portal uses (needsDirectDebit: awaiting a mandate, or active
 *     without a collection, and not ended), and
 *   - requestMandateActivation hands out a link: the open one when it can
 *     still be paid, a new one only when there is none. It refuses while
 *     Mollie reports a valid or a pending mandate, and while a paid
 *     activation waits to be processed.
 *
 * Those last two refusals mean the customer already did their part; the
 * reminder says so instead of asking again. Anything that fails here costs
 * the activation block, never the reminder.
 */
export type ReminderActivation = { kind: "offer"; url: string } | { kind: "awaiting_confirmation" } | { kind: "none" };

type Db = SupabaseClient<Database>;

export async function reminderActivation(db: Db, customerId: string, todayKey: string): Promise<ReminderActivation> {
  try {
    const { data, error } = await db.from("recurring_services").select("status, mollie_subscription_id, ends_on").eq("customer_id", customerId);
    if (error) throw new Error(`Diensten laden: ${error.message}`);

    const services = (data ?? []).map((row) => ({
      status: row.status as never,
      collectsByDirectDebit: Boolean(row.mollie_subscription_id),
      ...(row.ends_on ? { endsOn: row.ends_on } : {}),
    }));
    if (!needsDirectDebit(services, todayKey)) return { kind: "none" };

    const request = await requestMandateActivation(db, customerId);
    if (request.ok) return { kind: "offer", url: request.activation.checkoutUrl };
    if (request.reason === pendingReason || request.reason === paidUnprocessedReason) return { kind: "awaiting_confirmation" };
    return { kind: "none" };
  } catch (error) {
    console.error("Could not decide on a reminder activation", { customerId, reason: error instanceof Error ? error.message : "onbekende fout" });
    return { kind: "none" };
  }
}
