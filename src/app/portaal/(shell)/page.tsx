import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentList, DocumentRow, Empty, PageHeader, Section } from "@/components/portal/portal-ui";
import { toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { portalOverview } from "@/lib/portal/dashboard";
import { portalInvoiceStateLabels, portalInvoiceStateTone, portalInvoiceView } from "@/lib/portal/invoices/model";
import { readPortalInvoices } from "@/lib/portal/invoices/read";
import { portalInvoicePath, portalInvoicesPath, portalQuotePath, portalQuotesPath, portalServicesPath } from "@/lib/portal/paths";
import { readPortalQuotes } from "@/lib/portal/quotes/read";
import { portalServiceView } from "@/lib/portal/services/model";
import { readPortalServices } from "@/lib/portal/services/read";

export const metadata: Metadata = { title: "Overzicht" };

const recentKindLabels = { invoice: "Factuur", quote: "Offerte", credit_note: "Creditnota" } as const;

/**
 * Where things stand for the customer this visit is about: what is still
 * to be paid, the next direct debit, the offers waiting for an answer, and
 * the latest documents. Every figure comes from the same reads as the
 * section pages, through the same ledger and schedules.
 */
export default async function PortalHomePage() {
  const member = await requirePortalMember();
  const customerId = member.current.customerId;
  const todayKey = toDateKey(new Date());

  const [invoices, quotes, services] = await orNoAccess(
    Promise.all([readPortalInvoices(customerId), readPortalQuotes(customerId), readPortalServices(customerId)]),
  );
  const overview = portalOverview({
    invoices: invoices.map((invoice) => portalInvoiceView(invoice, todayKey)),
    quotes,
    services: services.map((service) => portalServiceView(service, todayKey)),
    todayKey,
  });
  const next = overview.nextCollection;

  return (
    <div>
      <PageHeader label="Overzicht" title={member.current.companyName} />

      <dl className="mt-10 grid gap-px border-y border-line bg-line sm:grid-cols-3">
        <div className="bg-paper py-5 sm:pr-6">
          <dt className="label-mono text-muted">Openstaand</dt>
          <dd className="mt-2 font-medium text-ink">
            <span className="tabular text-[1.6rem] leading-none">{formatCents(overview.invoices.openCents)}</span>
            <span className="mt-2 block text-[0.86rem] font-normal text-muted">
              {overview.invoices.openCount === 0
                ? "Er staat niets open."
                : `${overview.invoices.openCount} ${overview.invoices.openCount === 1 ? "factuur" : "facturen"}${
                    overview.invoices.overdueCount > 0 ? `, waarvan ${overview.invoices.overdueCount} vervallen` : ""
                  }`}
            </span>
          </dd>
        </div>
        <div className="bg-paper py-5 sm:px-6">
          <dt className="label-mono text-muted">Volgende incasso</dt>
          <dd className="mt-2 font-medium text-ink">
            {next ? (
              <>
                <span className="tabular text-[1.6rem] leading-none">{formatCents(next.next.grossCents)}</span>
                <span className="mt-2 block text-[0.86rem] font-normal text-muted">
                  {day(next.next.debitOn)} · {next.service.name}
                </span>
              </>
            ) : (
              <span className="block text-[0.95rem] font-normal text-muted">Er staat geen incasso gepland.</span>
            )}
          </dd>
        </div>
        <div className="bg-paper py-5 sm:pl-6">
          <dt className="label-mono text-muted">Offertes</dt>
          <dd className="mt-2 font-medium text-ink">
            <span className="tabular text-[1.6rem] leading-none">{overview.awaitingQuotes.length}</span>
            <span className="mt-2 block text-[0.86rem] font-normal text-muted">
              {overview.awaitingQuotes.length === 1 ? "wacht op uw reactie" : "wachten op uw reactie"}
            </span>
          </dd>
        </div>
      </dl>

      {overview.openInvoices.length > 0 ? (
        <Section title="Te betalen">
          <DocumentList>
            {overview.openInvoices.map((view) => (
              <DocumentRow
                key={view.invoice.id}
                href={portalInvoicePath(view.invoice.id)}
                number={view.invoice.number}
                meta={`Vervaldatum ${day(view.invoice.dueDate)}`}
                amount={formatCents(view.openCents)}
                badge={<StatusBadge tone={portalInvoiceStateTone[view.state]}>{portalInvoiceStateLabels[view.state]}</StatusBadge>}
              />
            ))}
          </DocumentList>
          <p className="mt-3 text-[0.86rem] text-muted">
            Betalen kan via de betaallink in de factuurmail of per bankoverschrijving onder vermelding van het kenmerk op de factuur.
          </p>
        </Section>
      ) : null}

      {overview.awaitingQuotes.length > 0 ? (
        <Section title="Wacht op uw reactie">
          <DocumentList>
            {overview.awaitingQuotes.map((quote) => (
              <DocumentRow
                key={quote.id}
                href={portalQuotePath(quote.id)}
                number={quote.number}
                meta={`${quote.subject} · geldig tot ${day(quote.validUntil)}`}
              />
            ))}
          </DocumentList>
        </Section>
      ) : null}

      <Section title="Recente documenten">
        {overview.recent.length === 0 ? (
          <Empty>Er staan nog geen documenten voor u klaar.</Empty>
        ) : (
          <DocumentList>
            {overview.recent.map((item) => (
              <DocumentRow key={`${item.kind}-${item.id}`} href={item.href} number={item.number} meta={`${recentKindLabels[item.kind]} · ${day(item.date)}`} />
            ))}
          </DocumentList>
        )}
      </Section>

      <p className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[0.95rem]">
        <Link href={portalInvoicesPath} className="link-static text-ink">
          Alle facturen
        </Link>
        <Link href={portalQuotesPath} className="link-static text-ink">
          Alle offertes
        </Link>
        <Link href={portalServicesPath} className="link-static text-ink">
          {overview.activeServices > 0 ? `Diensten (${overview.activeServices} actief)` : "Diensten"}
        </Link>
      </p>
    </div>
  );
}
