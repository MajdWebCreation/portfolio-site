import type { Metadata } from "next";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentList, DocumentRow, Empty, PageHeader } from "@/components/portal/portal-ui";
import { toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { portalQuotePath } from "@/lib/portal/paths";
import { portalQuoteState, portalQuoteStateLabels, portalQuoteStateTone, quoteTotals } from "@/lib/portal/quotes/model";
import { readPortalQuotes } from "@/lib/portal/quotes/read";

export const metadata: Metadata = { title: "Offertes" };

/** Every quote that was sent to this customer as a document, newest first. */
export default async function PortalQuotesPage() {
  const member = await requirePortalMember();
  const todayKey = toDateKey(new Date());
  const quotes = await orNoAccess(readPortalQuotes(member.current.customerId));

  return (
    <div>
      <PageHeader label="Offertes" title="Uw offertes" />

      <div className="mt-10">
        {quotes.length === 0 ? (
          <Empty>Er zijn nog geen offertes aan u verstuurd.</Empty>
        ) : (
          <DocumentList>
            {quotes.map((quote) => {
              const state = portalQuoteState(quote, todayKey);
              return (
                <DocumentRow
                  key={quote.id}
                  href={portalQuotePath(quote.id)}
                  number={quote.number}
                  meta={`${quote.subject} · ${day(quote.issueDate)}`}
                  amount={formatCents(quoteTotals(quote).totalCents)}
                  badge={<StatusBadge tone={portalQuoteStateTone[state]}>{portalQuoteStateLabels[state]}</StatusBadge>}
                />
              );
            })}
          </DocumentList>
        )}
      </div>
    </div>
  );
}
