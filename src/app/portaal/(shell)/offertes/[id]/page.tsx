import type { Metadata } from "next";
import Link from "next/link";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentLines, DownloadLink, PageHeader, Section } from "@/components/portal/portal-ui";
import { toDateKey } from "@/lib/admin/format";
import { orNotFound, requirePortalMember } from "@/lib/portal/access";
import { portalDocumentHref } from "@/lib/portal/documents/read";
import { portalQuotePath, portalQuotesPath } from "@/lib/portal/paths";
import { portalQuoteState, portalQuoteStateLabels, portalQuoteStateTone, quoteTotals } from "@/lib/portal/quotes/model";
import { readPortalQuote } from "@/lib/portal/quotes/read";

export const metadata: Metadata = { title: "Offerte" };

type PageProps = { params: Promise<{ id: string }> };

/**
 * One quote as it was sent: its figures, the general terms it was sent
 * under, and the other versions of the same proposal. The introduction and
 * the closing notes are in the PDF, the document the customer received.
 */
export default async function PortalQuotePage({ params }: PageProps) {
  const member = await requirePortalMember();
  const { id } = await params;
  const todayKey = toDateKey(new Date());
  const quote = await orNotFound(readPortalQuote(member.current.customerId, id));
  const state = portalQuoteState(quote, todayKey);

  return (
    <div>
      <p className="text-[0.9rem]">
        <Link href={portalQuotesPath} className="link-static text-muted">
          ← Offertes
        </Link>
      </p>
      <div className="mt-6">
        <PageHeader label="Offerte" title={quote.number}>
          <p>{quote.subject}</p>
        </PageHeader>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <StatusBadge tone={portalQuoteStateTone[state]}>{portalQuoteStateLabels[state]}</StatusBadge>
        <DownloadLink href={portalDocumentHref("quote", quote.id)}>Offerte downloaden (PDF)</DownloadLink>
      </div>

      {quote.supersededBy ? (
        <p className="mt-6 border-l-2 border-accent pl-4 text-[0.95rem]">
          Deze offerte is vervangen door{" "}
          <Link href={portalQuotePath(quote.supersededBy.id)} className="link-static text-ink">
            {quote.supersededBy.number}
          </Link>
          .
        </p>
      ) : null}

      <DetailList className="mt-8">
        <DetailRow term="Datum">{day(quote.issueDate)}</DetailRow>
        <DetailRow term="Geldig tot">{day(quote.validUntil)}</DetailRow>
        <DetailRow term="Voorwaarden">
          {quote.terms ? `Algemene Voorwaarden B2B ${quote.terms.edition}, gepubliceerd ${day(quote.terms.publishedOn)}` : "Zie de offerte"}
        </DetailRow>
      </DetailList>

      <Section title="Specificatie">
        <DocumentLines lines={quote.lines} totals={quoteTotals(quote)} />
        <p className="mt-4 max-w-prose text-[0.88rem] text-muted">De toelichting en de verdere afspraken staan in de PDF van de offerte.</p>
      </Section>

      {quote.versions.length > 1 ? (
        <Section title="Versies">
          <ol className="border-t border-line">
            {quote.versions.map((version, index) => (
              <li key={version.id} className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-3 text-[0.92rem]">
                {version.id === quote.id ? (
                  <span className="font-medium text-ink">{version.number} (deze versie)</span>
                ) : (
                  <Link href={portalQuotePath(version.id)} className="link-static text-ink">
                    {version.number}
                  </Link>
                )}
                <span className="text-muted">
                  Versie {index + 1} · {day(version.issueDate)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
}
