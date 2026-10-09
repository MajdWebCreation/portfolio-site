import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/admin/documents/validation";
import { createSubscription, listSubscriptions, type MollieSubscriptionStatus } from "@/lib/mollie/client";
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

/**
 * How long a claim protects a start in progress. Far past the longest an
 * admin request can run, so a live attempt is never overtaken; a claim older
 * than this belongs to a process that died, and may be taken over.
 */
export const claimStaleMs = 10 * 60 * 1000;

/** Subscription states that are a current subscription: one of these is never created twice. */
const currentStatuses: readonly MollieSubscriptionStatus[] = ["pending", "active", "suspended"];

const stateColumns =
  "id, customer_id, name, amount_cents, vat_rate, starts_on, status, mollie_subscription_id, subscription_claim_id, subscription_claimed_at";

export const alreadyCollectingReason = "Voor deze dienst loopt de incasso al.";
export const startInProgressReason =
  "De maandelijkse incasso voor deze dienst wordt op dit moment al gestart. Ververs de pagina over een paar minuten.";

async function readState(db: SupabaseClient<Database>, serviceId: string) {
  const { data, error } = await db.from("recurring_services").select(stateColumns).eq("id", serviceId).maybeSingle();
  if (error) throw new Error(`Dienst laden: ${error.message}`);
  return data;
}

/**
 * Creates the subscription at Mollie and records it on the service --
 * exactly once, whatever happens around it.
 *
 * Mollie's Idempotency-Key is kept for one hour, so it is the last line of
 * defence here, not the first. In order:
 *
 *   1. our own state, read fresh: a service with a subscription id is done;
 *      one claimed moments ago is being started by someone else right now;
 *   2. the mandate, asked of Mollie: nothing starts on our cached copy;
 *   3. the claim, a compare-and-swap on the row as it was read: of two
 *      simultaneous clicks exactly one gets here;
 *   4. Mollie's own list of this customer's subscriptions: one that carries
 *      this service's id is adopted, not created again -- which is what a
 *      retry finds when Mollie created it and our write of its id failed;
 *   5. only then `createSubscription`, with the Idempotency-Key besides;
 *   6. the id recorded under our claim, which clears it. On any failure the
 *      claim is released so a retry need not wait; if even that fails, it
 *      goes stale after `claimStaleMs`.
 */
