import type { Metadata } from "next";
import Link from "next/link";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentLines, DownloadLink, PageHeader, Section } from "@/components/portal/portal-ui";
import QuoteDecisionForm from "@/components/portal/quote-decision-form";
import { formatDateTime, toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNotFound, requirePortalMember } from "@/lib/portal/access";
import { portalDocumentHref } from "@/lib/portal/documents/read";
import { portalQuotePath, portalQuotesPath } from "@/lib/portal/paths";
import {
  portalQuoteState,
  portalQuoteStateLabels,
  portalQuoteStateTone,
  quoteTotals,
  type PortalQuoteDecision,
  type PortalQuoteDetail,
} from "@/lib/portal/quotes/model";
import { readPortalQuote, readPortalQuoteDecision } from "@/lib/portal/quotes/read";
import { quoteDecisionSourceLabels } from "@/lib/quotes/decision";

export const metadata: Metadata = { title: "Offerte" };

type PageProps = { params: Promise<{ id: string }> };

/**
 * One quote as it was sent: its figures, the general terms it was sent
 * under, and the other versions of the same proposal. The introduction and
 * the closing notes are in the PDF, the document the customer received.
 *
 * While the quote is open the customer can accept or reject it here; once
 * that is on record the page shows the decision instead, for good.
 */
function terms(edition: string) {
  return `Algemene Voorwaarden B2B ${edition}`;
}

function DecisionBlock({ customerId, quote, decision }: { customerId: string; quote: PortalQuoteDetail; decision: PortalQuoteDecision }) {
  const pdf = portalDocumentHref("quote", quote.id);

  if (decision.decision) {
    const { kind, decidedAt, decidedBy, source, rejectionReason } = decision.decision;
    return (
      <Section title={kind === "accepted" ? "Offerte geaccepteerd" : "Offerte afgewezen"}>
        <DetailList>
          <DetailRow term="Datum en tijd">{formatDateTime(decidedAt)}</DetailRow>
          <DetailRow term="Door">
            {source === "portal" ? (decidedBy ?? "Via het klantportaal") : `Vastgelegd door YM Creations (${quoteDecisionSourceLabels[source].toLowerCase()})`}
          </DetailRow>
          {kind === "rejected" && rejectionReason ? (
            <DetailRow term="Toelichting">
              <span className="whitespace-pre-line">{rejectionReason}</span>
            </DetailRow>
          ) : null}
        </DetailList>
        <p className="mt-4 max-w-prose text-[0.88rem] text-muted">Deze beslissing is vastgelegd bij exact de offerte die u hierboven kunt downloaden, en kan niet worden gewijzigd.</p>
      </Section>
    );
  }

  if (decision.state === "expired") {
    return (
      <p className="mt-10 max-w-prose border-l-2 border-line pl-4 text-[0.95rem]">
        Deze offerte is verlopen. Neem contact met ons op als u een nieuwe versie wilt ontvangen.
      </p>
    );
  }

  if (decision.state === "superseded") {
    return quote.supersededBy ? null : (
      <p className="mt-10 max-w-prose border-l-2 border-line pl-4 text-[0.95rem]">
        Er komt een nieuwe versie van deze offerte. U ontvangt die van ons; daarop kunt u dan reageren.
      </p>
    );
  }

  if (decision.state !== "open" || !decision.documentSha256 || !decision.termsEdition) return null;

  return (
    <Section title="Uw reactie">
      <p className="max-w-prose text-[0.95rem]">
        Door deze offerte te accepteren gaat u akkoord met offerte {quote.number} van {formatCents(quoteTotals(quote).totalCents)} (incl.
        btw), geldig tot {day(quote.validUntil)}, en de daarbij behorende {terms(decision.termsEdition)}.
      </p>
      <p className="mt-4">
        <DownloadLink href={pdf}>Lees de offerte (PDF)</DownloadLink>
      </p>
      <div className="mt-6">
        <QuoteDecisionForm customerId={customerId} quoteId={quote.id} documentSha256={decision.documentSha256} />
      </div>
    </Section>
  );
}

export default async function PortalQuotePage({ params }: PageProps) {
  const member = await requirePortalMember();
  const { id } = await params;
  const todayKey = toDateKey(new Date());
  const customerId = member.current.customerId;
  const [quote, decision] = await Promise.all([
    orNotFound(readPortalQuote(customerId, id)),
    orNotFound(readPortalQuoteDecision(customerId, id)),
  ]);
  /* A newer version on its way (numbered, not yet sent) already closes this one; the badge says so too. */
  const state = !decision.decision && decision.state === "superseded" ? "superseded" : portalQuoteState(quote, todayKey);

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

      <DecisionBlock customerId={customerId} quote={quote} decision={decision} />

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
