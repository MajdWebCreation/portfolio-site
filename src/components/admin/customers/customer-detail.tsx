import Link from "next/link";
import AdminSection from "@/components/admin/admin-section";
import CustomerDocuments from "@/components/admin/customers/customer-documents";
import CustomerEdit from "@/components/admin/customers/customer-edit";
import CustomerFinance from "@/components/admin/customers/customer-finance";
import CustomerProjects from "@/components/admin/customers/customer-projects";
import CustomerRecurring from "@/components/admin/customers/customer-recurring";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import { customerStatusLabels, customerStatusTone, type Customer } from "@/lib/admin/customers/types";
import { formatDateTime } from "@/lib/admin/format";
import { inquiryOriginLabels, type Inquiry } from "@/lib/admin/inquiries/types";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { Lead } from "@/lib/admin/leads/types";
import type { Project } from "@/lib/admin/projects/types";
import type { ActivationSummary } from "@/lib/payments/activation-view";
import type { CustomerFinancials } from "@/lib/payments/customer-status";
import type { RecurringOverview } from "@/lib/payments/prenotification";
import type { RecurringService } from "@/lib/payments/types";
import type { Quote } from "@/lib/admin/quotes/types";

type CustomerDetailProps = {
  customer: Customer;
  /** The inquiry this customer came from, when it exists. */
  sourceInquiry?: Inquiry;
  /** The lead this customer came from, when it exists. */
  sourceLead?: Lead;
  quotes: Quote[];
  invoices: Invoice[];
  projects: Project[];
  /** Derived from this customer's invoices and payments; never a stored field. */
  financials: CustomerFinancials;
  recurringServices: RecurringService[];
  /** Next collection and announcement state per service; derived, never stored. */
  recurringOverviews: Record<string, RecurringOverview>;
  /** How far the one-off invoice and the mandate have got, per service. */
  recurringActivations: Record<string, ActivationSummary>;
  /** Today in Amsterdam, for the deadline states. */
  todayKey: string;
};

function Dash() {
  return <span className="text-muted">—</span>;
}

/** Customer record with its projects, quotes and invoices. */
export default function CustomerDetail({
  customer,
  sourceInquiry,
  sourceLead,
  quotes,
  invoices,
  projects,
  financials,
  recurringServices,
  recurringOverviews,
  recurringActivations,
  todayKey,
}: CustomerDetailProps) {
  const { address } = customer;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection id="customer" title="Bedrijf en contact">
          <DetailList>
            <DetailRow term="Bedrijf">{customer.companyName}</DetailRow>
            <DetailRow term="Contactpersoon">{customer.contactName}</DetailRow>
            <DetailRow term="E-mail">
              <a href={`mailto:${customer.email}`} className="link-static">
                {customer.email}
              </a>
            </DetailRow>
            <DetailRow term="Telefoon">
              {customer.phone ? (
                <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="link-static tabular">
                  {customer.phone}
                </a>
              ) : (
                <Dash />
              )}
            </DetailRow>
            <DetailRow term="Status">
              <StatusBadge tone={customerStatusTone[customer.status]}>{customerStatusLabels[customer.status]}</StatusBadge>
            </DetailRow>
            <DetailRow term="Klant sinds">{formatDateTime(customer.createdAt)}</DetailRow>
          </DetailList>
        </AdminSection>

        <AdminSection id="billing" title="Adres en identificatie" note="Voor offertes en facturen">
          <DetailList>
            <DetailRow term="Adres">
              {address.street}
              <span className="block">
                {address.postalCode} {address.city}
              </span>
              <span className="block">{address.country}</span>
            </DetailRow>
            <DetailRow term="KvK-nummer">{customer.kvkNumber ?? <Dash />}</DetailRow>
            <DetailRow term="Btw-nummer">{customer.vatNumber ?? <Dash />}</DetailRow>
          </DetailList>
        </AdminSection>

        <CustomerEdit customer={customer} />
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <div>
          <h2 className="label-mono text-ink">Herkomst</h2>
          {sourceInquiry ? (
            <p className="mt-3 text-[0.9rem] leading-snug">
              <Link href={`/admin/aanvragen/${sourceInquiry.id}`} className="link-static text-ink">
                {inquiryOriginLabels[sourceInquiry.origin]} van {formatDateTime(sourceInquiry.receivedAt)}
              </Link>
            </p>
          ) : sourceLead ? (
            <p className="mt-3 text-[0.9rem] leading-snug">
              <Link href={`/admin/leads/${sourceLead.id}`} className="link-static text-ink">
                Lead {sourceLead.companyName}
              </Link>
            </p>
          ) : (
            <p className="mt-3 text-[0.9rem] text-muted">Niet gekoppeld aan een aanvraag of lead.</p>
          )}
        </div>

        <div className="border-t border-line pt-6">
          <h2 className="label-mono text-ink">Aanvragen</h2>
          {sourceInquiry ? (
            <p className="mt-3 text-[0.9rem] text-muted">Eén aanvraag, zie herkomst.</p>
          ) : (
            <p className="mt-3 text-[0.9rem] text-muted">Geen aanvragen gekoppeld.</p>
          )}
        </div>

        <CustomerFinance financials={financials} />

        <CustomerProjects customerId={customer.id} projects={projects} todayKey={todayKey} />

        <CustomerRecurring
          customerId={customer.id}
          services={recurringServices}
          overviews={recurringOverviews}
          activations={recurringActivations}
        />

        <CustomerDocuments customerId={customer.id} quotes={quotes} invoices={invoices} />
      </aside>
    </div>
  );
}
