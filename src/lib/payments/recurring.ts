import { createCustomer, createPayment, getPayment } from "@/lib/mollie/client";
import { activationRedirectUrl, getMollieConfig, isMollieConfigured, mollieWebhookUrl } from "@/lib/mollie/config";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import { recurringServiceFromRow } from "@/lib/payments/mapper";
import { hashActivationToken, isActivationTokenShape, isExpired } from "@/lib/payments/tokens";
import { recurringChargeCents } from "@/lib/payments/types";

/**
 * Direct debit activation, in two deliberately separate halves.
 *
 * `readActivation` is what a GET does: it checks the token and reports what
 * the page should say. It creates nothing -- no Mollie customer, no payment,
 * no mandate, no subscription -- and does not consume the token, so a mail
 * client prefetching the link or a scanner following it changes nothing.
 *
 * `startActivation` is what the customer's own POST does. It is idempotent by
 * construction: the activation remembers the payment it created, writing that
 * id is conditional on it still being empty, the provider call carries an
 * idempotency key, and a unique index is the backstop. Clicking twice lands
 * on the same Mollie payment.
 */
export type ActivationView =
  | { ok: true; serviceName: string; amountCents: number; contactName: string }
  | { ok: false; reason: ActivationProblem };

export type ActivationProblem = "unknown" | "expired" | "used" | "unavailable";

export type ActivationStart = { ok: true; checkoutUrl: string } | { ok: false; reason: ActivationProblem };

const recurringColumns =
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, mollie_subscription_id, created_at, updated_at";

type ActivationRow = {
  id: string;
  recurring_service_id: string;
  expires_at: string;
  used_at: string | null;
  mollie_payment_id: string | null;
};

type LoadedActivation =
  | { problem: ActivationProblem }
  | {
      problem?: undefined;
      db: ReturnType<typeof paymentsAdminClient>;
      activation: ActivationRow;
      service: ReturnType<typeof recurringServiceFromRow>;
    };

async function loadActivation(token: string): Promise<LoadedActivation> {
  if (!isActivationTokenShape(token)) return { problem: "unknown" };

  const db = paymentsAdminClient();
  // Looked up by hash: the token itself is never stored, so a leaked row is
  // not a working link.
  const { data, error } = await db
    .from("recurring_activations")
    .select("id, recurring_service_id, expires_at, used_at, mollie_payment_id")
    .eq("token_hash", hashActivationToken(token))
    .maybeSingle();

  if (error) throw new Error(`Activatie zoeken: ${error.message}`);
  if (!data) return { problem: "unknown" };

  const { data: serviceRow, error: serviceError } = await db
    .from("recurring_services")
    .select(recurringColumns)
    .eq("id", data.recurring_service_id)
    .maybeSingle();
  if (serviceError) throw new Error(`Dienst laden: ${serviceError.message}`);
  if (!serviceRow) return { problem: "unknown" };

  return { db, activation: data as ActivationRow, service: recurringServiceFromRow(serviceRow) };
}

/** What a GET may do: look, and say what it found. Nothing is created. */
export async function readActivation(token: string): Promise<ActivationView> {
  if (!isMollieConfigured()) return { ok: false, reason: "unavailable" };

  const loaded = await loadActivation(token);
  if (loaded.problem) return { ok: false, reason: loaded.problem };

  const { db, activation, service } = loaded;

  if (service.status === "canceled" || service.mollie.subscriptionId) return { ok: false, reason: "used" };
  // A used activation that never produced a payment is spent; one that did can
  // still be continued, which the POST handles.
  if (activation.used_at && !activation.mollie_payment_id) return { ok: false, reason: "used" };
  if (!activation.mollie_payment_id && isExpired(activation.expires_at)) return { ok: false, reason: "expired" };

  const { data: customer, error } = await db
    .from("customers")
    .select("contact_name")
    .eq("id", service.customerId)
    .maybeSingle();
  if (error) throw new Error(`Klant laden: ${error.message}`);

  return {
    ok: true,
    serviceName: service.name,
    // What the customer pays, so including VAT.
    amountCents: recurringChargeCents(service),
    contactName: customer?.contact_name ?? "",
  };
}

/**
 * One Mollie customer per YM customer, whatever the service.
 *
 * The link row is the rule; the idempotency key is keyed on the YM customer
 * for the same reason, so two services activating at once cannot create two
 * customers at the provider. A lost race is resolved by reading the row the
 * winner wrote.
 */