export async function startCollection(
  db: SupabaseClient<Database>,
  service: Pick<RecurringService, "id">,
  todayKey: string,
  /**
   * A later first collection the admin chose. Only while nothing is billed
   * for the service yet -- after that the calendar is fixed by what was
   * billed -- and never sooner than the computed date.
   */
  requestedStart?: string,
  now: Date = new Date(),
): Promise<CollectionStart> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };

  // 1. Our own state, as it is now -- not the copy the caller loaded.
  const state = await readState(db, service.id);
  if (!state) return { ok: false, reason: "Deze dienst bestaat niet (meer)." };
  if (state.status === "canceled") return { ok: false, reason: "Deze dienst is gestopt." };
  if (state.mollie_subscription_id) return { ok: false, reason: alreadyCollectingReason };
  const claimedAt = state.subscription_claimed_at ? Date.parse(state.subscription_claimed_at) : undefined;
  if (claimedAt !== undefined && now.getTime() - claimedAt < claimStaleMs) {
    return { ok: false, reason: startInProgressReason };
  }

  // 2. The mandate, asked of Mollie.
  const mandate = await lookupMandate(db, state.customer_id);
  await recordMandate(db, state.customer_id, undefined, mandate);
  if (mandate.state !== "valid" || !mandate.providerCustomerId || !mandate.mandateId) {
    return { ok: false, reason: mandateReasons[mandate.state === "valid" ? "none" : mandate.state] };
  }

  const { data: billed, error: billedError } = await db
    .from("invoices")
    .select("billing_period_start")
    .eq("recurring_service_id", state.id);
  if (billedError) throw new Error(`Gefactureerde periodes laden: ${billedError.message}`);
  const billedPeriodStarts = (billed ?? []).flatMap((row) => (row.billing_period_start ? [row.billing_period_start] : []));

  const computed = firstCollectionDate({
    ...(state.starts_on ? { startsOn: state.starts_on } : {}),
    billedPeriodStarts,
    todayKey,
  });
  if (requestedStart && billedPeriodStarts.length > 0) {
    return { ok: false, reason: "Voor deze dienst is al een periode gefactureerd; de eerste incassodatum volgt daaruit." };
  }
  if (requestedStart && requestedStart < computed) {
    return { ok: false, reason: `De eerste incasso kan op zijn vroegst op ${computed}.` };
  }

  // 3. The claim: only while the row is exactly as read above.
  const claimId = randomUUID();
  const claim = db
    .from("recurring_services")
    .update({ subscription_claim_id: claimId, subscription_claimed_at: now.toISOString() })
    .eq("id", state.id)
    .is("mollie_subscription_id", null);
  const { data: claimed, error: claimError } = await (state.subscription_claim_id
    ? claim.eq("subscription_claim_id", state.subscription_claim_id)
    : claim.is("subscription_claim_id", null)
  )
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Dienst claimen: ${claimError.message}`);
  if (!claimed) {
    const after = await readState(db, state.id);
    return { ok: false, reason: after?.mollie_subscription_id ? alreadyCollectingReason : startInProgressReason };
  }

  try {
    const config = getMollieConfig();

    // 4. A subscription Mollie already has for this service is the answer.
    const existing = (await listSubscriptions(mandate.providerCustomerId, config)).find(
      (subscription) =>
        subscription.metadata?.recurringServiceId === state.id && currentStatuses.includes(subscription.status),
    );

    // 5. Otherwise, and only otherwise, a new one.
    const subscription =
      existing ??
      (await createSubscription({
        customerId: mandate.providerCustomerId,
        // The gross amount, matching the invoice each collection settles.
        amountCents: recurringChargeCents({ amountCents: state.amount_cents, vatRate: state.vat_rate }),
        interval: "1 month",
        description: state.name,
        webhookUrl: mollieWebhookUrl(config),
        mandateId: mandate.mandateId,
        startDate: requestedStart ?? computed,
        metadata: { kind: "recurring", recurringServiceId: state.id, customerId: state.customer_id },
        idempotencyKey: `recurring-${state.id}`,
        config,
      }));
    // An adopted subscription keeps the date Mollie actually holds.
    const firstDebitOn = existing?.startDate ?? requestedStart ?? computed;

    /*
      6. Recorded under our claim, which it clears. The anchor every later
      date is derived from: with nothing billed yet it becomes the first
      collection itself, so the announcement job and Mollie count from the
      same day; with periods already billed the anchor stays.
    */
    const { data: started, error } = await db
      .from("recurring_services")
      .update({
        mollie_subscription_id: subscription.id,
        status: "active",
        subscription_claim_id: null,
        subscription_claimed_at: null,
        ...(billedPeriodStarts.length === 0 || !state.starts_on ? { starts_on: firstDebitOn } : {}),
      })
      .eq("id", state.id)
      .eq("subscription_claim_id", claimId)
      .is("mollie_subscription_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Abonnement vastleggen: ${error.message}`);
    if (!started) throw new Error("Abonnement vastleggen: de dienst is tijdens het starten gewijzigd.");

    return { ok: true, firstDebitOn };
  } catch (error) {
    // Let a retry in straight away; it will find at Mollie whatever was made.
    const { error: releaseError } = await db
      .from("recurring_services")
      .update({ subscription_claim_id: null, subscription_claimed_at: null })
      .eq("id", state.id)
      .eq("subscription_claim_id", claimId);
    if (releaseError) console.error("Could not release a subscription claim", { serviceId: state.id, releaseError });
    throw error;
  }
}
