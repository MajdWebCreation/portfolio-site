import type { SupabaseClient } from "@supabase/supabase-js";
import { isDateKey } from "@/lib/admin/format";
import {
  centsFromMollie,
  getSubscription,
  isCurrentSubscription,
  listSubscriptionPayments,
  updateSubscriptionAmount,
  type MollieSubscription,
} from "@/lib/mollie/client";
import { getMollieConfig, isMollieConfigured } from "@/lib/mollie/config";
import { nextPeriodStart } from "@/lib/payments/billing-period";
import { priceChangeFromRow, type PriceChangeRow } from "@/lib/payments/mapper";
import {
  amountForPeriod,
  grossOf,
  isLocalApplyDue,
  isProviderUpdateDue,
  pendingPriceChange,
  priceChangeOptions,
} from "@/lib/payments/pricing";
import { describeUnknownPayments, paymentForPeriod, unknownPayments } from "@/lib/payments/subscription-payments";
import { recurringLifecycle, type PriceChange } from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Changing what a collecting service costs per month.
 *
 * Three records have to keep saying the same thing: the term invoice for a
 * period, what Mollie collects for it, and what the admin sees. So a change
 * is never written to one of them on its own. It is planned here as a row
 * with an effective date on the service's calendar, and the daily job
 * carries it out in two steps on two days:
 *
 *   announcement day   fourteen days before the first collection at the
 *                      new amount, before the invoice for that period
 *                      exists: Mollie's payments for the subscription are
 *                      listed, and only when Mollie has *not* yet created
 *                      that period's payment is its `amount` updated. Mollie
 *                      documents no lead time for creating a subscription
 *                      payment, so this is looked up, never assumed. If the
 *                      payment already exists at the old amount, that period
 *                      keeps the old amount everywhere and the change moves
 *                      on to the next period that has no payment yet -- or,
 *                      when none is possible before the service ends, it is
 *                      blocked and applies to no period until an admin
 *                      decides;
 *   effective date     `amount_cents` on the service is switched over, so
 *                      that column keeps meaning the price in effect today.
 *
 * Every write is a compare-and-swap on the column it fills, and the unique
 * index allows one change in flight per service, so two clicks, two cron
 * runs or a retry after a half-finished day all end in one change carried
 * out once.
 */
type Db = SupabaseClient<Database>;

export const priceChangeColumns =
  "id, recurring_service_id, customer_id, old_amount_cents, new_amount_cents, currency, effective_from, requested_at, requested_by, provider_updated_at, applied_at, canceled_at, canceled_reason, rescheduled_from, reschedule_reason, blocked_at, blocked_reason, created_at, updated_at";

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function listPriceChangesForService(db: Db, serviceId: string): Promise<PriceChange[]> {
  const { data, error } = await db
    .from("recurring_price_changes")
    .select(priceChangeColumns)
    .eq("recurring_service_id", serviceId)
    .order("effective_from", { ascending: true });
  fail("Prijswijzigingen laden", error);
  return ((data ?? []) as PriceChangeRow[]).map(priceChangeFromRow);
}

export async function listPriceChangesForCustomer(db: Db, customerId: string): Promise<PriceChange[]> {
  const { data, error } = await db
    .from("recurring_price_changes")
    .select(priceChangeColumns)
    .eq("customer_id", customerId)
    .order("effective_from", { ascending: true });
  fail("Prijswijzigingen laden", error);
  return ((data ?? []) as PriceChangeRow[]).map(priceChangeFromRow);
}

export async function listPriceChangesForServices(db: Db, serviceIds: readonly string[]): Promise<PriceChange[]> {
  if (serviceIds.length === 0) return [];
  const { data, error } = await db
    .from("recurring_price_changes")
    .select(priceChangeColumns)
    .in("recurring_service_id", [...serviceIds])
    .order("effective_from", { ascending: true });
  fail("Prijswijzigingen laden", error);
  return ((data ?? []) as PriceChangeRow[]).map(priceChangeFromRow);
}

const serviceColumns =
  "id, customer_id, name, amount_cents, vat_rate, starts_on, status, ends_on, mollie_subscription_id, subscription_canceled_at";

async function readService(db: Db, serviceId: string) {
  const { data, error } = await db.from("recurring_services").select(serviceColumns).eq("id", serviceId).maybeSingle();
  fail("Dienst laden", error);
  return data;
}

