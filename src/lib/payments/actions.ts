"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/access";
import { actionFailed, referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { adminDb, orNull } from "@/lib/admin/db";
import { isDateKey, toDateKey } from "@/lib/admin/format";
import { sendActivationMail } from "@/lib/payments/activation-email";
import { requestCancellation, withdrawCancellation, type CancellationDeviation, type CancellationPlan } from "@/lib/payments/cancellation";
import { startCollection } from "@/lib/payments/collection-start";
import type { DirectDebitStatus } from "@/lib/payments/direct-debit-status";
import { refreshDirectDebit, requestMandateActivation } from "@/lib/payments/mandate-activation";
import { listPriceChangesForService, schedulePriceChange, withdrawPriceChange } from "@/lib/payments/price-change";
import { grossOf } from "@/lib/payments/pricing";
import { getRecurringService } from "@/lib/payments/repository";
import type { ServiceAgreementInput, ServiceAgreementRevision } from "@/lib/payments/service-agreement";
import { createRecurringServiceWithAgreement, recordAgreementRevision } from "@/lib/payments/service-agreement-revisions";
import { sendCancellationMail, sendPriceChangeMail, type MailResult } from "@/lib/payments/service-change-email";
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

  /*
    The service and its first agreement revision -- the general terms as
    published today, no deviation -- are one transaction in the database
    (`create_recurring_service`): a service never exists without the record
    of which terms it began under. A deviation from the offer is the
    admin's to add afterwards, with its source.
  */
  const admin = await requireAdmin();
  const db = await adminDb();
  const result = await createRecurringServiceWithAgreement(
    db,
    {
      customerId: input.customerId,
      name: input.name,
      description: input.description,
      amountCents: input.amountCents,
      vatRate: input.vatRate,
      ...(orNull(input.startsOn) ? { startsOn: input.startsOn! } : {}),
      status: input.status,
      todayKey: toDateKey(new Date()),
    },
    admin.userId,
  );
  if (!result.ok) return referenceFailed(result.error, missingCustomer, "Dienst aanmaken mislukt.");

  revalidatePath(`/admin/klanten/${input.customerId}`);
  revalidatePath("/admin/betalingen");
  return { ok: true, value: result.id };
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

  /*
    A service that collects has its amount, its calendar and its end managed
    through Mollie: the price-change and cancellation flows below. Editing
    those columns here would change our side and not the provider's.
  */
  const { data: current, error: readError } = await db
    .from("recurring_services")
    .select("amount_cents, vat_rate, starts_on, status, mollie_subscription_id")
    .eq("id", id)
    .maybeSingle();
  if (readError) return actionFailed(readError, "Dienst laden mislukt.");
  if (!current) return { ok: false, error: "Deze dienst bestaat niet (meer)." };
  if (current.mollie_subscription_id) {
    const untouched =
      current.amount_cents === input.amountCents &&
      current.vat_rate === input.vatRate &&
      (current.starts_on ?? undefined) === orNull(input.startsOn) &&
      current.status === input.status;
    if (!untouched) {
      return {
        ok: false,
        error: "Voor een dienst met lopende incasso wijzig je het bedrag via ‘Maandbedrag wijzigen’ en stop je via ‘Dienst opzeggen’.",
      };
    }
  }

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

// ------------------------------------------------- price and cancellation

/*
  Changing what a collecting service costs, and ending one. Both write a
  plan; the daily job carries it out on the days the rules name, see
  price-change.ts and cancellation.ts. Both can confirm in writing: the mail
  goes after the plan is written and never undoes it -- a mail that failed
  shows as such, and the admin can see on the customer's record whether the
  confirmation really went.
*/

export type PriceChangeOutcome = {
  effectiveFrom: string;
  reused: boolean;
  mail?: MailResult;
};

export async function scheduleRecurringPriceChange(
  serviceId: string,
  input: { newAmountCents: number; effectiveFrom: string; sendMail: boolean },
): Promise<ActionResult<PriceChangeOutcome>> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };

  try {
    const admin = await requireAdmin();
    const db = await adminDb();
    const todayKey = toDateKey(new Date());
    const result = await schedulePriceChange(
      db,
      serviceId,
      { newAmountCents: input.newAmountCents, effectiveFrom: input.effectiveFrom },
      todayKey,
      admin.userId,
    );
    if (!result.ok) return { ok: false, error: result.reason };

    let mail: MailResult | undefined;
    if (input.sendMail && !result.reused) {
      const addressed = await resolveCustomerRecipient(db, service.customerId);
      mail = addressed.ok
        ? await sendPriceChangeMail({
            log: { db, customerId: service.customerId, category: "recurring_price_change", recurringServiceId: service.id },
            recipient: addressed.recipient,
            content: {
              serviceName: service.name,
              oldNetCents: result.change.oldAmountCents,
              oldGrossCents: result.oldGrossCents,
              newNetCents: result.change.newAmountCents,
              newGrossCents: result.newGrossCents,
              vatRate: service.vatRate,
              effectiveFrom: result.change.effectiveFrom,
              // The first period at the new price is an unbilled period
              // start, so it is also the first collection at that price.
              firstDebitOn: result.change.effectiveFrom,
            },
          })
        : { sent: false, reason: addressed.reason };
    }

    revalidateCustomer(service.customerId);
    if (service.projectId) revalidatePath(`/admin/projecten/${service.projectId}`);
    return { ok: true, value: { effectiveFrom: result.change.effectiveFrom, reused: result.reused, ...(mail ? { mail } : {}) } };
  } catch (error) {
    console.error("Could not schedule a price change", { serviceId, error });
    return failure(error, "De prijswijziging kon niet worden gepland.");
  }
}

