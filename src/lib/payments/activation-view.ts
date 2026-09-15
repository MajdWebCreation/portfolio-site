import { adminDb } from "@/lib/admin/db";
import type { Invoice } from "@/lib/admin/invoices/types";
import { readRecurringServicesForCustomer } from "@/lib/admin/readers";
import { activationStatus, type ActivationStatus } from "@/lib/payments/activation-decision";
import { serviceActivatedBy } from "@/lib/payments/pay-link";
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

/**
 * Which of these customers have a mandate on record. Exported so a page can
 * ask the moment it knows the customer, alongside its other reads, instead of
 * after them; see `ActivationSources`.
 */
export async function mandateByCustomer(customerIds: string[]): Promise<Set<string>> {
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

/** The same three facts, taken from an invoice a page has already read. */
function activationInvoiceOf(invoice: Invoice): ActivationInvoice {
  return { id: invoice.id, number: invoice.number.value, paid: invoice.status === "paid" };
}

/** The one-off invoice whose payment switches a service on. */
export type ActivationInvoice = { id: string; number: string; paid: boolean };

export type ActivationSummary = { status: ActivationStatus; invoice?: ActivationInvoice };

/**
 * What a page already knows when it asks for the summaries, so the answer
 * needs no further round trip.
 *
 * A page learns the customer from its primary record and can read the
 * mandates in the same batch as everything else; the services only arrive
 * with that batch, so without this the mandate read would wait for them.
 * The invoices are the page's own list: the composite foreign key
 * `recurring_services_activation_same_customer` makes a service's activation
 * invoice one of its own customer's invoices, so a customer's list holds every
 * activation invoice its services can name. Anything not covered here -- a
 * service of another customer, an invoice outside the list -- is still read
 * from the database, so the answer is the same whatever is passed in.
 */
export type ActivationSources = {
  /** The customers `mandates` answers for. */
  customerIds: string[];
  /** The result of `mandateByCustomer(customerIds)`. */
  mandates: Set<string>;
  /** Invoices already in hand. */
  invoices?: Invoice[];
};

/**
 * The three sentences the admin reads about a service, for every service in a
 * list: is the one-off invoice paid, what does the service cost per month, and
 * where has the collection got to. One query per fact, not one per service,
 * and none at all when the page already holds the facts.
 */
export async function activationSummaries(
  services: RecurringService[],
  sources?: ActivationSources,
): Promise<Record<string, ActivationSummary>> {
  const customerIds = [...new Set(services.map((service) => service.customerId))];
  const invoiceIds = [
    ...new Set(services.flatMap((service) => (service.activationInvoiceId ? [service.activationInvoiceId] : []))),
  ];

  const knownCustomers = new Set(sources?.customerIds ?? []);
  const knownInvoices = new Map((sources?.invoices ?? []).map((invoice) => [invoice.id, activationInvoiceOf(invoice)]));

  const [readMandates, readInvoices] = await Promise.all([
    mandateByCustomer(customerIds.filter((id) => !knownCustomers.has(id))),
    activationInvoices(invoiceIds.filter((id) => !knownInvoices.has(id))),
  ]);
  const mandates = new Set([...(sources?.mandates ?? []), ...readMandates]);
  const invoices = new Map([...knownInvoices, ...readInvoices]);

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

/**
 * Read by the invoice page, not by actions: the services come through the
 * request-scoped reader, so the page and this function share one query.
 */
export async function invoiceActivation(invoice: {
  id: string;
  customerId: string;
  status: string;
}): Promise<InvoiceActivationView> {
  // Three facts about the invoice and its customer, none depending on another.
  const [attached, all, mandates] = await Promise.all([
    serviceActivatedBy(invoice.id),
    readRecurringServicesForCustomer(invoice.customerId),
    mandateByCustomer([invoice.customerId]),
  ]);

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
