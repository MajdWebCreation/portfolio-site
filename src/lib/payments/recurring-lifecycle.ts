import type { SupabaseClient } from "@supabase/supabase-js";
import { runCancellations, type CancellationRunSummary } from "@/lib/payments/cancellation";
import { runPriceChanges, type PriceChangeRunSummary } from "@/lib/payments/price-change";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The daily lifecycle pass for monthly services: planned price changes and
 * planned ends, carried out on the days their rules name.
 *
 * Runs before the announcement pass on purpose. A price change reaches
 * Mollie here, on the announcement day of its first period; the announcement
 * pass then creates that period's invoice at the same figure. The order is
 * belt and braces -- the announcement pass also refuses to invoice a period
 * whose change has not reached Mollie -- but running first means the normal
 * day needs no second run.
 *
 * Everything here is idempotent: each step is a compare-and-swap on the
 * column it fills, and Mollie is read before it is written.
 */
export type LifecycleRunSummary = {
  priceChanges: PriceChangeRunSummary;
  cancellations: CancellationRunSummary;
};

export async function runRecurringLifecycle(
  db: SupabaseClient<Database>,
  todayKey: string,
  now: Date = new Date(),
): Promise<LifecycleRunSummary> {
  const priceChanges = await runPriceChanges(db, todayKey, now);
  const cancellations = await runCancellations(db, todayKey, now);
  return { priceChanges, cancellations };
}
