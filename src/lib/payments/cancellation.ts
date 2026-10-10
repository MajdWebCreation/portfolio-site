import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelPayment,
  cancelSubscription,
  centsFromMollie,
  getSubscription,
  isCurrentSubscription,
  listSubscriptionPayments,
  updateSubscriptionAmount,
  type MolliePayment,
} from "@/lib/mollie/client";
import { getMollieConfig, isMollieConfigured } from "@/lib/mollie/config";
import { periodForCharge } from "@/lib/payments/billing-period";
import {
  cancellationPlan,
  isProviderCancelDue,
  type CancellationPlan,
} from "@/lib/payments/cancellation-plan";
import { listPriceChangesForService, providerCustomerId } from "@/lib/payments/price-change";
import { amountForPeriod, grossOf, lastTermOf, proratedNetCents } from "@/lib/payments/pricing";
import {
  describeUnknownPayments,
  isOpenPayment,
  paymentForPeriod,
  paymentsAfter,
  unknownPayments,
  unknownPeriodMarker,
  type PlacedPayment,
} from "@/lib/payments/subscription-payments";
import { recurringLifecycle } from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

export {
  cancellationOptions,
  cancellationPlan,
  contractualLastDay,
  isProviderCancelDue,
  type CancellationInput,
  type CancellationPlan,
} from "@/lib/payments/cancellation-plan";

/**
 * Ending a monthly service.
 *
 * The general terms (art. 25.1, A4.2) give a continuing hosting or
 * management service one month's notice, and nothing more: the fee stays
 * due while the service runs, and "na daadwerkelijke beëindiging stopt het
 * maandbedrag" (A4.3). So the service ends exactly one month after the
 * request -- the last day of service is the day before -- whatever the
 * billing calendar says. The billing period that day falls in is delivered
 * in part, and is billed and collected pro rata by days. Rounding the end up
 * to the period's end would add up to a month the terms do not provide for,
 * so it is never done on the system's own authority: a different end needs
 * an agreement with the customer, and the admin says so when choosing one.
 *
 * Mollie has no cancel-at date, and the last legitimate collection may still
 * be weeks ahead, so the subscription is cancelled by the daily job on the
 * day after that collection. Before anything is changed at Mollie, the
 * subscription's payments are listed and read: Mollie documents no lead time
 * for creating a subscription payment, so nothing here assumes one does not
 * exist yet -- and a payment is placed on the calendar by its due date alone,
 * never by the day it was created. A payment past the end that Mollie has already created is
 * cancelled only when Mollie itself marks it cancelable; otherwise it is a
 * problem an admin sees. Only this one subscription is touched: the mandate,
 * the Mollie customer and the customer's other services are not -- Mollie
 * documents that cancelling a subscription "has no effect on the mandates".
 */
// --------------------------------------------------------------- database

type Db = SupabaseClient<Database>;

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

const serviceColumns =
  "id, customer_id, name, amount_cents, vat_rate, starts_on, status, ends_on, cancellation_requested_at, last_term_amount_cents, last_term_synced_at, lifecycle_problem, mollie_subscription_id, subscription_canceled_at";

async function readService(db: Db, serviceId: string) {
  const { data, error } = await db.from("recurring_services").select(serviceColumns).eq("id", serviceId).maybeSingle();
  fail("Dienst laden", error);
  return data;
}

type ServiceState = NonNullable<Awaited<ReturnType<typeof readService>>>;

async function billedPeriodStarts(db: Db, serviceId: string): Promise<string[]> {
  const { data, error } = await db.from("invoices").select("billing_period_start").eq("recurring_service_id", serviceId);
  fail("Gefactureerde periodes laden", error);
  return (data ?? []).flatMap((row) => (row.billing_period_start ? [row.billing_period_start] : []));
}

async function planFor(db: Db, state: ServiceState, todayKey: string, requestedEndsOn?: string) {
  return cancellationPlan({
    startsOn: state.starts_on!,
    amountCents: state.amount_cents,
    vatRate: state.vat_rate,
    priceChanges: await listPriceChangesForService(db, state.id),
    billedPeriodStarts: await billedPeriodStarts(db, state.id),
    todayKey,
    ...(requestedEndsOn ? { requestedEndsOn } : {}),
  });
}