export async function withdrawRecurringPriceChange(serviceId: string, changeId: string): Promise<ActionResult> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };

  try {
    const db = await adminDb();
    // Only this service's change: a change id from another service is refused.
    const owned = (await listPriceChangesForService(db, serviceId)).some((change) => change.id === changeId);
    if (!owned) return { ok: false, error: "Deze prijswijziging hoort niet bij deze dienst." };

    const result = await withdrawPriceChange(db, changeId);
    if (!result.ok) return { ok: false, error: result.reason };
    revalidateCustomer(service.customerId);
    return { ok: true };
  } catch (error) {
    console.error("Could not withdraw a price change", { serviceId, changeId, error });
    return failure(error, "De prijswijziging kon niet worden ingetrokken.");
  }
}

export type CancellationOutcome = {
  endsOn: string;
  lastDebitOn: string;
  reused: boolean;
  providerCanceledNow: boolean;
  mail?: MailResult;
};

export async function cancelRecurringService(
  serviceId: string,
  input: { endsOn?: string; deviation?: CancellationDeviation; sendMail: boolean },
): Promise<ActionResult<CancellationOutcome>> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };
  if (input.endsOn !== undefined && !isDateKey(input.endsOn)) return { ok: false, error: "De einddatum is geen geldige datum." };

  try {
    const admin = await requireAdmin();
    const db = await adminDb();
    const todayKey = toDateKey(new Date());
    const result = await requestCancellation(
      db,
      serviceId,
      { ...(input.endsOn ? { endsOn: input.endsOn } : {}), ...(input.deviation ? { deviation: input.deviation } : {}) },
      todayKey,
      admin.userId,
    );
    if (!result.ok) return { ok: false, error: result.reason };

    let mail: MailResult | undefined;
    if (input.sendMail && !result.reused) {
      const addressed = await resolveCustomerRecipient(db, service.customerId);
      mail = addressed.ok
        ? await sendCancellationMail({
            log: { db, customerId: service.customerId, category: "recurring_cancellation", recurringServiceId: service.id },
            recipient: addressed.recipient,
            content: cancellationMailContent(service.name, service.vatRate, result.plan),
          })
        : { sent: false, reason: addressed.reason };
    }

    revalidateCustomer(service.customerId);
    if (service.projectId) revalidatePath(`/admin/projecten/${service.projectId}`);
    return {
      ok: true,
      value: {
        endsOn: result.plan.endsOn,
        lastDebitOn: result.plan.lastDebitOn,
        reused: result.reused,
        providerCanceledNow: result.providerCanceledNow,
        ...(mail ? { mail } : {}),
      },
    };
  } catch (error) {
    console.error("Could not cancel a recurring service", { serviceId, error });
    return failure(error, "De opzegging kon niet worden vastgelegd.");
  }
}

function cancellationMailContent(serviceName: string, vatRate: number, plan: CancellationPlan) {
  const fullGross = grossOf(plan.lastTermFullNetCents, vatRate);
  return {
    serviceName,
    monthlyGrossCents: fullGross,
    requestedOn: plan.requestedOn,
    endsOn: plan.endsOn,
    lastTerm: {
      start: plan.lastTerm.period.start,
      end: plan.lastTerm.partial ? plan.endsOn : plan.lastTerm.period.end,
      partial: plan.lastTerm.partial,
      daysUsed: plan.lastTerm.daysUsed,
      periodDays: plan.lastTerm.periodDays,
      // Announced in full before the cancellation: collected as announced.
      grossCents: plan.creditDue ? fullGross : plan.lastTermGrossCents,
    },
    ...(plan.creditDue ? { creditDue: { days: plan.creditDue.days, grossCents: plan.creditDue.grossCents } } : {}),
    collectionsAhead: plan.collectionsAhead,
  };
}

export async function withdrawRecurringCancellation(serviceId: string): Promise<ActionResult> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };

  try {
    const result = await withdrawCancellation(await adminDb(), serviceId, toDateKey(new Date()));
    if (!result.ok) return { ok: false, error: result.reason };
    revalidateCustomer(service.customerId);
    if (service.projectId) revalidatePath(`/admin/projecten/${service.projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("Could not withdraw a cancellation", { serviceId, error });
    return failure(error, "De opzegging kon niet worden ingetrokken.");
  }
}

// ------------------------------------------------------------- agreements

/**
 * "Afspraken bewerken": a new revision of the service's contract terms,
 * superseding the one the admin edited from. The rules -- a deviation needs
 * a non-standard source and an acceptance date, the effective date never
 * goes back, one successor per revision -- are checked in
 * `recordAgreementRevision` and again by the database.
 */
export async function saveServiceAgreement(
  serviceId: string,
  input: ServiceAgreementInput,
): Promise<ActionResult<ServiceAgreementRevision>> {
  const service = await getRecurringService(serviceId);
  if (!service) return { ok: false, error: "Deze dienst bestaat niet (meer)." };

  try {
    const admin = await requireAdmin();
    const db = await adminDb();
    const result = await recordAgreementRevision(db, serviceId, input, admin.userId);
    if (!result.ok) return { ok: false, error: result.reason };
    revalidateCustomer(service.customerId);
    revalidatePath(`/admin/betalingen/incassos/${serviceId}`);
    if (service.projectId) revalidatePath(`/admin/projecten/${service.projectId}`);
    return { ok: true, value: result.revision };
  } catch (error) {
    console.error("Could not record an agreement revision", { serviceId, error });
    return failure(error, "De afspraken konden niet worden vastgelegd.");
  }
}
