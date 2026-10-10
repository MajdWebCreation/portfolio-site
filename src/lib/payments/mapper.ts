import type {
  CustomerPaymentProvider,
  DebitPrenotification,
  PrenotificationStatus,
  PaymentProvider,
  Payment,
  PaymentSource,
  PaymentStatus,
  PriceChange,
  RecurringService,
  RecurringStatus,
} from "@/lib/payments/types";
import type { ProrationRule } from "@/lib/payments/pricing";
import type { AgreementSourceKind, ServiceAgreementRevision } from "@/lib/payments/service-agreement";
import type { Database } from "@/lib/supabase/database.types";

export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
/*
  The claim columns are the start-subscription lock, read and written only by
  `collection-start.ts`; the domain object has no use for them.
*/
export type RecurringServiceRow = Omit<
  Database["public"]["Tables"]["recurring_services"]["Row"],
  "subscription_claim_id" | "subscription_claimed_at" | "cancellation_requested_by"
>;
export type CustomerPaymentProviderRow = Database["public"]["Tables"]["customer_payment_providers"]["Row"];
export type PriceChangeRow = Database["public"]["Tables"]["recurring_price_changes"]["Row"];
export type DebitPrenotificationRow = Database["public"]["Tables"]["debit_prenotifications"]["Row"];
export type ServiceAgreementRow = Database["public"]["Tables"]["recurring_service_agreements"]["Row"];

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
      ...(row.subscription_canceled_at ? { subscriptionCanceledAt: row.subscription_canceled_at } : {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.starts_on ? { startsOn: row.starts_on } : {}),
    ...(row.ends_on ? { endsOn: row.ends_on } : {}),
    ...(row.cancellation_requested_at ? { cancellationRequestedAt: row.cancellation_requested_at } : {}),
    ...(row.cancellation_requested_at &&
    row.cancellation_notice_months !== null &&
    row.cancellation_contractual_ends_on &&
    row.cancellation_source &&
    row.cancellation_proration_rule
      ? {
          cancellation: {
            noticeMonths: row.cancellation_notice_months,
            ...(row.cancellation_minimum_term_months !== null ? { minimumTermMonths: row.cancellation_minimum_term_months } : {}),
            ...(row.cancellation_minimum_term_ends_on ? { minimumTermEndsOn: row.cancellation_minimum_term_ends_on } : {}),
            contractualEndsOn: row.cancellation_contractual_ends_on,
            source: row.cancellation_source,
            prorationRule: row.cancellation_proration_rule as ProrationRule,
            ...(row.cancellation_agreement_revision_id ? { agreementRevisionId: row.cancellation_agreement_revision_id } : {}),
            ...(row.cancellation_deviation_source_kind && row.cancellation_deviation_source_label && row.cancellation_deviation_agreed_on && row.cancellation_deviation_reason
              ? {
                  deviation: {
                    sourceKind: row.cancellation_deviation_source_kind as "accepted_offer" | "later_written_amendment",
                    sourceLabel: row.cancellation_deviation_source_label,
                    agreedOn: row.cancellation_deviation_agreed_on,
                    reason: row.cancellation_deviation_reason,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(row.last_term_amount_cents !== null && row.last_term_synced_at
      ? { lastTerm: { amountCents: row.last_term_amount_cents, syncedAt: row.last_term_synced_at } }
      : {}),
    ...(row.lifecycle_problem ? { lifecycleProblem: row.lifecycle_problem } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.activation_invoice_id ? { activationInvoiceId: row.activation_invoice_id } : {}),
  };
}

export function priceChangeFromRow(row: PriceChangeRow): PriceChange {
  return {
    id: row.id,
    recurringServiceId: row.recurring_service_id,
    customerId: row.customer_id,
    oldAmountCents: row.old_amount_cents,
    newAmountCents: row.new_amount_cents,
    effectiveFrom: row.effective_from,
    requestedAt: row.requested_at,
    ...(row.requested_by ? { requestedBy: row.requested_by } : {}),
    ...(row.provider_updated_at ? { providerUpdatedAt: row.provider_updated_at } : {}),
    ...(row.applied_at ? { appliedAt: row.applied_at } : {}),
    ...(row.canceled_at ? { canceledAt: row.canceled_at } : {}),
    ...(row.canceled_reason ? { canceledReason: row.canceled_reason as PriceChange["canceledReason"] } : {}),
    ...(row.rescheduled_from ? { rescheduledFrom: row.rescheduled_from } : {}),
    ...(row.reschedule_reason ? { rescheduleReason: row.reschedule_reason } : {}),
    ...(row.blocked_at ? { blockedAt: row.blocked_at } : {}),
    ...(row.blocked_reason ? { blockedReason: row.blocked_reason } : {}),
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

export function prenotificationFromRow(row: DebitPrenotificationRow): DebitPrenotification {
  return {
    id: row.id,
    recurringServiceId: row.recurring_service_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id,
    billingPeriodStart: row.billing_period_start,
    billingPeriodEnd: row.billing_period_end,
    scheduledDebitOn: row.scheduled_debit_on,
    amountCents: row.amount_cents,
    recipientEmail: row.recipient_email,
    status: row.status as PrenotificationStatus,
    createdAt: row.created_at,
    ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
  };
}

export function agreementRevisionFromRow(row: ServiceAgreementRow): ServiceAgreementRevision {
  return {
    id: row.id,
    recurringServiceId: row.recurring_service_id,
    customerId: row.customer_id,
    sequence: row.sequence,
    effectiveFrom: row.effective_from,
    sourceKind: row.source_kind as AgreementSourceKind,
    sourceLabel: row.source_label,
    specialTerms: row.special_terms,
    ...(row.terms_edition && row.terms_published_on ? { terms: { edition: row.terms_edition, publishedOn: row.terms_published_on } } : {}),
    note: row.note,
    createdAt: row.created_at,
    ...(row.supersedes_id ? { supersedesId: row.supersedes_id } : {}),
    ...(row.source_quote_id ? { sourceQuoteId: row.source_quote_id } : {}),
    ...(row.accepted_on ? { acceptedOn: row.accepted_on } : {}),
    ...(row.notice_months !== null ? { noticeMonths: row.notice_months } : {}),
    ...(row.minimum_term_months !== null ? { minimumTermMonths: row.minimum_term_months } : {}),
    ...(row.proration_rule ? { prorationRule: row.proration_rule as ProrationRule } : {}),
    ...(row.created_by ? { createdBy: row.created_by } : {}),
  };
}
