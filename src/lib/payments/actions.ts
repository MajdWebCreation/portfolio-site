"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { isDateKey, toDateKey } from "@/lib/admin/format";
import { sendActivationMail } from "@/lib/payments/activation-email";
import { getRecurringService } from "@/lib/payments/repository";
import { earliestDebitDate, prenotificationDays } from "@/lib/payments/prenotification";
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
    log: {
      db,
      customerId: service.customerId,
      category: "direct_debit_activation",
      recurringServiceId: service.id,
      ...(service.projectId ? { projectId: service.projectId } : {}),
    },
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

/**
 * Linking a monthly service to the invoice whose payment switches it on.
 *
 * The relation is stored on the service (`activation_invoice_id`), not kept in
 * the page, because everything that has to read it happens later and
 * elsewhere: the send flow deciding between a one-off and a first payment, and
 * a webhook that may arrive hours after the admin closed the tab. A partial
 * unique index makes one invoice activate at most one service.
 *
 * Either an existing service of this customer is picked -- so a second invoice
 * does not create a second copy of the same monthly service -- or one is
 * created here. In both cases the figures the admin typed win, because the
 * mail and the PDF are about to quote them.
 */
export type InvoiceActivationInput = {
  /** An existing service of this customer, or empty to create one. */
  serviceId?: string;
  name: string;
  /** Excluding VAT, like every other amount in the administration. */
  amountCents: number;
  vatRate: number;
  /** The day of the first automatic collection. */
  startsOn: string;
  projectId?: string;
};

const invoiceGone = "Deze factuur bestaat niet (meer).";

/** The invoice, as far as attaching a service is allowed to care about it. */
async function activatableInvoice(db: Awaited<ReturnType<typeof adminDb>>, invoiceId: string) {
  const { data, error } = await db
    .from("invoices")
    .select("id, customer_id, project_id, issued_at, number_value")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) return { error: actionFailed(error, "Factuur laden mislukt.") };
  if (!data) return { error: { ok: false as const, error: invoiceGone } };
  /*
    Once the invoice is definitive, the document says in so many words what
    paying it authorises -- or says nothing about a monthly service at all --
    and that note is frozen with the rest of it. Attaching a service
    afterwards would leave the customer holding one promise and the
    administration another, which is exactly what the send flow then refuses
    to mail.
  */
  if (data.issued_at) {
    return {
      error: {
        ok: false as const,
        error: `Factuur ${data.number_value} is al definitief. Koppel de maandelijkse service aan een nieuwe factuur, of activeer de incasso apart.`,
      },
    };
  }
  return { invoice: data };
}

export async function attachRecurringToInvoice(
  invoiceId: string,
  input: InvoiceActivationInput,
): Promise<ActionResult<string>> {
  if (!input.name.trim()) return { ok: false, error: "Vul een naam voor de maandelijkse service in." };
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "Vul een maandbedrag hoger dan nul in." };
  }
  if (![0, 9, 21].includes(input.vatRate)) return { ok: false, error: "Kies een geldig btw-percentage." };
  if (!isDateKey(input.startsOn)) return { ok: false, error: "Kies een geldige datum voor de eerste incasso." };
  /*
    A collection is announced fourteen calendar days in advance, and the
    invoice mail is that announcement. A date sooner than that could not be
    announced in time, so it is refused here rather than warned about -- the
    same rule the send flow checks again on the day it actually goes out.
  */
  const earliest = earliestDebitDate(toDateKey(new Date()));
  if (input.startsOn < earliest) {
    return {
      ok: false,
      error: `De eerste automatische incasso moet minstens ${prenotificationDays} dagen na vandaag liggen, dus op ${earliest} of later. De factuurmail is tegelijk de vooraankondiging.`,
    };
  }

  const db = await adminDb();
  const found = await activatableInvoice(db, invoiceId);
  if (found.error) return found.error;
  const invoice = found.invoice;

  // The service is filed under the same project as the invoice unless the
  // admin said otherwise; the composite key refuses a project of someone else.
  const projectId = input.projectId ?? invoice.project_id ?? null;
  const fields = {
    name: input.name.trim(),
    amount_cents: input.amountCents,
    vat_rate: input.vatRate,
    starts_on: input.startsOn,
    project_id: projectId,
    activation_invoice_id: invoiceId,
  };

  let serviceId = input.serviceId;

  if (serviceId) {
    const existing = await getRecurringService(serviceId);
    if (!existing) return { ok: false, error: "Deze dienst bestaat niet (meer)." };
    if (existing.customerId !== invoice.customer_id) {
      return { ok: false, error: "Deze dienst hoort bij een andere klant." };
    }
    if (existing.mollie.subscriptionId) {
      return { ok: false, error: "Voor deze dienst loopt de incasso al; die hoeft niet opnieuw geactiveerd te worden." };
    }
    if (existing.status === "canceled") return { ok: false, error: "Deze dienst is gestopt." };

    const { error } = await db.from("recurring_services").update(fields).eq("id", serviceId);
    if (error) return linkFailed(error);
  } else {
    const { data, error } = await db
      .from("recurring_services")
      .insert({
        customer_id: invoice.customer_id,
        description: "",
        currency: "EUR",
        billing_interval: "monthly",
        // Draft until money and a mandate actually arrive; the webhook is what
        // makes a service collect, never a status chosen by hand.
        status: "draft",
        ...fields,
      })
      .select("id")
      .single();
    if (error || !data) return linkFailed(error);
    serviceId = data.id;
  }

  revalidatePath(`/admin/facturen/${invoiceId}`);
  revalidatePath(`/admin/klanten/${invoice.customer_id}`);
  if (projectId) revalidatePath(`/admin/projecten/${projectId}`);
  revalidatePath("/admin/betalingen");
  return { ok: true, value: serviceId };
}

/** Either composite key, or the one-service-per-invoice index. */
function linkFailed(error: { code?: string; message: string } | null): { ok: false; error: string } {
  if (error?.code === "23505") {
    return { ok: false, error: "Deze factuur activeert al een andere maandelijkse service." };
  }
  return referenceFailed(error, "Het gekozen project hoort niet bij deze klant.", "Koppelen mislukt.");
}

/**
 * Unlinking. The service itself stays -- it may have been created for this
 * customer on purpose -- but this invoice stops being what switches it on, so
 * the next send asks for an ordinary one-off payment again.
 */
export async function detachRecurringFromInvoice(invoiceId: string): Promise<ActionResult> {
  const db = await adminDb();
  const found = await activatableInvoice(db, invoiceId);
  if (found.error) return found.error;

  const { error } = await db
    .from("recurring_services")
    .update({ activation_invoice_id: null })
    .eq("activation_invoice_id", invoiceId);
  if (error) return actionFailed(error, "Ontkoppelen mislukt.");

  revalidatePath(`/admin/facturen/${invoiceId}`);
  revalidatePath(`/admin/klanten/${found.invoice.customer_id}`);
  revalidatePath("/admin/betalingen");
  return { ok: true };
}
