import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archivePaymentLink,
  createPaymentLink,
  getPaymentLink,
  listPaymentLinkPayments,
  payableLink,
  paymentStatusFromMollie,
  type MandateState,
  type MolliePayment,
} from "@/lib/mollie/client";
import { activationRedirectUrl, getMollieConfig, isMollieConfigured, mollieWebhookUrl } from "@/lib/mollie/config";
import { ensureProviderCustomer, lookupMandate, type MandateLookup } from "@/lib/payments/provider-customer";
import { directDebitStatus, type DirectDebitStatus } from "@/lib/payments/direct-debit-status";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Activating direct debit, on its own.
 *
 * A customer authorises collection by paying EUR 0.01 through a Mollie
 * payment link with `sequenceType: "first"`. That payment has one purpose:
 * Mollie turns it into a mandate. It is not an invoice payment and is never
 * treated as one -- it has its own table, it is never written to `payments`,
 * and nothing here reads or changes an invoice.
 *
 * Three steps, kept apart on purpose:
 *
 *   1. obtain     `requestMandateActivation` hands out one payable link per
 *                 customer, reusing the open one rather than making another.
 *   2. confirm    `processActivationPayment` (webhook) and
 *                 `refreshDirectDebit` (admin) ask Mollie for the mandate.
 *                 Only "valid" counts; a paid link is not proof of one.
 *   3. collect    starting a monthly subscription is a separate admin step,
 *                 in `collection-start.ts`, and requires step 2 first.
 *
 * Mollie is the source of truth for the mandate. The `mandate_*` columns and
 * `customer_payment_providers.provider_mandate_id` are a cache for the admin
 * screens, refreshed every time Mollie is asked.
 */
export const activationAmountCents = 1;
export const activationDescription = "Activeren automatische incasso";

export type MandateActivation = {
  id: string;
  customerId: string;
  providerCustomerId: string;
  providerPaymentLinkId: string;
  checkoutUrl: string;
  amountCents: number;
  providerPaymentId?: string;
  paidAt?: string;
  archivedAt?: string;
  mandateId?: string;
  mandateStatus?: MandateState;
  mandateCheckedAt?: string;
  validatedAt?: string;
  createdAt: string;
};

type Db = SupabaseClient<Database>;
type ActivationRow = Database["public"]["Tables"]["mandate_activations"]["Row"];

const columns =
  "id, customer_id, provider, provider_customer_id, provider_payment_link_id, checkout_url, amount_cents, provider_payment_id, paid_at, archived_at, mandate_id, mandate_status, mandate_checked_at, validated_at, created_at, updated_at";

export function activationFromRow(row: ActivationRow): MandateActivation {
  return {
    id: row.id,
    customerId: row.customer_id,
    providerCustomerId: row.provider_customer_id,
    providerPaymentLinkId: row.provider_payment_link_id,
    checkoutUrl: row.checkout_url,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
    ...(row.provider_payment_id ? { providerPaymentId: row.provider_payment_id } : {}),
    ...(row.paid_at ? { paidAt: row.paid_at } : {}),
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    ...(row.mandate_id ? { mandateId: row.mandate_id } : {}),
    ...(row.mandate_status ? { mandateStatus: row.mandate_status as MandateState } : {}),
    ...(row.mandate_checked_at ? { mandateCheckedAt: row.mandate_checked_at } : {}),
    ...(row.validated_at ? { validatedAt: row.validated_at } : {}),
  };
}

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

