"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { adminDb, orNull } from "@/lib/admin/db";
import { isDateKey, toDateKey } from "@/lib/admin/format";
import { sendActivationMail } from "@/lib/payments/activation-email";
import { startCollection } from "@/lib/payments/collection-start";
import type { DirectDebitStatus } from "@/lib/payments/direct-debit-status";
import { refreshDirectDebit, requestMandateActivation } from "@/lib/payments/mandate-activation";
import { getRecurringService } from "@/lib/payments/repository";
import { isRecurringStatus, recurringChargeCents } from "@/lib/payments/types";

export type RecurringServiceInput = {
  customerId: string;
  name: string;
  description: string;
  /** Whole euro cents, already parsed by the form. */
  amountCents: number;
  vatRate: number;
  startsOn?: string;
  status: string;
};

const missingCustomer = "Deze klant bestaat niet meer.";

function validate(input: Omit<RecurringServiceInput, "customerId">): string | null {
  if (!input.name.trim()) return "Vul een naam in.";
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return "Vul een bedrag hoger dan nul in.";
  if (![0, 9, 21].includes(input.vatRate)) return "Kies een geldig btw-percentage.";
  if (input.startsOn && !isDateKey(input.startsOn)) return "De startdatum is geen geldige datum.";
  if (!isRecurringStatus(input.status)) return "Kies een geldige status.";
  // Activation is what makes a service collect; it is not something to set by
  // hand, or the administration would claim a mandate that does not exist.
  if (input.status === "active" || input.status === "awaiting_mandate") {
    return "Een dienst wordt actief door de incasso te activeren, niet door de status te kiezen.";
  }
  return null;
}

export async function createRecurringService(input: RecurringServiceInput): Promise<ActionResult<string>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const { data, error } = await db
    .from("recurring_services")
    .insert({
      customer_id: input.customerId,
      name: input.name.trim(),
      description: input.description,
      amount_cents: input.amountCents,
      vat_rate: input.vatRate,
      billing_interval: "monthly",
      starts_on: orNull(input.startsOn),
      status: input.status,
    })
    .select("id")
    .single();

  if (error || !data) return referenceFailed(error, missingCustomer, "Dienst aanmaken mislukt.");

  revalidatePath(`/admin/klanten/${input.customerId}`);
  revalidatePath("/admin/betalingen");
  return { ok: true, value: data.id };
}

export async function updateRecurringService(
  id: string,
  input: Omit<RecurringServiceInput, "customerId" | "status"> & { status: string },
): Promise<ActionResult> {
  const invalid = validate(input);
  // A service that already collects keeps its status; only the paused and
  // cancelled transitions are the admin's to make.
  if (invalid && input.status !== "paused" && input.status !== "canceled") return { ok: false, error: invalid };

  const db = await adminDb();
  const { data, error } = await db
    .from("recurring_services")
    .update({
      name: input.name.trim(),
      description: input.description,
      amount_cents: input.amountCents,
      vat_rate: input.vatRate,
      starts_on: orNull(input.startsOn),
      status: input.status,
    })
    .eq("id", id)
    .select("customer_id")
    .maybeSingle();

  if (error) return actionFailed(error, "Opslaan mislukt.");
  if (!data) return { ok: false, error: "Deze dienst bestaat niet (meer)." };

  revalidatePath(`/admin/klanten/${data.customer_id}`);
  revalidatePath("/admin/betalingen");
  return { ok: true };
}

// ------------------------------------------------------------ direct debit

/*
  Direct debit in three admin steps, each its own action: hand out the EUR 0.01
  activation link (and mail it), check what Mollie says about the mandate, and
  -- only once Mollie calls it valid -- start a service's monthly collection.
  None of them reads or changes an invoice.
*/

function revalidateCustomer(customerId: string): void {
  revalidatePath(`/admin/klanten/${customerId}`);
  revalidatePath("/admin/facturen/[id]", "page");
  revalidatePath("/admin/betalingen");
}

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  // The provider's own message, never the key or the request.
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