export type CancellationRequest = {
  /** A last day other than the contractual one. */
  endsOn?: string;
  /** Required for any end other than the contractual one: the customer agreed to it. */
  agreedDeviation?: boolean;
};

export type CancellationResult =
  | {
      ok: true;
      plan: CancellationPlan;
      reused: boolean;
      /** The subscription was cancelled at Mollie right away. */
      providerCanceledNow: boolean;
      /** Mollie was checked and, if needed, patched for the pro-rata last term. */
      lastTermSynced: boolean;
      lapsedPriceChanges: number;
    }
  | { ok: false; reason: string };

export const notCollectingReason = "Alleen een dienst waarvan de maandelijkse incasso loopt kan worden opgezegd.";
export const alreadyEndedReason = "Deze dienst is al beëindigd.";
export const deviationReason =
  "Deze einddatum wijkt af van de opzegtermijn van één maand uit de voorwaarden. Bevestig dat dit zo met de klant is afgesproken.";

/**
 * Plans the end of one service. Writes the dates on the service row as a
 * compare-and-swap against "nothing planned yet", so a second click finds
 * the plan already there and returns it. A price change that would only
 * have started after the end, or in the partial last period before Mollie
 * was told of it, lapses with it. Mollie is then checked for the last term
 * straight away (see `syncLastTerm`), and the subscription is cancelled at
 * once when nothing legitimate is left to collect.
 */
export async function requestCancellation(
  db: Db,
  serviceId: string,
  request: CancellationRequest,
  todayKey: string,
  requestedBy?: string,
  now: Date = new Date(),
): Promise<CancellationResult> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };

  const state = await readService(db, serviceId);
  if (!state) return { ok: false, reason: "Deze dienst bestaat niet (meer)." };
  const lifecycle = recurringLifecycle({ status: state.status as never, ...(state.ends_on ? { endsOn: state.ends_on } : {}) }, todayKey);
  if (lifecycle === "ended") return { ok: false, reason: alreadyEndedReason };
  if (lifecycle === "other" || !state.mollie_subscription_id || !state.starts_on) return { ok: false, reason: notCollectingReason };

  if (state.ends_on) {
    // Already planned: the same answer again, nothing written.
    const existing = await planFor(db, state, state.cancellation_requested_at?.slice(0, 10) ?? todayKey, state.ends_on);
    if ("error" in existing) return { ok: false, reason: existing.error };
    return { ok: true, plan: existing, reused: true, providerCanceledNow: false, lastTermSynced: Boolean(state.last_term_synced_at), lapsedPriceChanges: 0 };
  }

  const plan = await planFor(db, state, todayKey, request.endsOn);
  if ("error" in plan) return { ok: false, reason: plan.error };
  if (plan.deviates && !request.agreedDeviation) return { ok: false, reason: deviationReason };

  const { data: planned, error } = await db
    .from("recurring_services")
    .update({
      cancellation_requested_at: now.toISOString(),
      cancellation_requested_by: requestedBy ?? null,
      ends_on: plan.endsOn,
    })
    .eq("id", state.id)
    .eq("status", "active")
    .is("ends_on", null)
    .select("id")
    .maybeSingle();
  fail("Opzegging vastleggen", error);

  if (!planned) {
    // Someone else planned it a moment ago; theirs stands.
    const after = await readService(db, serviceId);
    if (after?.ends_on && after.starts_on) {
      const theirs = await planFor(db, after, todayKey, after.ends_on);
      if (!("error" in theirs)) {
        return { ok: true, plan: theirs, reused: true, providerCanceledNow: false, lastTermSynced: Boolean(after.last_term_synced_at), lapsedPriceChanges: 0 };
      }
    }
    return { ok: false, reason: "De dienst is intussen gewijzigd. Ververs de pagina." };
  }

  const lapsedPriceChanges = await lapsePriceChanges(db, state.id, plan, now);

  // Mollie now, not tomorrow: the sooner the last term's amount is settled
  // there, the less chance Mollie creates that payment at the full amount.
  let lastTermSynced = false;
  try {
    lastTermSynced = (await syncLastTerm(db, state.id, now)).synced;
  } catch (syncError) {
    console.error("Could not settle the last term with Mollie; the daily job will retry", { serviceId, syncError });
  }

  // When nothing legitimate is left to collect, Mollie need not wait for the job.
  const settled = await settleCancellation(db, state.id, todayKey, now);

  return { ok: true, plan, reused: false, providerCanceledNow: settled.providerCanceled, lastTermSynced, lapsedPriceChanges };
}

