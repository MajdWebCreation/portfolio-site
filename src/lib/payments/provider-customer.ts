import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomer, listMandates, usableMandate } from "@/lib/mollie/client";
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
 */
export async function ensureProviderCustomer(
  db: SupabaseClient<Database>,
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
 * Whether this customer can be collected from right now.
 *
 * Asked of Mollie rather than of our own column: a customer can revoke a
 * mandate at their bank without telling us, and switching a subscription on
 * against a dead mandate fails silently every month.
 */
export async function hasUsableMandate(
  db: SupabaseClient<Database>,
  customerId: string,
): Promise<{ has: boolean; providerCustomerId?: string; mandateId?: string }> {
  const providerCustomerId = await readProviderCustomerId(db, customerId);
  if (!providerCustomerId) return { has: false };

  const mandate = usableMandate(await listMandates(providerCustomerId, getMollieConfig()));
  return {
    has: Boolean(mandate),
    providerCustomerId,
    ...(mandate ? { mandateId: mandate.id } : {}),
  };
}