/**
 * "Incasso activeren (€0,01)": the customer's payable activation link. The
 * open one when it can still be paid; a new one only when there is none.
 */
export async function createMandateActivation(
  customerId: string,
): Promise<ActionResult<{ url: string; reused: boolean }>> {
  try {
    const db = await adminDb();
    const result = await requestMandateActivation(db, customerId);
    if (!result.ok) return { ok: false, error: result.reason };
    revalidateCustomer(customerId);
    return { ok: true, value: { url: result.activation.checkoutUrl, reused: result.reused } };
  } catch (error) {
    console.error("Could not create a direct debit activation", { customerId, error });
    return failure(error, "De activatielink kon niet worden gemaakt.");
  }
}

/**
 * Mails the activation link -- the same open link, so mailing twice never
 * puts two payable links in the customer's inbox.
 */
export async function mailMandateActivation(customerId: string): Promise<ActionResult<string>> {
  try {
    const db = await adminDb();
    // Checked before anything is made at Mollie: no address, no link.
    const addressed = await resolveCustomerRecipient(db, customerId);
    if (!addressed.ok) return { ok: false, error: addressed.reason };

    const result = await requestMandateActivation(db, customerId);
    if (!result.ok) return { ok: false, error: result.reason };

    const { data: services, error } = await db
      .from("recurring_services")
      .select("name, amount_cents, vat_rate, status, mollie_subscription_id")
      .eq("customer_id", customerId);
    if (error) return actionFailed(error, "Diensten laden mislukt.");

    const mail = await sendActivationMail({
      log: { db, customerId, category: "direct_debit_activation" },
      recipient: addressed.recipient,
      services: (services ?? [])
        .filter((service) => service.status !== "canceled" && !service.mollie_subscription_id)
        .map((service) => ({
          name: service.name,
          monthlyGrossCents: recurringChargeCents({ amountCents: service.amount_cents, vatRate: service.vat_rate }),
        })),
      activationUrl: result.activation.checkoutUrl,
    });
    if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

    revalidateCustomer(customerId);
    return { ok: true, value: addressed.recipient.email };
  } catch (error) {
    console.error("Could not mail a direct debit activation", { customerId, error });
    return failure(error, "De activatielink kon niet worden verstuurd.");
  }
}

/** "Status controleren": asks Mollie again instead of waiting for a webhook. */
export async function refreshDirectDebitStatus(customerId: string): Promise<ActionResult<DirectDebitStatus>> {
  try {
    const status = await refreshDirectDebit(await adminDb(), customerId);
    revalidateCustomer(customerId);
    return { ok: true, value: status };
  } catch (error) {
    console.error("Could not refresh direct debit status", { customerId, error });
    return failure(error, "De status kon niet worden opgehaald.");
  }
}

/**
 * "Maandelijkse incasso starten": the subscription at Mollie, from the first
 * date that bills no period twice and can still be announced in time. Only
 * with a mandate Mollie calls valid right now.
 */
export async function startMonthlyCollection(
  serviceId: string,
  requestedStart?: string,
): Promise<ActionResult<string>> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };
  if (requestedStart !== undefined && !isDateKey(requestedStart)) {
    return { ok: false, error: "De startdatum is geen geldige datum." };
  }

  try {
    const result = await startCollection(await adminDb(), service, toDateKey(new Date()), requestedStart);
    if (!result.ok) return { ok: false, error: result.reason };
    revalidateCustomer(service.customerId);
    if (service.projectId) revalidatePath(`/admin/projecten/${service.projectId}`);
    return { ok: true, value: result.firstDebitOn };
  } catch (error) {
    console.error("Could not start a monthly collection", { serviceId, error });
    return failure(error, "De maandelijkse incasso kon niet worden gestart.");
  }
}
