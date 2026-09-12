"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { isDateKey } from "@/lib/admin/format";
import { sendActivationMail } from "@/lib/payments/activation-email";
import { getRecurringService } from "@/lib/payments/repository";
import { activationExpiry, createActivationToken } from "@/lib/payments/tokens";
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

/**
 * Mails the customer a link to set up direct debit.
 *
 * One open activation at a time, which the database enforces with a partial
 * unique index: sending again replaces the outstanding link rather than
 * opening a second route to a second mandate. The token is generated here,
 * put in the mail, and only its hash is stored.
 */
export async function sendRecurringActivation(serviceId: string): Promise<ActionResult<string>> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };
  if (service.status === "canceled") return { ok: false, error: "Deze dienst is gestopt." };
  if (service.mollie.subscriptionId) return { ok: false, error: "Voor deze dienst loopt de incasso al." };

  const db = await adminDb();
  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("contact_name, email")
    .eq("id", service.customerId)
    .maybeSingle();
  if (customerError) return actionFailed(customerError, "Klant laden mislukt.");
  if (!customer) return { ok: false, error: "Deze klant bestaat niet (meer)." };

  // Replace any outstanding link: the old token stops working the moment its
  // row is gone, so a customer never holds two live links.
  const { error: clearError } = await db
    .from("recurring_activations")
    .update({ used_at: new Date().toISOString() })
    .eq("recurring_service_id", serviceId)
    .is("used_at", null);
  if (clearError) return actionFailed(clearError, "Oude activatielink intrekken mislukt.");

  const { token, tokenHash } = createActivationToken();
  const { error: insertError } = await db.from("recurring_activations").insert({
    recurring_service_id: serviceId,
    token_hash: tokenHash,
    expires_at: activationExpiry(),
  });
  if (insertError) return actionFailed(insertError, "Activatielink aanmaken mislukt.");

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ymcreations.com").replace(/\/$/, "");
  const mail = await sendActivationMail({
    recipientEmail: customer.email,
    contactName: customer.contact_name,
    serviceName: service.name,
    amountCents: recurringChargeCents(service),
    activationUrl: `${siteUrl}/nl/incasso/${token}`,
  });

  if (!mail.sent) return { ok: false, error: `Versturen mislukt: ${mail.reason}` };

  revalidatePath(`/admin/klanten/${service.customerId}`);
  revalidatePath("/admin/betalingen");
  return { ok: true, value: customer.email };
}