/**
 * Pending changes that can no longer apply: one starting after the last
 * day, and one starting in the partial last period that Mollie has not been
 * told of -- that period is billed pro rata at the price in effect before
 * it, so the two cannot both be patched into one subscription amount.
 */
async function lapsePriceChanges(db: Db, serviceId: string, plan: CancellationPlan, now: Date): Promise<number> {
  const pending = (await listPriceChangesForService(db, serviceId)).filter((change) => !change.appliedAt && !change.canceledAt);
  let lapsed = 0;
  for (const change of pending) {
    const afterEnd = change.effectiveFrom > plan.endsOn;
    const inPartialLastTerm = plan.lastTerm.partial && change.effectiveFrom >= plan.lastTerm.period.start && !change.providerUpdatedAt;
    if (!afterEnd && !inPartialLastTerm) continue;
    const { data, error } = await db
      .from("recurring_price_changes")
      .update({ canceled_at: now.toISOString(), canceled_reason: "service_ended" })
      .eq("id", change.id)
      .is("applied_at", null)
      .is("canceled_at", null)
      .select("id")
      .maybeSingle();
    fail("Vervallen prijswijziging vastleggen", error);
    if (data) lapsed += 1;
  }
  return lapsed;
}

// --------------------------------------------------------- the last term

export type LastTermSync = { synced: boolean; amountCents?: number; patched: boolean; collectsFull: boolean; problem?: string };

/**
 * Settles with Mollie what the partial last period collects, exactly once.
 *
 * Mollie's payments for the subscription are listed. When the last period's
 * payment does not exist yet, the subscription's amount is set to the
 * pro-rata gross -- the only payment still to come is that one, and the
 * subscription is cancelled after it -- and the pro-rata amount is fixed on
 * the service. When Mollie has already created it, it is collected as it
 * is, the amount Mollie holds is fixed on the service so the invoice says
 * the same, and the days not delivered are owed back as a credit the admin
 * sees. A period that is not partial needs nothing here.
 */
export async function syncLastTerm(db: Db, serviceId: string, now: Date = new Date()): Promise<LastTermSync> {
  const state = await readService(db, serviceId);
  if (!state?.ends_on || !state.starts_on || !state.mollie_subscription_id) return { synced: false, patched: false, collectsFull: false };
  if (state.last_term_synced_at) {
    return { synced: true, amountCents: state.last_term_amount_cents ?? undefined, patched: false, collectsFull: false };
  }

  const lastPeriod = periodForCharge(state.starts_on, state.ends_on);
  const term = lastTermOf(lastPeriod, state.ends_on);
  if (!term.partial) return { synced: false, patched: false, collectsFull: false };

  const changes = await listPriceChangesForService(db, state.id);
  const fullNet = amountForPeriod({ amountCents: state.amount_cents }, changes, lastPeriod.start);
  const proratedNet = proratedNetCents(fullNet, term);

  const providerId = await providerCustomerId(db, state.customer_id);
  if (!providerId) throw new Error("De klant heeft geen Mollie-klantprofiel.");
  const config = getMollieConfig();
  const payments = await listSubscriptionPayments(providerId, state.mollie_subscription_id, config);
  /*
    A live payment without a due date may be the last period's payment, or
    not; the amount for that period cannot be settled until it is known. The
    invoice for it waits (the announcement pass holds it), and the admin sees
    why. Tried again every day: the payment reaches a final state at some
    point, or the admin clears it up in Mollie.
  */
  const unknown = unknownPayments(payments);
  if (unknown.length > 0) {
    const problem = describeUnknownPayments(unknown);
    if (state.lifecycle_problem !== problem) await setProblem(db, state.id, problem);
    return { synced: false, patched: false, collectsFull: false, problem };
  }
  const existing = paymentForPeriod(state.starts_on, payments, lastPeriod.start);
  const billed = (await billedPeriodStarts(db, state.id)).includes(lastPeriod.start);

  let amountCents: number;
  let patched = false;
  if (billed && !existing) {
    // Invoiced and announced in full before the cancellation: collected as
    // announced, and the days not delivered are credited by hand.
    amountCents = fullNet;
  } else if (existing) {
    // Created already: collected as it stands. The net behind the gross
    // Mollie holds, so the invoice says the same figure.
    const held = centsFromMollie(existing.payment.amount.value);
    amountCents = held === grossOf(proratedNet, state.vat_rate) ? proratedNet : held === grossOf(fullNet, state.vat_rate) ? fullNet : -1;
    if (amountCents < 0) {
      await setProblem(db, state.id, `Mollie heeft de incasso van ${existing.chargeDate} aangemaakt voor EUR ${existing.payment.amount.value}, een bedrag dat bij geen termijn past.`);
      return { synced: false, patched: false, collectsFull: false };
    }
  } else {
    const subscription = await getSubscription(providerId, state.mollie_subscription_id, config);
    if (!isCurrentSubscription(subscription)) {
      // Nothing will be collected for the last period; nothing to patch.
      amountCents = proratedNet;
    } else {
      const wanted = grossOf(proratedNet, state.vat_rate);
      if (!subscription.amount || centsFromMollie(subscription.amount.value) !== wanted) {
        await updateSubscriptionAmount({ customerId: providerId, subscriptionId: state.mollie_subscription_id, amountCents: wanted, config });
        patched = true;
      }
      amountCents = proratedNet;
    }
  }

  const { data, error } = await db
    .from("recurring_services")
    .update({
      last_term_amount_cents: amountCents,
      last_term_synced_at: now.toISOString(),
      // An unknown-period problem this sync wrote earlier is over now.
      ...(state.lifecycle_problem?.startsWith(unknownPeriodMarker) ? { lifecycle_problem: null } : {}),
    })
    .eq("id", state.id)
    .is("last_term_synced_at", null)
    .select("id")
    .maybeSingle();
  fail("Laatste termijn vastleggen", error);
  return { synced: Boolean(data), amountCents, patched, collectsFull: amountCents === fullNet && term.partial };
}

