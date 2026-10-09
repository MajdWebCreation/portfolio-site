import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailAddress } from "@/lib/email/address";
import { createCustomer, listMandates, mandateState, type MandateState } from "@/lib/mollie/client";
import { getMollieConfig } from "@/lib/mollie/config";
import type { Database } from "@/lib/supabase/database.types";

/**
 * One Mollie customer per YM customer, and the mandate that belongs to them.
 *
 * Shared by the two entry points that need it -- sending an invoice that has
 * to establish a mandate, and the standalone activation link -- so the rule
 * that a customer has exactly one identity at the provider is enforced in one
 * place. The unique keys on `customer_payment_providers` are the backstop; a
 * lost race is resolved by reading the row the winner wrote.
 *
 * Who the customer is at Mollie is read here, from the `customers` row as it
 * is now -- not passed in by the caller, so no caller can hand over the copy
 * of the customer an invoice took when it was written. Mollie keeps what it
 * is given at creation (this never updates an existing customer there), so a
 * stale name or address would stay with the customer for good.
 */
export const providerCustomerEmailReason =
  "De klant heeft geen geldig e-mailadres, dus er kan geen klantprofiel bij Mollie worden aangemaakt. Voeg eerst een e-mailadres toe bij de klantgegevens.";

/**
 * Name and address for a new Mollie customer, out of the customer record.
 *
 * No fallback: without a usable address on the record nothing is created at
 * the provider. Thrown, because both callers already turn a provider failure
 * into a refusal -- the invoice is not sent, the activation page says it is
 * unavailable -- and this is one.
 */
async function providerIdentity(
  db: SupabaseClient<Database>,
  customerId: string,
): Promise<{ name: string; email: string }> {
  const { data, error } = await db.from("customers").select("company_name, email").eq("id", customerId).maybeSingle();
  if (error) throw new Error(`Klant laden: ${error.message}`);
  if (!data) throw new Error("Deze klant bestaat niet (meer).");

  const email = (data.email ?? "").trim();
  if (!isEmailAddress(email)) throw new Error(providerCustomerEmailReason);
  return { name: data.company_name.trim(), email };
}

export async function ensureProviderCustomer(db: SupabaseClient<Database>, customerId: string): Promise<string> {
  const { data: existing, error } = await db
    .from("customer_payment_providers")
    .select("provider_customer_id")
    .eq("customer_id", customerId)
    .eq("provider", "mollie")
    .maybeSingle();
  if (error) throw new Error(`Providerkoppeling laden: ${error.message}`);
  if (existing) return existing.provider_customer_id;

  const identity = await providerIdentity(db, customerId);
  const created = await createCustomer({
    name: identity.name,
    email: identity.email,
    // Keyed on the YM customer, so two services activating at once cannot
    // create two customers at the provider.
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

/** The provider identity we already hold for a customer, if any. */
export async function readProviderCustomerId(
  db: SupabaseClient<Database>,
  customerId: string,
): Promise<string | undefined> {
  const { data, error } = await db
    .from("customer_payment_providers")
    .select("provider_customer_id")
    .eq("customer_id", customerId)
    .eq("provider", "mollie")
    .maybeSingle();
  if (error) throw new Error(`Providerkoppeling laden: ${error.message}`);
  return data?.provider_customer_id ?? undefined;
}

/**
 * The customer's mandate as Mollie reports it right now.
 *
 * Asked of Mollie rather than of our own column: a customer can revoke a
 * mandate at their bank without telling us, a first payment can be paid while
 * the mandate it produced is still pending, and switching a subscription on
 * against either fails silently every month.
 *
 * `fallbackProviderCustomerId` is the customer a Mollie payment names, used
 * only when the administration holds no provider identity yet.
 */
export type MandateLookup = {
  state: MandateState;
  providerCustomerId?: string;
  /** Present for "valid" and "pending": the mandate that state is about. */
  mandateId?: string;
};

export async function lookupMandate(
  db: SupabaseClient<Database>,
  customerId: string,
  fallbackProviderCustomerId?: string,
): Promise<MandateLookup> {
  const providerCustomerId = (await readProviderCustomerId(db, customerId)) ?? fallbackProviderCustomerId;
  if (!providerCustomerId) return { state: "none" };

  const { state, mandate } = mandateState(await listMandates(providerCustomerId, getMollieConfig()));
  return { state, providerCustomerId, ...(mandate ? { mandateId: mandate.id } : {}) };
}

/** Whether this customer can be collected from right now: only a valid mandate counts. */
export async function hasUsableMandate(
  db: SupabaseClient<Database>,
  customerId: string,
): Promise<{ has: boolean; providerCustomerId?: string; mandateId?: string }> {
  const found = await lookupMandate(db, customerId);
  return {
    has: found.state === "valid",
    ...(found.providerCustomerId ? { providerCustomerId: found.providerCustomerId } : {}),
    ...(found.state === "valid" && found.mandateId ? { mandateId: found.mandateId } : {}),
  };
}
