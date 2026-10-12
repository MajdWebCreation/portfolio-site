import type { Metadata } from "next";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentList, DocumentRow, Empty, PageHeader } from "@/components/portal/portal-ui";
import { toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { invoiceSummary, portalInvoiceStateLabels, portalInvoiceStateTone, portalInvoiceView } from "@/lib/portal/invoices/model";
import { readPortalInvoices } from "@/lib/portal/invoices/read";
import { portalInvoicePath } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Facturen" };

/** Every invoice this customer received, newest first, each with what is still open on it. */
export default async function PortalInvoicesPage() {
  const member = await requirePortalMember();
  const todayKey = toDateKey(new Date());
  const views = (await orNoAccess(readPortalInvoices(member.current.customerId))).map((invoice) => portalInvoiceView(invoice, todayKey));
  const summary = invoiceSummary(views);

  return (
    <div>
      <PageHeader label="Facturen" title="Uw facturen">
        {views.length === 0 ? null : summary.openCount === 0 ? (
          <p>Alle facturen zijn voldaan.</p>
        ) : (
          <p>
            Er staat {formatCents(summary.openCents)} open op {summary.openCount} {summary.openCount === 1 ? "factuur" : "facturen"}
            {summary.overdueCount > 0 ? `, waarvan ${formatCents(summary.overdueCents)} na de vervaldatum` : ""}.
          </p>
        )}
      </PageHeader>

      <div className="mt-10">
        {views.length === 0 ? (
          <Empty>Er zijn nog geen facturen aan u verstuurd.</Empty>
        ) : (
          <DocumentList>
            {views.map((view) => (
              <DocumentRow
                key={view.invoice.id}
                href={portalInvoicePath(view.invoice.id)}
                number={view.invoice.number}
                meta={`${day(view.invoice.issueDate)} · vervaldatum ${day(view.invoice.dueDate)}`}
                amount={
                  view.openCents > 0 && view.openCents !== view.ledger.totalCents
                    ? `${formatCents(view.openCents)} van ${formatCents(view.ledger.totalCents)}`
                    : formatCents(view.ledger.totalCents)
                }
                badge={<StatusBadge tone={portalInvoiceStateTone[view.state]}>{portalInvoiceStateLabels[view.state]}</StatusBadge>}
              />
            ))}
          </DocumentList>
        )}
      </div>
    </div>
  );
}