async function billedPeriodStarts(db: Db, serviceId: string): Promise<string[]> {
  const { data, error } = await db.from("invoices").select("billing_period_start").eq("recurring_service_id", serviceId);
  fail("Gefactureerde periodes laden", error);
  return (data ?? []).flatMap((row) => (row.billing_period_start ? [row.billing_period_start] : []));
}

/** The Mollie customer a service's subscription hangs under. */
export async function providerCustomerId(db: Db, customerId: string): Promise<string | undefined> {
  const { data, error } = await db
    .from("customer_payment_providers")
    .select("provider_customer_id")
    .eq("customer_id", customerId)
    .eq("provider", "mollie")
    .maybeSingle();
  fail("Providerkoppeling laden", error);
  return data?.provider_customer_id;
}

// ------------------------------------------------------------------ plan

export type PriceChangeRequest = { newAmountCents: number; effectiveFrom: string };

export type PriceChangeResult =
  | { ok: true; change: PriceChange; reused: boolean; oldGrossCents: number; newGrossCents: number }
  | { ok: false; reason: string };

export const notCollectingReason = "Alleen voor een dienst waarvan de maandelijkse incasso loopt. Pas het bedrag anders gewoon aan.";
export const alreadyPlannedReason = "Er staat al een prijswijziging gepland voor deze dienst. Trek die eerst in.";
export const subscriptionOverReason =
  "Het abonnement bij Mollie is geannuleerd of afgelopen; het maandbedrag kan niet meer worden gewijzigd.";

/**
 * Plans a change. Writes one row and nothing else: Mollie is not touched
 * until the announcement day, by the daily job.
 *
 * Refused when the service does not collect, when the subscription at Mollie
 * is already over (asked of Mollie, not of our cache), when the date is not
 * a period start the new price can still be announced for, when it lies
 * past the service's planned end, or when the amount does not change. A
 * second identical request while the first is pending is the first one.
 */
export async function schedulePriceChange(
  db: Db,
  serviceId: string,
  request: PriceChangeRequest,
  todayKey: string,
  requestedBy?: string,
): Promise<PriceChangeResult> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };
  if (!Number.isSafeInteger(request.newAmountCents) || request.newAmountCents <= 0) {
    return { ok: false, reason: "Vul een bedrag hoger dan nul in." };
  }
  if (!isDateKey(request.effectiveFrom)) return { ok: false, reason: "De ingangsdatum is geen geldige datum." };

  const state = await readService(db, serviceId);
  if (!state) return { ok: false, reason: "Deze dienst bestaat niet (meer)." };
  const lifecycle = recurringLifecycle({ status: state.status as never, ...(state.ends_on ? { endsOn: state.ends_on } : {}) }, todayKey);
  if (lifecycle === "ended") return { ok: false, reason: "Deze dienst is beëindigd." };
  if (lifecycle !== "active" && lifecycle !== "cancellation_scheduled") return { ok: false, reason: notCollectingReason };
  if (!state.mollie_subscription_id || !state.starts_on) return { ok: false, reason: notCollectingReason };

  const changes = await listPriceChangesForService(db, serviceId);
  const pending = pendingPriceChange(changes);
  if (pending) {
    const same = pending.newAmountCents === request.newAmountCents && pending.effectiveFrom === request.effectiveFrom;
    return same ? reused(pending, state.vat_rate) : { ok: false, reason: alreadyPlannedReason };
  }

  const billed = await billedPeriodStarts(db, serviceId);
  const options = priceChangeOptions({
    startsOn: state.starts_on,
    ...(state.ends_on ? { endsOn: state.ends_on } : {}),
    billedPeriodStarts: billed,
    todayKey,
  }, 120);
  if (options.length === 0) {
    return { ok: false, reason: "De dienst eindigt voordat een nieuwe prijs nog kan ingaan." };
  }
  if (!options.some((option) => option.effectiveFrom === request.effectiveFrom)) {
    return {
      ok: false,
      reason: `De ingangsdatum moet het begin van een nog niet gefactureerde periode zijn, op zijn vroegst ${options[0]!.effectiveFrom}.`,
    };
  }

  const oldAmountCents = amountForPeriod({ amountCents: state.amount_cents }, changes, request.effectiveFrom);
  if (oldAmountCents === request.newAmountCents) {
    return { ok: false, reason: "Het nieuwe bedrag is gelijk aan het huidige bedrag." };
  }

  // Asked of Mollie: a subscription that is over cannot take a new amount.
  const subscription = await currentSubscription(db, state.customer_id, state.mollie_subscription_id);
  if (!subscription) return { ok: false, reason: subscriptionOverReason };

  const { data, error } = await db
    .from("recurring_price_changes")
    .insert({
      recurring_service_id: state.id,
      customer_id: state.customer_id,
      old_amount_cents: oldAmountCents,
      new_amount_cents: request.newAmountCents,
      effective_from: request.effectiveFrom,
      requested_by: requestedBy ?? null,
    })
    .select(priceChangeColumns)
    .maybeSingle();

  if (error?.code === "23505") {
    // The other click won. Its change is the answer when it is the same one.
    const winner = pendingPriceChange(await listPriceChangesForService(db, serviceId));
    if (winner && winner.newAmountCents === request.newAmountCents && winner.effectiveFrom === request.effectiveFrom) {
      return reused(winner, state.vat_rate);
    }
    return { ok: false, reason: alreadyPlannedReason };
  }
  fail("Prijswijziging vastleggen", error);
  if (!data) throw new Error("Prijswijziging vastleggen: geen rij teruggekregen.");

  const change = priceChangeFromRow(data as PriceChangeRow);
  return {
    ok: true,
    change,
    reused: false,
    oldGrossCents: grossOf(change.oldAmountCents, state.vat_rate),
    newGrossCents: grossOf(change.newAmountCents, state.vat_rate),
  };
}

