import { adminDb } from "@/lib/admin/db";
import { activationStatus, type ActivationStatus } from "@/lib/payments/activation-decision";
import { serviceActivatedBy } from "@/lib/payments/pay-link";
import { listRecurringServicesForCustomer } from "@/lib/payments/repository";
import type { RecurringService } from "@/lib/payments/types";

/**
 * What the admin screens show about switching a monthly service on.
 *
 * Deliberately answered from our own administration rather than from Mollie.
 * Rendering a page must not depend on a provider being reachable, and the
 * mandate we recorded is the one we act on. The authoritative question -- does
 * a usable mandate exist right now -- is asked of Mollie at the two moments it
 * changes anything: creating the payment link, and handling the webhook.
 */
async function mandateByCustomer(customerIds: string[]): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  const db = await adminDb();
  const { data, error } = await db
    .from("customer_payment_providers")
    .select("customer_id, provider_mandate_id")
    .in("customer_id", customerIds)
    .not("provider_mandate_id", "is", null);
  if (error) throw new Error(`Machtigingen laden: ${error.message}`);
  return new Set((data ?? []).map((row) => row.customer_id));
}

/** The one-off invoices these services hang off, by id. */
async function activationInvoices(invoiceIds: string[]): Promise<Map<string, ActivationInvoice>> {
  if (invoiceIds.length === 0) return new Map();
  const db = await adminDb();
  const { data, error } = await db.from("invoices").select("id, number_value, status").in("id", invoiceIds);
  if (error) throw new Error(`Facturen laden: ${error.message}`);
  return new Map(
    (data ?? []).map((row) => [row.id, { id: row.id, number: row.number_value, paid: row.status === "paid" }]),
  );
}

/** The one-off invoice whose payment switches a service on. */
export type ActivationInvoice = { id: string; number: string; paid: boolean };

export type ActivationSummary = { status: ActivationStatus; invoice?: ActivationInvoice };

/**
 * The three sentences the admin reads about a service, for every service in a
 * list: is the one-off invoice paid, what does the service cost per month, and
 * where has the collection got to. One query per fact, not one per service.
 */
export async function activationSummaries(services: RecurringService[]): Promise<Record<string, ActivationSummary>> {
  const [mandates, invoices] = await Promise.all([
    mandateByCustomer([...new Set(services.map((service) => service.customerId))]),
    activationInvoices(services.flatMap((service) => (service.activationInvoiceId ? [service.activationInvoiceId] : []))),
  ]);

  return Object.fromEntries(
    services.map((service) => {
      const invoice = service.activationInvoiceId ? invoices.get(service.activationInvoiceId) : undefined;
      return [
        service.id,
        {
          status: activationStatus({
            service,
            hasUsableMandate: mandates.has(service.customerId),
            activationInvoicePaid: invoice?.paid ?? false,
          }),
          ...(invoice ? { invoice } : {}),
        },
      ];
    }),
  );
}

export type InvoiceActivationView = {
  /** The service this invoice switches on, if one is linked. */
  attached?: RecurringService;
  status: ActivationStatus;
  /** Services of this customer that an invoice could still switch on. */
  candidates: RecurringService[];
};

export async function invoiceActivation(invoice: {
  id: string;
  customerId: string;
  status: string;
}): Promise<InvoiceActivationView> {
  const [attached, all] = await Promise.all([
    serviceActivatedBy(invoice.id),
    listRecurringServicesForCustomer(invoice.customerId),
  ]);

  const mandates = await mandateByCustomer([invoice.customerId]);
  const status = activationStatus({
    service: attached,
    hasUsableMandate: mandates.has(invoice.customerId),
    activationInvoicePaid: invoice.status === "paid",
  });

  /*
    A service already collecting has nothing left to authorise, and one tied to
    another invoice is that invoice's business -- offering either here would
    only move a link that is already doing its job.
  */
  const candidates = all.filter(
    (service) =>
      service.status !== "canceled" &&
      !service.mollie.subscriptionId &&
      (!service.activationInvoiceId || service.activationInvoiceId === invoice.id),
  );

  return { ...(attached ? { attached } : {}), status, candidates };
}