async function setProblem(db: Db, serviceId: string, problem: string | null): Promise<void> {
  const { error } = await db.from("recurring_services").update({ lifecycle_problem: problem }).eq("id", serviceId);
  fail("Probleem vastleggen", error);
}

// --------------------------------------------------------------- withdraw

export type WithdrawCancellationResult = { ok: true } | { ok: false; reason: string };

/**
 * Takes a planned end back, while that is still a matter of our own dates:
 * before the end has passed and before the subscription at Mollie was
 * cancelled. If Mollie was given the pro-rata amount for the last term, it
 * is given the full amount back first -- unless Mollie already created that
 * payment at the pro-rata amount, in which case the end stands. A price
 * change that lapsed with the cancellation stays lapsed; it can be planned
 * again.
 */
export async function withdrawCancellation(db: Db, serviceId: string, todayKey: string): Promise<WithdrawCancellationResult> {
  const state = await readService(db, serviceId);
  if (!state) return { ok: false, reason: "Deze dienst bestaat niet (meer)." };
  if (!state.ends_on) return { ok: true };
  if (state.subscription_canceled_at) {
    return { ok: false, reason: "Het abonnement bij Mollie is al geannuleerd. Een vervolg vraagt een nieuwe dienst met een nieuwe incassostart." };
  }
  if (state.ends_on < todayKey || state.status !== "active") return { ok: false, reason: alreadyEndedReason };

  if (state.last_term_synced_at && state.starts_on && state.mollie_subscription_id) {
    const lastPeriod = periodForCharge(state.starts_on, state.ends_on);
    const fullNet = amountForPeriod({ amountCents: state.amount_cents }, await listPriceChangesForService(db, state.id), lastPeriod.start);
    if (state.last_term_amount_cents !== fullNet) {
      const providerId = await providerCustomerId(db, state.customer_id);
      if (!providerId) return { ok: false, reason: "De klant heeft geen Mollie-klantprofiel." };
      const config = getMollieConfig();
      const payments = await listSubscriptionPayments(providerId, state.mollie_subscription_id, config);
      if (unknownPayments(payments).length > 0) {
        return { ok: false, reason: describeUnknownPayments(unknownPayments(payments)) };
      }
      if (paymentForPeriod(state.starts_on, payments, lastPeriod.start)) {
        return {
          ok: false,
          reason: `Mollie heeft de incasso van ${lastPeriod.start} al aangemaakt voor het pro-rata bedrag van de laatste termijn; de opzegging kan niet meer worden ingetrokken.`,
        };
      }
      await updateSubscriptionAmount({
        customerId: providerId,
        subscriptionId: state.mollie_subscription_id,
        amountCents: grossOf(fullNet, state.vat_rate),
        config,
      });
    }
  }

  const { data, error } = await db
    .from("recurring_services")
    .update({
      cancellation_requested_at: null,
      cancellation_requested_by: null,
      ends_on: null,
      last_term_amount_cents: null,
      last_term_synced_at: null,
      lifecycle_problem: null,
    })
    .eq("id", serviceId)
    .eq("status", "active")
    .eq("ends_on", state.ends_on)
    .is("subscription_canceled_at", null)
    .select("id")
    .maybeSingle();
  fail("Opzegging intrekken", error);
  return data ? { ok: true } : { ok: false, reason: "De dienst is intussen gewijzigd. Ververs de pagina." };
}