function reused(change: PriceChange, vatRate: number): PriceChangeResult {
  return {
    ok: true,
    change,
    reused: true,
    oldGrossCents: grossOf(change.oldAmountCents, vatRate),
    newGrossCents: grossOf(change.newAmountCents, vatRate),
  };
}

async function currentSubscription(
  db: Db,
  customerId: string,
  subscriptionId: string,
): Promise<(MollieSubscription & { providerCustomerId: string }) | undefined> {
  const providerId = await providerCustomerId(db, customerId);
  if (!providerId) return undefined;
  const subscription = await getSubscription(providerId, subscriptionId, getMollieConfig());
  return isCurrentSubscription(subscription) ? { ...subscription, providerCustomerId: providerId } : undefined;
}

// -------------------------------------------------------------- withdraw

export type WithdrawResult = { ok: true } | { ok: false; reason: string };

/**
 * Takes a planned change back. Only while Mollie has not been told: after
 * that the period's invoice carries the new amount too, and undoing both is
 * a new change in the other direction, not a withdrawal. A blocked change
 * is withdrawable, which is how an admin resolves it.
 */
export async function withdrawPriceChange(db: Db, changeId: string, now: Date = new Date()): Promise<WithdrawResult> {
  const { data, error } = await db
    .from("recurring_price_changes")
    .update({ canceled_at: now.toISOString(), canceled_reason: "withdrawn" })
    .eq("id", changeId)
    .is("applied_at", null)
    .is("canceled_at", null)
    .is("provider_updated_at", null)
    .select("id")
    .maybeSingle();
  fail("Prijswijziging intrekken", error);
  if (data) return { ok: true };

  const { data: row, error: readError } = await db
    .from("recurring_price_changes")
    .select("applied_at, canceled_at, provider_updated_at")
    .eq("id", changeId)
    .maybeSingle();
  fail("Prijswijziging laden", readError);
  if (!row) return { ok: false, reason: "Deze prijswijziging bestaat niet (meer)." };
  if (row.canceled_at) return { ok: true };
  if (row.applied_at) return { ok: false, reason: "Deze prijswijziging is al doorgevoerd." };
  return {
    ok: false,
    reason: "Mollie is al bijgewerkt en de factuur voor de eerste periode is aangemaakt; plan een nieuwe wijziging als het bedrag terug moet.",
  };
}

// --------------------------------------------------------------- daily job

export type PriceChangeProblem = { serviceId: string; changeId: string; reason: string };

export type PriceChangeRunSummary = {
  providerUpdated: number;
  applied: number;
  lapsed: number;
  rescheduled: number;
  blocked: number;
  problems: PriceChangeProblem[];
};

/**
 * Carries out every change whose day has come. Safe to run any number of
 * times a day: each step is a compare-and-swap on the column it fills, and a
 * Mollie update that was already made is recognised by the amount it left
 * there rather than sent again.
 *
 * A change the service's end has overtaken (a cancellation planned after
 * the change, ending before it) lapses here as well as at cancellation
 * time, so neither order of events leaves one behind. A blocked change is
 * left alone: it waits for an admin.
 */