/** Every activation of a customer, newest first. A handful at most. */
export async function activationsForCustomer(db: Db, customerId: string): Promise<MandateActivation[]> {
  const { data, error } = await db.from("mandate_activations").select(columns).eq("customer_id", customerId);
  fail("Incasso-activaties laden", error);
  return ((data ?? []) as ActivationRow[])
    .map(activationFromRow)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function openActivation(db: Db, customerId: string): Promise<MandateActivation | undefined> {
  const { data, error } = await db
    .from("mandate_activations")
    .select(columns)
    .eq("customer_id", customerId)
    .is("paid_at", null)
    .is("archived_at", null)
    .maybeSingle();
  fail("Open incasso-activatie laden", error);
  return data ? activationFromRow(data as ActivationRow) : undefined;
}

// ---------------------------------------------------------------- step 1

export type ActivationRequest =
  | { ok: true; activation: MandateActivation; reused: boolean }
  | { ok: false; reason: string };

export const alreadyActiveReason = "Deze klant heeft al een geldige machtiging; de incasso is actief.";
export const pendingReason =
  "Er is al een machtiging in behandeling bij Mollie. Controleer de status later opnieuw voordat je een nieuwe link maakt.";
export const paidUnprocessedReason =
  "De activatiebetaling is al gedaan maar nog niet verwerkt. Klik op ‘Status controleren’.";

/**
 * The payable activation link for a customer: the open one when it can still
 * be paid, otherwise a new one. Never a second payable link next to the first.
 *
 * Refused while Mollie already reports a valid or a pending mandate -- asking
 * for permission we have, or are about to have, would only confuse the
 * customer. Mollie is asked, not our cache.
 */
export async function requestMandateActivation(db: Db, customerId: string): Promise<ActivationRequest> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };

  const mandate = await lookupMandate(db, customerId);
  if (mandate.state === "valid") {
    await recordMandate(db, customerId, undefined, mandate);
    return { ok: false, reason: alreadyActiveReason };
  }
  if (mandate.state === "pending") return { ok: false, reason: pendingReason };

  const config = getMollieConfig();
  const open = await openActivation(db, customerId);
  if (open) {
    const current = await getPaymentLink(open.providerPaymentLinkId, config);
    if (payableLink(current)) return { ok: true, activation: open, reused: true };
    if (current.paidAt) return { ok: false, reason: paidUnprocessedReason };
    // Expired or archived at Mollie: it can never be paid again, so it stops
    // counting as the open one and a replacement may be made.
    await markArchived(db, open.id);
  }

  const providerCustomerId = await ensureProviderCustomer(db, customerId);
  const id = randomUUID();
  const link = await createPaymentLink({
    amountCents: activationAmountCents,
    description: activationDescription,
    redirectUrl: activationRedirectUrl(config),
    // The link carries no metadata, so the activation is named here -- as a
    // hint the webhook confirms with Mollie before it believes it.
    webhookUrl: `${mollieWebhookUrl(config)}?activation=${encodeURIComponent(id)}`,
    sequenceType: "first",
    customerId: providerCustomerId,
    idempotencyKey: `mandate-activation-${id}`,
    config,
  });

  const href = link._links?.paymentLink?.href;
  if (!href) return { ok: false, reason: "Mollie gaf geen betaallink terug." };

  const { data, error } = await db
    .from("mandate_activations")
    .insert({
      id,
      customer_id: customerId,
      provider: "mollie",
      provider_customer_id: providerCustomerId,
      provider_payment_link_id: link.id,
      checkout_url: href,
      amount_cents: activationAmountCents,
    })
    .select(columns)
    .single();

  if (error?.code === "23505") {
    /*
      Someone else made the open link a moment ago. Ours is closed again so
      only one can be paid, and theirs is the answer.
    */
    await archivePaymentLink(link.id, config).catch((archiveError: unknown) => {
      console.error("Could not archive a duplicate activation link", { linkId: link.id, archiveError });
    });
    const winner = await openActivation(db, customerId);
    if (winner) return { ok: true, activation: winner, reused: true };
  }
  fail("Incasso-activatie vastleggen", error);
  return { ok: true, activation: activationFromRow(data as ActivationRow), reused: false };
}