// --------------------------------------------------------------- daily job

export type SettleResult = {
  /** The subscription at Mollie was cancelled, or found cancelled, in this call. */
  providerCanceled: boolean;
  /** The service's status was set to canceled in this call. */
  ended: boolean;
  /** Payments past the end that Mollie had created and let us cancel. */
  paymentsCanceled: number;
  /** Why nothing happened at Mollie, when nothing did. */
  waiting?: "not_due" | "already" | "no_subscription";
  /** Something an admin has to look at; also written on the service. */
  problem?: string;
};

/**
 * Carries out one planned end, as far as its dates allow today. Idempotent:
 * a subscription Mollie already reports as cancelled is recorded, not
 * cancelled again; every write is a compare-and-swap.
 *
 * Before the subscription is cancelled, its payments are listed. A live
 * payment for a period after the last day is one Mollie created ahead; it
 * is cancelled when Mollie marks it cancelable, and otherwise written down
 * as a problem -- the subscription is still cancelled, so nothing further
 * is created, but that payment is money about to move that nobody
 * announced, and the admin has to deal with it by hand.
 */
export async function settleCancellation(db: Db, serviceId: string, todayKey: string, now: Date = new Date()): Promise<SettleResult> {
  const state = await readService(db, serviceId);
  if (!state?.ends_on || !state.starts_on) return { providerCanceled: false, ended: false, paymentsCanceled: 0, waiting: "no_subscription" };

  let providerCanceled = false;
  let paymentsCanceled = 0;
  let problem: string | undefined;
  let waiting: SettleResult["waiting"];

  if (!state.mollie_subscription_id) {
    waiting = "no_subscription";
  } else if (state.subscription_canceled_at) {
    waiting = "already";
  } else if (!isProviderCancelDue({ startsOn: state.starts_on, endsOn: state.ends_on }, todayKey)) {
    waiting = "not_due";
  } else {
    const providerId = await providerCustomerId(db, state.customer_id);
    if (!providerId) throw new Error("De klant heeft geen Mollie-klantprofiel; het abonnement kan niet worden geannuleerd.");
    const config = getMollieConfig();

    // 1. What Mollie already created past the end, and what it lets us do about it.
    const payments = await listSubscriptionPayments(providerId, state.mollie_subscription_id, config);
    const unknown = unknownPayments(payments);
    if (unknown.length > 0) {
      /*
        A payment whose period cannot be known may be one past the end, which
        a cancelled subscription would leave to collect unseen. Nothing is
        cancelled until it is known; the admin sees it, and tomorrow's run
        looks again.
      */
      problem = describeUnknownPayments(unknown);
      if (problem !== (state.lifecycle_problem ?? null)) await setProblem(db, state.id, problem);
      return { providerCanceled: false, ended: false, paymentsCanceled: 0, problem };
    }
    const forbidden = paymentsAfter(state.starts_on, payments, state.ends_on);
    const unresolved: string[] = [];
    for (const placed of forbidden) {
      const outcome = await cancelForbiddenPayment(placed, config);
      if (outcome.canceled) paymentsCanceled += 1;
      else unresolved.push(outcome.reason);
    }

    // 2. The subscription itself, so nothing further is created.
    const current = await getSubscription(providerId, state.mollie_subscription_id, config);
    const canceled = isCurrentSubscription(current)
      ? await cancelSubscription(providerId, state.mollie_subscription_id, config)
      : current;

    const { data, error } = await db
      .from("recurring_services")
      .update({ subscription_canceled_at: canceled.canceledAt ?? now.toISOString() })
      .eq("id", state.id)
      .is("subscription_canceled_at", null)
      .select("id")
      .maybeSingle();
    fail("Geannuleerd abonnement vastleggen", error);
    providerCanceled = Boolean(data);

    problem = unresolved.length > 0 ? unresolved.join(" ") : undefined;
    if ((problem ?? null) !== (state.lifecycle_problem ?? null)) await setProblem(db, state.id, problem ?? null);
  }

  let ended = false;
  if (state.ends_on < todayKey && state.status !== "canceled" && (providerCanceled || waiting === "already" || waiting === "no_subscription")) {
    const { data, error } = await db
      .from("recurring_services")
      .update({ status: "canceled" })
      .eq("id", state.id)
      .neq("status", "canceled")
      .select("id")
      .maybeSingle();
    fail("Beëindigde dienst vastleggen", error);
    ended = Boolean(data);
  }

  return { providerCanceled, ended, paymentsCanceled, ...(waiting ? { waiting } : {}), ...(problem ? { problem } : {}) };
}

