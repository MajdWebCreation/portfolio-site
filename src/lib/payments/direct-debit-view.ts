import { adminDb } from "@/lib/admin/db";
import { directDebitStatus, type DirectDebitStatus } from "@/lib/payments/direct-debit-status";
import { activationsForCustomer } from "@/lib/payments/mandate-activation";

/**
 * What the admin screens show about a customer's direct debit.
 *
 * Answered from our own cache of what Mollie last said, not from Mollie:
 * rendering a page must not depend on a provider being reachable. Every
 * decision that matters -- handing out a link, starting a collection -- asks
 * Mollie itself, and "Status controleren" refreshes this cache on demand.
 */
export type DirectDebitView = {
  status: DirectDebitStatus;
  /**
   * The payable activation link, while one is out. `mailedAt` only when the
   * activation mail for it was actually sent.
   */
  openLink?: { url: string; createdAt: string; mailedAt?: string };
  /** The latest activation that was paid, and what came of it. */
  lastPaid?: { paidAt: string; validatedAt?: string; checkedAt?: string };
};

export async function directDebitView(customerId: string): Promise<DirectDebitView> {
  const db = await adminDb();
  const [activations, provider] = await Promise.all([
    activationsForCustomer(db, customerId),
    db
      .from("customer_payment_providers")
      .select("provider_mandate_id")
      .eq("customer_id", customerId)
      .eq("provider", "mollie")
      .maybeSingle(),
  ]);
  if (provider.error) throw new Error(`Machtiging laden: ${provider.error.message}`);

  const open = activations.find((activation) => !activation.paidAt && !activation.archivedAt);
  const paid = activations.find((activation) => activation.paidAt);

  return {
    status: directDebitStatus({ activations, mandateOnRecord: Boolean(provider.data?.provider_mandate_id) }),
    ...(open
      ? {
          openLink: {
            url: open.checkoutUrl,
            createdAt: open.createdAt,
            ...(open.mailedAt ? { mailedAt: open.mailedAt } : {}),
          },
        }
      : {}),
    ...(paid
      ? {
          lastPaid: {
            paidAt: paid.paidAt!,
            ...(paid.validatedAt ? { validatedAt: paid.validatedAt } : {}),
            ...(paid.mandateCheckedAt ? { checkedAt: paid.mandateCheckedAt } : {}),
          },
        }
      : {}),
  };
}