async function ensureProviderCustomer(
  db: ReturnType<typeof paymentsAdminClient>,
  customerId: string,
  identity: { name: string; email: string },
): Promise<string> {
  const { data: existing, error } = await db
    .from("customer_payment_providers")
    .select("provider_customer_id")
    .eq("customer_id", customerId)
    .eq("provider", "mollie")
    .maybeSingle();
  if (error) throw new Error(`Providerkoppeling laden: ${error.message}`);
  if (existing) return existing.provider_customer_id;

  const created = await createCustomer({
    name: identity.name,
    email: identity.email,
    idempotencyKey: `customer-${customerId}`,
    config: getMollieConfig(),
  });

  const { error: insertError } = await db.from("customer_payment_providers").insert({
    customer_id: customerId,
    provider: "mollie",
    provider_customer_id: created.id,
  });

  if (insertError) {
    if (insertError.code !== "23505") throw new Error(`Providerkoppeling vastleggen: ${insertError.message}`);
    const { data: raced } = await db
      .from("customer_payment_providers")
      .select("provider_customer_id")
      .eq("customer_id", customerId)
      .eq("provider", "mollie")
      .maybeSingle();
    if (raced) return raced.provider_customer_id;
  }

  return created.id;
}

/** What the customer's own POST does. */
export async function startActivation(token: string): Promise<ActivationStart> {
  if (!isMollieConfigured()) return { ok: false, reason: "unavailable" };

  const loaded = await loadActivation(token);
  if (loaded.problem) return { ok: false, reason: loaded.problem };

  const { db, activation, service } = loaded;
  const config = getMollieConfig();

  if (service.status === "canceled" || service.mollie.subscriptionId) return { ok: false, reason: "used" };

  // A second POST resumes the payment the first one made.
  if (activation.mollie_payment_id) {
    const existing = await getPayment(activation.mollie_payment_id, config);
    const href = existing._links?.checkout?.href;
    if (href && (existing.status === "open" || existing.status === "pending")) {
      return { ok: true, checkoutUrl: href };
    }
    return { ok: false, reason: activation.used_at ? "used" : "expired" };
  }

  if (activation.used_at) return { ok: false, reason: "used" };
  if (isExpired(activation.expires_at)) return { ok: false, reason: "expired" };

  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("company_name, email")
    .eq("id", service.customerId)
    .single();
  if (customerError) throw new Error(`Klant laden: ${customerError.message}`);

  const providerCustomerId = await ensureProviderCustomer(db, service.customerId, {
    name: customer!.company_name,
    email: customer!.email,
  });

  /*
    `sequenceType: "first"` is what turns this into a mandate: the customer
    pays once and authorises future collections in the same step. The amount
    is the service's real price, because this payment is the first billing
    period -- not a token amount to be refunded.
  */
  const payment = await createPayment({
    amountCents: recurringChargeCents(service),
    description: `${service.name} — eerste termijn en machtiging`,
    redirectUrl: activationRedirectUrl(config),
    webhookUrl: mollieWebhookUrl(config),
    metadata: { kind: "recurring_activation", recurringServiceId: service.id, customerId: service.customerId },
    sequenceType: "first",
    customerId: providerCustomerId,
    idempotencyKey: `activation-${activation.id}`,
    config,
  });

  const { data: claimed, error: claimError } = await db
    .from("recurring_activations")
    .update({ mollie_payment_id: payment.id })
    .eq("id", activation.id)
    .is("mollie_payment_id", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Activatiebetaling vastleggen: ${claimError.message}`);

  if (!claimed) {
    // Someone else won the race; follow their payment rather than ours.
    const { data: fresh } = await db
      .from("recurring_activations")
      .select("mollie_payment_id")
      .eq("id", activation.id)
      .maybeSingle();
    if (fresh?.mollie_payment_id) {
      const winner = await getPayment(fresh.mollie_payment_id, config);
      const href = winner._links?.checkout?.href;
      if (href) return { ok: true, checkoutUrl: href };
    }
  }

  await db.from("recurring_services").update({ status: "awaiting_mandate" }).eq("id", service.id).eq("status", "draft");

  const href = payment._links?.checkout?.href;
  return href ? { ok: true, checkoutUrl: href } : { ok: false, reason: "unavailable" };
}
