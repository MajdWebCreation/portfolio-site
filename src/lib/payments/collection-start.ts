import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/admin/documents/validation";
import { createSubscription } from "@/lib/mollie/client";
import { getMollieConfig, isMollieConfigured, mollieWebhookUrl } from "@/lib/mollie/config";
import { nextPeriodStart } from "@/lib/payments/billing-period";
import { recordMandate } from "@/lib/payments/mandate-activation";
import { earliestDebitDate } from "@/lib/payments/prenotification";
import { lookupMandate } from "@/lib/payments/provider-customer";
import { recurringChargeCents, type RecurringService } from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Starting the monthly collection for a service: the third and last step of
 * direct debit, after a mandate was obtained and Mollie confirmed it valid.
 *
 * Deliberately a step of its own, taken by the admin. A valid mandate says
 * the customer *may* be collected from; which service, from which date, is a
 * decision -- and the one moment the subscription is created at Mollie is the
 * moment someone made it.
 */

/**
 * The first automatic collection for a service.
 *
 * Three rules, in this order:
 *
 *   - after every period that is already billed: the month after the latest
 *     billed period, so a term that was invoiced or paid is never collected
 *     again;
 *   - otherwise the agreed start date, or -- without one -- the earliest
 *     possible day;
 *   - never sooner than the announcement term allows: fourteen days, counted
 *     from tomorrow, because the daily announcement job may already have run
 *     today. A date that is too close moves on by whole months, keeping the
 *     day of the month, and the months skipped are simply not billed.
 *
 * Nothing about the EUR 0.01 activation enters into it: that payment bought
 * a mandate, not a period.
 */
export function firstCollectionDate(input: {
  startsOn?: string;
  billedPeriodStarts: readonly string[];
  todayKey: string;
}): string {
  const earliest = earliestDebitDate(addDays(input.todayKey, 1));
  const anchor = input.startsOn ?? earliest;
  const anchorDay = Number(anchor.slice(8, 10));
  const latestBilled = [...input.billedPeriodStarts].sort().at(-1);

  let date = latestBilled ? nextPeriodStart(latestBilled, anchorDay) : anchor;
  // Monthly steps; the guard is a decade, far past any real case.
  for (let guard = 0; date < earliest && guard < 120; guard += 1) {
    date = nextPeriodStart(date, anchorDay);
  }
  return date;
}

export type CollectionStart = { ok: true; firstDebitOn: string } | { ok: false; reason: string };

const mandateReasons = {
  none: "Deze klant heeft nog geen machtiging. Stuur eerst een incasso-activatielink.",
  pending: "De machtiging is nog in behandeling bij Mollie. Start de incasso zodra die geldig is.",
  invalid: "De machtiging van deze klant is niet (meer) geldig. Stuur een nieuwe incasso-activatielink.",
} as const;

const recurringColumns = "id, customer_id";

/**
 * Creates the subscription at Mollie and records it on the service.
 *
 * The mandate is asked of Mollie right now; nothing is started on our cached
 * copy. Exactly once: the provider call carries an idempotency key derived
 * from the service, and the write only lands on a service that has no
 * subscription yet, so a second click finds the work done.
 */
export async function startCollection(
  db: SupabaseClient<Database>,
  service: RecurringService,
  todayKey: string,
  /**
   * A later first collection the admin chose. Only while nothing is billed
   * for the service yet -- after that the calendar is fixed by what was
   * billed -- and never sooner than the computed date.
   */
  requestedStart?: string,
): Promise<CollectionStart> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };
  if (service.status === "canceled") return { ok: false, reason: "Deze dienst is gestopt." };
  if (service.mollie.subscriptionId) return { ok: false, reason: "Voor deze dienst loopt de incasso al." };

  const mandate = await lookupMandate(db, service.customerId);
  await recordMandate(db, service.customerId, undefined, mandate);
  if (mandate.state !== "valid" || !mandate.providerCustomerId || !mandate.mandateId) {
    return { ok: false, reason: mandateReasons[mandate.state === "valid" ? "none" : mandate.state] };
  }

  const { data: billed, error: billedError } = await db
    .from("invoices")
    .select("billing_period_start")
    .eq("recurring_service_id", service.id);
  if (billedError) throw new Error(`Gefactureerde periodes laden: ${billedError.message}`);
  const billedPeriodStarts = (billed ?? []).flatMap((row) => (row.billing_period_start ? [row.billing_period_start] : []));

  const computed = firstCollectionDate({
    ...(service.startsOn ? { startsOn: service.startsOn } : {}),
    billedPeriodStarts,
    todayKey,
  });
  if (requestedStart && billedPeriodStarts.length > 0) {
    return { ok: false, reason: "Voor deze dienst is al een periode gefactureerd; de eerste incassodatum volgt daaruit." };
  }
  if (requestedStart && requestedStart < computed) {
    return { ok: false, reason: `De eerste incasso kan op zijn vroegst op ${computed}.` };
  }
  const firstDebitOn = requestedStart ?? computed;

  const config = getMollieConfig();
  const subscription = await createSubscription({
    customerId: mandate.providerCustomerId,
    // The gross amount, matching the invoice each collection settles.
    amountCents: recurringChargeCents(service),
    interval: "1 month",
    description: service.name,
    webhookUrl: mollieWebhookUrl(config),
    mandateId: mandate.mandateId,
    startDate: firstDebitOn,
    metadata: { kind: "recurring", recurringServiceId: service.id, customerId: service.customerId },
    idempotencyKey: `recurring-${service.id}`,
    config,
  });

  /*
    The anchor every later date is derived from. With nothing billed yet it
    becomes the first collection itself, so the announcement job and Mollie
    count from the same day; with periods already billed the anchor stays,
    because the first collection was derived from it.
  */
  const { data: started, error } = await db
    .from("recurring_services")
    .update({
      mollie_subscription_id: subscription.id,
      status: "active",
      ...(billedPeriodStarts.length === 0 || !service.startsOn ? { starts_on: firstDebitOn } : {}),
    })
    .eq("id", service.id)
    .is("mollie_subscription_id", null)
    .select(recurringColumns)
    .maybeSingle();
  if (error) throw new Error(`Abonnement vastleggen: ${error.message}`);
  if (!started) return { ok: false, reason: "Voor deze dienst loopt de incasso al." };

  return { ok: true, firstDebitOn };
}