async function markArchived(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("mandate_activations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  fail("Activatielink afsluiten", error);
}

// ---------------------------------------------------------------- step 2

/**
 * Writes down what Mollie just said about the mandate.
 *
 * On the activation, when there is one: status, mandate and the moment it was
 * first valid. On the customer: the mandate to collect against while it is
 * valid, and none the moment it is not -- a cache that claimed a revoked
 * mandate would make the screens promise a collection that cannot happen.
 */
export async function recordMandate(
  db: Db,
  customerId: string,
  activation: Pick<MandateActivation, "id"> | undefined,
  mandate: MandateLookup,
): Promise<void> {
  const now = new Date().toISOString();

  if (activation) {
    const { error } = await db
      .from("mandate_activations")
      .update({
        mandate_status: mandate.state,
        mandate_checked_at: now,
        // A mandate id is only ever added, never cleared: `validated_at`
        // needs the mandate it is about.
        ...(mandate.mandateId ? { mandate_id: mandate.mandateId } : {}),
      })
      .eq("id", activation.id);
    fail("Machtigingsstatus vastleggen", error);

    if (mandate.state === "valid") {
      const { error: validatedError } = await db
        .from("mandate_activations")
        .update({ validated_at: now })
        .eq("id", activation.id)
        .is("validated_at", null);
      fail("Bevestigde machtiging vastleggen", validatedError);
    }
  }

  if (mandate.state === "valid" && mandate.providerCustomerId && mandate.mandateId) {
    await storeProviderMandate(db, customerId, mandate.providerCustomerId, mandate.mandateId);
  } else {
    const { error } = await db
      .from("customer_payment_providers")
      .update({ provider_mandate_id: null })
      .eq("customer_id", customerId)
      .eq("provider", "mollie");
    fail("Vervallen machtiging vastleggen", error);
  }
}

/* One identity per customer at the provider, with the mandate to collect against. */
async function storeProviderMandate(
  db: Db,
  customerId: string,
  providerCustomerId: string,
  providerMandateId: string,
): Promise<void> {
  const { data: existing, error: readError } = await db
    .from("customer_payment_providers")
    .select("id")
    .eq("customer_id", customerId)
    .eq("provider", "mollie")
    .maybeSingle();
  fail("Providerkoppeling laden", readError);

  if (existing) {
    const { error } = await db
      .from("customer_payment_providers")
      .update({ provider_customer_id: providerCustomerId, provider_mandate_id: providerMandateId })
      .eq("id", existing.id);
    fail("Machtiging vastleggen", error);
    return;
  }

  const { error } = await db.from("customer_payment_providers").insert({
    customer_id: customerId,
    provider: "mollie",
    provider_customer_id: providerCustomerId,
    provider_mandate_id: providerMandateId,
  });
  // A concurrent delivery wrote it first: the same outcome by another route.
  if (error && error.code !== "23505") fail("Machtiging vastleggen", error);
}

/**
 * The activation a Mollie payment belongs to, if it belongs to one.
 *
 * By the payment id once it has been recorded; before that, through the
 * activation named in the webhook URL -- a hint from a third party, so it only
 * counts when Mollie confirms that this payment came from that link.
 */
export async function activationForPayment(
  db: Db,
  molliePaymentId: string,
  activationIdHint?: string,
): Promise<MandateActivation | undefined> {
  const { data: known, error } = await db
    .from("mandate_activations")
    .select(columns)
    .eq("provider", "mollie")
    .eq("provider_payment_id", molliePaymentId)
    .maybeSingle();
  fail("Incasso-activatie zoeken", error);
  if (known) return activationFromRow(known as ActivationRow);
  if (!activationIdHint) return undefined;

  const { data: hinted, error: hintError } = await db
    .from("mandate_activations")
    .select(columns)
    .eq("id", activationIdHint)
    .maybeSingle();
  fail("Incasso-activatie laden", hintError);
  if (!hinted) return undefined;

  const activation = activationFromRow(hinted as ActivationRow);
  const produced = await listPaymentLinkPayments(activation.providerPaymentLinkId, getMollieConfig());
  return produced.some((payment) => payment.id === molliePaymentId) ? activation : undefined;
}

/** The activation a Mollie payment link was made for. */
export async function activationIdForPaymentLink(db: Db, providerPaymentLinkId: string): Promise<string | undefined> {
  const { data, error } = await db
    .from("mandate_activations")
    .select("id")
    .eq("provider", "mollie")
    .eq("provider_payment_link_id", providerPaymentLinkId)
    .maybeSingle();
  fail("Activatielink opzoeken", error);
  return data?.id;
}

export type ActivationOutcome = { handled: boolean; note: string; retry?: boolean };

/**
 * A payment on an activation link, as the webhook sees it. Idempotent: the
 * paid moment is written once, and the mandate is simply asked again.
 *
 * Nothing here touches an invoice or the `payments` table. The cent is the
 * price of a mandate, not money against anything owed.
 */
export async function processActivationPayment(
  db: Db,
  payment: MolliePayment,
  activation: MandateActivation,
): Promise<ActivationOutcome> {
  const status = paymentStatusFromMollie(payment.status);
  // A failed or abandoned attempt leaves the link payable for the next one.
  if (status !== "paid") return { handled: true, note: `activation payment ${status}` };

  const { error } = await db
    .from("mandate_activations")
    .update({ provider_payment_id: payment.id, paid_at: payment.paidAt ?? new Date().toISOString() })
    .eq("id", activation.id)
    .is("paid_at", null);
  fail("Activatiebetaling vastleggen", error);

  const mandate = await lookupMandate(db, activation.customerId, payment.customerId ?? activation.providerCustomerId);
  await recordMandate(db, activation.customerId, activation, mandate);

  if (mandate.state === "pending") {
    // Mollie is asked to deliver again; by then the mandate may be valid.
    return { handled: false, retry: true, note: "activation paid; mandate still pending at the provider" };
  }
  if (mandate.state !== "valid") return { handled: true, note: `activation paid; mandate ${mandate.state}` };
  return { handled: true, note: "activation paid; mandate valid" };
}

/**
 * "Status controleren": asks Mollie again, for an admin who does not want to
 * wait for a webhook -- or after Mollie stopped retrying one. An open link
 * that was paid is processed exactly as the webhook would have.
 */
export async function refreshDirectDebit(db: Db, customerId: string): Promise<DirectDebitStatus> {
  const config = getMollieConfig();
  const open = await openActivation(db, customerId);
  if (open) {
    const produced = await listPaymentLinkPayments(open.providerPaymentLinkId, config);
    const paid = produced.find((payment) => paymentStatusFromMollie(payment.status) === "paid");
    if (paid) await processActivationPayment(db, paid, open);
  }

  const activations = await activationsForCustomer(db, customerId);
  const latestPaid = activations.find((activation) => activation.paidAt);
  const mandate = await lookupMandate(db, customerId);
  await recordMandate(db, customerId, latestPaid, mandate);

  const refreshed = await activationsForCustomer(db, customerId);
  return directDebitStatus({ activations: refreshed, mandateOnRecord: mandate.state === "valid" });
}