/**
 * One payment Mollie created for a period after the last day. Cancelled
 * only on Mollie's own say-so -- `isCancelable: true` -- and only while it
 * is still open; a paid one is money that moved and can only be refunded by
 * hand. The cancel-payment reference answers 422 once a payment "can no
 * longer be canceled", and that too ends as a problem rather than a retry.
 */
async function cancelForbiddenPayment(
  placed: PlacedPayment,
  config: ReturnType<typeof getMollieConfig>,
): Promise<{ canceled: true } | { canceled: false; reason: string }> {
  const { payment, chargeDate } = placed;
  const describe = `Mollie heeft al een incasso aangemaakt voor ${chargeDate} (EUR ${payment.amount.value}, ${payment.id}), na de einddatum`;
  if (!isOpenPayment(payment)) {
    return { canceled: false, reason: `${describe}; die is ${payment.status} en moet handmatig worden terugbetaald.` };
  }
  if (payment.isCancelable !== true) {
    return { canceled: false, reason: `${describe}; Mollie laat die niet meer annuleren. Handmatig afhandelen (terugbetalen).` };
  }
  let result: MolliePayment;
  try {
    result = await cancelPayment(payment.id, config);
  } catch (error) {
    return { canceled: false, reason: `${describe}; annuleren mislukte: ${error instanceof Error ? error.message : "onbekende fout"}.` };
  }
  if (result.status !== "canceled") {
    return { canceled: false, reason: `${describe}; Mollie meldt na annuleren status ${result.status}.` };
  }
  return { canceled: true };
}

export type CancellationRunSummary = {
  considered: number;
  lastTermsSynced: number;
  providerCanceled: number;
  paymentsCanceled: number;
  ended: number;
  problems: { serviceId: string; reason: string }[];
};

/** Every planned end that is not finished yet, each in its own try/catch. */
export async function runCancellations(db: Db, todayKey: string, now: Date = new Date()): Promise<CancellationRunSummary> {
  const summary: CancellationRunSummary = { considered: 0, lastTermsSynced: 0, providerCanceled: 0, paymentsCanceled: 0, ended: 0, problems: [] };

  const { data, error } = await db
    .from("recurring_services")
    .select("id, status, subscription_canceled_at, last_term_synced_at")
    .not("ends_on", "is", null);
  fail("Opgezegde diensten laden", error);

  for (const row of data ?? []) {
    if (row.status === "canceled" && row.subscription_canceled_at) continue;
    summary.considered += 1;
    try {
      if (!row.last_term_synced_at) {
        const sync = await syncLastTerm(db, row.id, now);
        if (sync.synced) summary.lastTermsSynced += 1;
        if (sync.problem) summary.problems.push({ serviceId: row.id, reason: sync.problem });
      }
      const result = await settleCancellation(db, row.id, todayKey, now);
      if (result.providerCanceled) summary.providerCanceled += 1;
      summary.paymentsCanceled += result.paymentsCanceled;
      if (result.ended) summary.ended += 1;
      if (result.problem) summary.problems.push({ serviceId: row.id, reason: result.problem });
    } catch (error) {
      summary.problems.push({ serviceId: row.id, reason: error instanceof Error ? error.message : "onbekende fout" });
    }
  }

  return summary;
}
