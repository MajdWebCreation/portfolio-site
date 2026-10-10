import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import StatusBadge from "@/components/admin/status-badge";
import AttentionList from "@/components/admin/payments/attention-list";
import CollectionsTable from "@/components/admin/payments/collections-table";
import CreditNotesTable from "@/components/admin/payments/credit-notes-table";
import FinanceSummaryRow from "@/components/admin/payments/finance-summary";
import FinanceTabs, { financeHref, isFinanceTab, type FinanceTab } from "@/components/admin/payments/finance-tabs";
import InvoiceTable from "@/components/admin/payments/invoice-table";
import MollieCheck from "@/components/admin/payments/mollie-check";
import { requireAdminAccess } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import { mollieMode } from "@/lib/mollie/config";
import { formatCents } from "@/lib/money";
import { loadFinanceOverview } from "@/lib/payments/finance-loader";
import { upcomingCollections } from "@/lib/payments/finance-overview";
import { prenotificationStateLabels, prenotificationStateTone } from "@/lib/payments/prenotification";

export const metadata: Metadata = { title: "Betalingen" };

type PageProps = { searchParams: Promise<{ tab?: string | string[]; klant?: string | string[] }> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

/**
 * The financial administration, in four sections and nowhere else: what
 * needs attention, every invoice, every monthly collection, every credit
 * note with its refunds. The customer page keeps a summary and a link here;
 * the detail of money lives on this page.
 */
export default async function PaymentsPage({ searchParams }: PageProps) {
  await requireAdminAccess();
  const params = await searchParams;
  const requestedTab = first(params.tab);
  const tab: FinanceTab = isFinanceTab(requestedTab) ? requestedTab : "overzicht";
  const customerId = first(params.klant)?.trim() || undefined;

  const { overview, customers, todayKey } = await loadFinanceOverview(customerId);
  const customer = customerId ? customers.find((item) => item.id === customerId) : undefined;
  const { summary } = overview;

  const counts = {
    overzicht: overview.attention.length,
    facturen: overview.invoices.filter((row) => row.outstandingCents > 0).length,
    incassos: overview.collections.filter((row) => row.bucket === "active" || row.bucket === "ending" || row.bucket === "problem").length,
    creditnotas: overview.creditNotes.filter((row) => row.unfinished || row.state === "refund_due" || row.state === "in_progress").length,
  };
  const upcoming = upcomingCollections(overview.collections).slice(0, 8);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Betalingen"
        text={
          customer
            ? `Alleen ${customer.companyName}. ${formatCents(summary.outstandingCents)} openstaand${summary.overdueCents > 0 ? `, waarvan ${formatCents(summary.overdueCents)} achterstallig` : ""}.`
            : `${formatCents(summary.outstandingCents)} openstaand${summary.overdueCents > 0 ? `, waarvan ${formatCents(summary.overdueCents)} achterstallig` : ""}.`
        }
        actions={
          customer ? (
            <>
              <Link href={`/admin/klanten/${customer.id}`} className="link-static text-[0.92rem] text-ink">
                Naar klant
              </Link>
              <Link href={financeHref(tab)} className="link-static text-[0.92rem] text-ink">
                Alle klanten
              </Link>
            </>
          ) : undefined
        }
      />

      <FinanceSummaryRow summary={summary} />

      <FinanceTabs active={tab} customerId={customerId} counts={counts} />

      {tab === "overzicht" ? (
        <div className="space-y-10">
          <AdminSection id="attention" title="Wat vraagt aandacht" note={overview.attention.length > 0 ? `${overview.attention.length} ${overview.attention.length === 1 ? "punt" : "punten"}` : undefined}>
            <AttentionList items={overview.attention} />
          </AdminSection>

          <AdminSection id="upcoming" title="Komende automatische incasso's" note={upcoming.length > 0 ? "Eerstvolgende acht" : undefined}>
            {upcoming.length === 0 ? (
              <p className="text-[0.95rem] text-muted">Geen incasso&apos;s gepland.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {upcoming.map((row) => (
                  <li key={row.service.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[0.92rem]">
                    <span className="min-w-0">
                      <Link href={`/admin/betalingen/incassos/${row.service.id}`} className="link-static block truncate font-medium text-ink">
                        {row.service.name}
                      </Link>
                      <span className="block text-[0.83rem] text-muted">
                        {row.customerName} · {day(row.overview.debitOn!)} · {formatCents(row.overview.amountCents ?? 0)} incl. btw
                      </span>
                    </span>
                    <StatusBadge tone={prenotificationStateTone[row.overview.state]}>{prenotificationStateLabels[row.overview.state]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>

          {/* The key itself never leaves the server; only which mode it is in. */}
          {!customer ? (
            <AdminSection id="mollie" title="Mollie-koppeling">
              <MollieCheck mode={mollieMode()} />
            </AdminSection>
          ) : null}
        </div>
      ) : null}

      {tab === "facturen" ? (
        <AdminSection id="invoices" title="Facturen" note="Definitieve facturen; concepten staan onder Facturen">
          <InvoiceTable rows={overview.invoices} customers={customers} customerId={customerId} />
        </AdminSection>
      ) : null}

      {tab === "incassos" ? (
        <AdminSection id="collections" title="Incasso's" note="Terugkerende diensten en hun maandelijkse incasso">
          <CollectionsTable rows={overview.collections} customers={customers} customerId={customerId} todayKey={todayKey} />
        </AdminSection>
      ) : null}

      {tab === "creditnotas" ? (
        <AdminSection id="credit-notes" title="Creditnota's & refunds" note={summary.refundDueCents > 0 ? `${formatCents(summary.refundDueCents)} nog terug te betalen` : undefined}>
          <CreditNotesTable rows={overview.creditNotes} customers={customers} customerId={customerId} />
        </AdminSection>
      ) : null}
    </div>
  );
}
