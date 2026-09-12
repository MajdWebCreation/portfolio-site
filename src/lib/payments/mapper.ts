import type {
  CustomerPaymentProvider,
  PaymentProvider,
  Payment,
  PaymentSource,
  PaymentStatus,
  RecurringService,
  RecurringStatus,
} from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
export type RecurringServiceRow = Database["public"]["Tables"]["recurring_services"]["Row"];
export type CustomerPaymentProviderRow = Database["public"]["Tables"]["customer_payment_providers"]["Row"];

export function paymentFromRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    customerId: row.customer_id,
    amountCents: row.amount_cents,
    currency: "EUR",
    status: row.status as PaymentStatus,
    source: row.source as PaymentSource,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.provider_payment_id ? { providerPaymentId: row.provider_payment_id } : {}),
    ...(row.method ? { method: row.method } : {}),
    ...(row.paid_at ? { paidAt: row.paid_at } : {}),
  };
}

export function recurringServiceFromRow(row: RecurringServiceRow): RecurringService {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    description: row.description,
    amountCents: row.amount_cents,
    currency: "EUR",
    vatRate: row.vat_rate,
    interval: "monthly",
    status: row.status as RecurringStatus,
    mollie: {
      ...(row.mollie_subscription_id ? { subscriptionId: row.mollie_subscription_id } : {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.starts_on ? { startsOn: row.starts_on } : {}),
  };
}

export function customerPaymentProviderFromRow(row: CustomerPaymentProviderRow): CustomerPaymentProvider {
  return {
    id: row.id,
    customerId: row.customer_id,
    provider: row.provider as PaymentProvider,
    providerCustomerId: row.provider_customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.provider_mandate_id ? { providerMandateId: row.provider_mandate_id } : {}),
  };
}