export async function runPriceChanges(db: Db, todayKey: string, now: Date = new Date()): Promise<PriceChangeRunSummary> {
  const summary: PriceChangeRunSummary = { providerUpdated: 0, applied: 0, lapsed: 0, rescheduled: 0, blocked: 0, problems: [] };

  const { data, error } = await db
    .from("recurring_price_changes")
    .select(priceChangeColumns)
    .is("applied_at", null)
    .is("canceled_at", null);
  fail("Openstaande prijswijzigingen laden", error);
  const pending = ((data ?? []) as PriceChangeRow[]).map(priceChangeFromRow);

  for (const change of pending) {
    try {
      const service = await readService(db, change.recurringServiceId);
      if (!service) continue;

      if (service.status === "canceled" || (service.ends_on && change.effectiveFrom > service.ends_on)) {
        if (await lapse(db, change.id, now)) summary.lapsed += 1;
        continue;
      }
      if (change.blockedAt) continue;

      // Step 1, on the announcement day: Mollie.
      if (!change.providerUpdatedAt && isProviderUpdateDue(change, todayKey)) {
        const updated = await updateProvider(db, service, change, now);
        if (updated.outcome === "blocked" || updated.outcome === "problem") {
          if (updated.outcome === "blocked") summary.blocked += 1;
          summary.problems.push({ serviceId: service.id, changeId: change.id, reason: updated.reason });
          continue;
        }
        if (updated.outcome === "rescheduled") summary.rescheduled += 1;
        change.providerUpdatedAt = updated.at;
        change.effectiveFrom = updated.effectiveFrom;
        summary.providerUpdated += 1;
      }

      // Step 2, on the effective date: the price on the service itself.
      if (isLocalApplyDue(change, todayKey)) {
        const applied = await applyLocally(db, service, change, now);
        if (!applied.ok) summary.problems.push({ serviceId: service.id, changeId: change.id, reason: applied.reason });
        else summary.applied += 1;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "onbekende fout";
      summary.problems.push({ serviceId: change.recurringServiceId, changeId: change.id, reason });
    }
  }

  return summary;
}

async function lapse(db: Db, changeId: string, now: Date): Promise<boolean> {
  const { data, error } = await db
    .from("recurring_price_changes")
    .update({ canceled_at: now.toISOString(), canceled_reason: "service_ended" })
    .eq("id", changeId)
    .is("applied_at", null)
    .is("canceled_at", null)
    .select("id")
    .maybeSingle();
  fail("Vervallen prijswijziging vastleggen", error);
  return Boolean(data);
}

type ServiceState = NonNullable<Awaited<ReturnType<typeof readService>>>;

type ProviderOutcome =
  | { outcome: "updated"; at: string; effectiveFrom: string }
  | { outcome: "rescheduled"; at: string; effectiveFrom: string }
  | { outcome: "blocked"; reason: string }
  | { outcome: "problem"; reason: string };

/**
 * Gives Mollie the new amount, exactly once in effect, and only for a
 * period Mollie has not created the payment for.
 *
 * In order: the subscription is read (one that is over is blocked, Mollie
 * refuses it too); its payments are listed -- a live payment whose period
 * cannot be known blocks the change outright; if a live payment already exists
 * for the first period at the new amount, that period is taken: at the new
 * amount when the payment carries it (a retry after our own write failed),
 * otherwise the change moves on to the next period without a payment or an
 * invoice, and says so on the row. Then the subscription's amount is patched
 * when it is not already the wanted one, and the Mollie step is recorded.
 */
async function updateProvider(db: Db, service: ServiceState, change: PriceChange, now: Date): Promise<ProviderOutcome> {
  if (!service.mollie_subscription_id || !service.starts_on) {
    return { outcome: "problem", reason: "De dienst heeft geen abonnement bij Mollie." };
  }
  const providerId = await providerCustomerId(db, service.customer_id);
  if (!providerId) return { outcome: "problem", reason: "De klant heeft geen Mollie-klantprofiel." };

  const config = getMollieConfig();
  const subscription = await getSubscription(providerId, service.mollie_subscription_id, config);
  if (!isCurrentSubscription(subscription)) {
    return block(db, change, now, `Het abonnement bij Mollie is ${subscription.status}; het nieuwe bedrag kan niet worden doorgevoerd.`);
  }

  const wanted = grossOf(change.newAmountCents, service.vat_rate);
  const payments = await listSubscriptionPayments(providerId, service.mollie_subscription_id, config);
  /*
    A live payment without a due date could be for any period, including the
    one the new amount should start on. Nothing can be said about it, so
    nothing is patched: the change is blocked, visibly, and the admin decides.
  */
  const unknown = unknownPayments(payments);
  if (unknown.length > 0) return block(db, change, now, describeUnknownPayments(unknown));
  const anchorDay = Number(service.starts_on.slice(8, 10));
  const billed = await billedPeriodStarts(db, service.id);

  let effectiveFrom = change.effectiveFrom;
  let rescheduled = false;
  // Monthly steps past periods Mollie already created a payment for; three is
  // far past anything Mollie creates ahead, and beyond that an admin decides.
  for (let step = 0; step < 3; step += 1) {
    const existing = paymentForPeriod(service.starts_on, payments, effectiveFrom);
    if (!existing || centsFromMollie(existing.payment.amount.value) === wanted) break;

    const next = nextPeriodStart(effectiveFrom, anchorDay);
    const held = existing.payment.amount.value;
    if ((service.ends_on && next > service.ends_on) || billed.includes(next) || step === 2) {
      return block(
        db,
        change,
        now,
        `Mollie heeft de incasso van ${existing.chargeDate} al aangemaakt voor EUR ${held}; die periode houdt het oude bedrag en er is geen latere periode waarop het nieuwe bedrag kan ingaan.`,
      );
    }
    effectiveFrom = next;
    rescheduled = true;
  }

  if (rescheduled) {
    const { error } = await db
      .from("recurring_price_changes")
      .update({
        effective_from: effectiveFrom,
        rescheduled_from: change.rescheduledFrom ?? change.effectiveFrom,
        reschedule_reason: `Mollie had de incasso van ${change.effectiveFrom} al aangemaakt voor het oude bedrag; die periode houdt dat bedrag.`,
      })
      .eq("id", change.id)
      .is("provider_updated_at", null)
      .is("applied_at", null);
    fail("Verschoven prijswijziging vastleggen", error);
  }

  const held = subscription.amount ? centsFromMollie(subscription.amount.value) : undefined;
  if (held !== wanted) {
    await updateSubscriptionAmount({ customerId: providerId, subscriptionId: service.mollie_subscription_id, amountCents: wanted, config });
  }

  const at = now.toISOString();
  const { error } = await db
    .from("recurring_price_changes")
    .update({ provider_updated_at: at })
    .eq("id", change.id)
    .is("provider_updated_at", null);
  fail("Mollie-update vastleggen", error);
  return { outcome: rescheduled ? "rescheduled" : "updated", at, effectiveFrom };
}

async function block(db: Db, change: PriceChange, now: Date, reason: string): Promise<ProviderOutcome> {
  const { error } = await db
    .from("recurring_price_changes")
    .update({ blocked_at: now.toISOString(), blocked_reason: reason })
    .eq("id", change.id)
    .is("blocked_at", null)
    .is("applied_at", null);
  fail("Geblokkeerde prijswijziging vastleggen", error);
  return { outcome: "blocked", reason };
}

/**
 * Switches `amount_cents` over, as a compare-and-swap against the old
 * amount. A service already showing the new amount -- the switch happened
 * and only the `applied_at` write failed -- is completed; anything else is a
 * state nobody planned and is reported, never overwritten.
 */
async function applyLocally(
  db: Db,
  service: ServiceState,
  change: PriceChange,
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: switched, error } = await db
    .from("recurring_services")
    .update({ amount_cents: change.newAmountCents })
    .eq("id", service.id)
    .eq("amount_cents", change.oldAmountCents)
    .select("id")
    .maybeSingle();
  fail("Maandbedrag bijwerken", error);

  if (!switched) {
    const current = await readService(db, service.id);
    if (current?.amount_cents !== change.newAmountCents) {
      return {
        ok: false,
        reason: `Het maandbedrag op de dienst is ${current?.amount_cents ?? "onbekend"} in plaats van ${change.oldAmountCents}; de wijziging is niet doorgevoerd.`,
      };
    }
  }

  const { error: appliedError } = await db
    .from("recurring_price_changes")
    .update({ applied_at: now.toISOString() })
    .eq("id", change.id)
    .is("applied_at", null);
  fail("Doorgevoerde prijswijziging vastleggen", appliedError);
  return { ok: true };
}
