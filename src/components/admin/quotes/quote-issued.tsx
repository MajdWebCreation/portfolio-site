import Link from "next/link";
import AdminSection from "@/components/admin/admin-section";
import SendPanel from "@/components/admin/documents/send-panel";
import DocumentTotalsView from "@/components/admin/documents/document-totals";
import QuoteDecisionRecord from "@/components/admin/quotes/quote-decision-record";
import QuoteDecisionView from "@/components/admin/quotes/quote-decision-view";
import QuoteDocument from "@/components/admin/quotes/quote-document";
import QuoteOutcome from "@/components/admin/quotes/quote-outcome";
import QuoteRevision from "@/components/admin/quotes/quote-revision";
import StatusBadge from "@/components/admin/status-badge";
import type { RecipientResult } from "@/lib/admin/communications/recipient";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import type { AdminQuoteDecision } from "@/lib/admin/quotes/decisions";
import type { QuoteSuccessor } from "@/lib/admin/quotes/repository";
import { isQuoteDecided, quoteRevisionBlockedReason, quoteStatusLabels, quoteStatusTone, type Quote } from "@/lib/admin/quotes/types";
import { calculateTotals, formatCents, formatQuantity, lineNetCents } from "@/lib/money";

/**
 * A quote that is no longer a concept.
 *
 * Read-only, and not the builder with its fields switched off: the number is
 * taken, the terms are recorded and the database refuses every change to
 * what the quote says. What is left to do is send it (or send it again), say
 * what became of it, and -- when it has to change -- make a new version.
 *
 * What became of it is a decision when it was accepted or rejected: shown
 * from quote_decisions, read-only. While none exists the admin can record
 * one that came in outside the portal; "verlopen" and back is the only
 * status left to set by hand.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line py-2">
      <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink">{value}</dd>
    </div>
  );
}

type QuoteIssuedProps = {
  quote: Quote;
  recipient: RecipientResult;
  /** The quote this one replaced, when it is a new version. */
  predecessor?: QuoteSuccessor;
  /** The quote that replaced this one, when there is one. */
  successor?: QuoteSuccessor;
  /** The decision on record, when there is one. */
  decision?: AdminQuoteDecision;
  todayKey: string;
};

/**
 * Whether an admin may record a decision: the same rules the database
 * applies in admin_record_quote_decision, asked here so the form is only
 * offered where it can succeed. A newer version past the concept stage
 * takes the decision instead of this one.
 */
function mayRecordDecision(quote: Quote, successor: QuoteSuccessor | undefined): boolean {
  if (!quote.sentAt || !quote.document || !quote.terms || quote.legacyWithoutDocument) return false;
  if (quote.status !== "sent" && quote.status !== "expired") return false;
  return !successor || successor.number.provisional;
}

export default function QuoteIssued({ quote, recipient, predecessor, successor, decision, todayKey }: QuoteIssuedProps) {
  const totals = calculateTotals(quote.lines);
  const day = (dateKey: string) => formatDate(`${dateKey}T12:00:00+02:00`);
  const revisionBlocked = quoteRevisionBlockedReason(quote);

  const replaced = Boolean(successor?.sentAt);
  const state = quote.legacyWithoutDocument
    ? "Deze offerte is verstuurd voordat offertes als bestand werden bewaard. De PDF die de klant ontving is niet opgeslagen; opnieuw versturen kan daarom niet. Een wijziging of een nieuwe verzending is een nieuwe versie."
    : !quote.document
      ? "Het versturen van deze offerte is niet afgerond: het nummer is toegekend en de inhoud ligt vast, maar de PDF is nog niet opgeslagen. Verstuur opnieuw; het nummer blijft hetzelfde."
      : quote.sentAt
        ? "Deze offerte is verstuurd. De PDF hiernaast is exact het bestand dat de klant heeft ontvangen."
        : "Deze offerte is uitgegeven maar de mail is niet aangekomen bij de mailer. Verstuur opnieuw; exact het bestand hiernaast gaat naar de klant.";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection id="document" title="Offerte" note={quote.sentAt ? "Verzonden; de inhoud ligt vast" : "Definitief; de inhoud ligt vast"}>
          <p className="text-[0.9rem] leading-snug text-body">{state}</p>
          {successor ? (
            <p className="mt-3 text-[0.9rem] leading-snug text-body">
              {successor.sentAt ? "Vervangen door" : "Er is een nieuwe versie in concept:"}{" "}
              <Link href={`/admin/offertes/${successor.id}`} className="link-static text-ink">
                {successor.number.value}
              </Link>
              .
            </p>
          ) : null}
          {predecessor ? (
            <p className="mt-3 text-[0.9rem] leading-snug text-body">
              Nieuwe versie van{" "}
              <Link href={`/admin/offertes/${predecessor.id}`} className="link-static text-ink">
                {predecessor.number.value}
              </Link>
              .
            </p>
          ) : null}
          <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
            <Fact label="Offertenummer" value={quote.number.value} />
            <Fact label="Klant" value={quote.customer.companyName} />
            <Fact label="Offertedatum" value={day(quote.issueDate)} />
            <Fact label="Geldig tot" value={day(quote.validUntil)} />
            <Fact label="Adres" value={`${quote.customer.street}, ${quote.customer.postalCode} ${quote.customer.city}`} />
            <Fact
              label="Voorwaarden"
              value={quote.terms ? `Algemene Voorwaarden B2B ${quote.terms.edition}` : "Versie niet historisch vastgesteld"}
            />
            {quote.document ? <Fact label="PDF" value={`${(quote.document.bytes / 1024).toFixed(0)} kB`} /> : null}
            {quote.sentAt ? (
              <Fact
                label="Verstuurd"
                value={`${formatDateTime(quote.sentAt)}${quote.recipientEmail ? ` naar ${quote.recipientEmail}` : ""}`}
              />
            ) : null}
          </dl>
        </AdminSection>

        {quote.subject || quote.intro ? (
          <AdminSection id="subject" title="Onderwerp">
            <p className="text-[0.95rem] text-ink">{quote.subject}</p>
            {quote.intro ? <p className="mt-2 whitespace-pre-line text-[0.9rem] leading-relaxed text-body">{quote.intro}</p> : null}
          </AdminSection>
        ) : null}

        <AdminSection id="lines-heading" title="Regels">
          <table className="w-full text-[0.92rem]">
            <thead>
              <tr className="border-b border-line text-left text-[0.8rem] uppercase tracking-[0.08em] text-muted">
                <th scope="col" className="py-2 font-normal">
                  Omschrijving
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Aantal
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Stukprijs
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Btw
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Bedrag
                </th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-b border-line align-top">
                  <td className="py-2 pr-4 text-ink">{line.description}</td>
                  <td className="tabular py-2 text-right text-body">{formatQuantity(line.quantityHundredths)}</td>
                  <td className="tabular py-2 text-right text-body">{formatCents(line.unitPriceCents)}</td>
                  <td className="tabular py-2 text-right text-body">{line.vatRate}%</td>
                  <td className="tabular py-2 text-right text-ink">{formatCents(lineNetCents(line))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6">
            <DocumentTotalsView totals={totals} />
          </div>
        </AdminSection>

        {quote.notes ? (
          <AdminSection id="notes" title="Opmerkingen en voorwaarden">
            <p className="whitespace-pre-line text-[0.9rem] leading-relaxed text-body">{quote.notes}</p>
          </AdminSection>
        ) : null}
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <div className="space-y-3">
          <p className="font-mono text-[1.05rem] text-ink">{quote.number.value}</p>
          {quote.sentAt && !isQuoteDecided(quote) ? (
            <QuoteOutcome quoteId={quote.id} status={quote.status} />
          ) : (
            <StatusBadge tone={quoteStatusTone[quote.status]}>{quoteStatusLabels[quote.status]}</StatusBadge>
          )}
        </div>

        {decision ? (
          <QuoteDecisionView quoteId={quote.id} decision={decision} />
        ) : mayRecordDecision(quote, successor) ? (
          <QuoteDecisionRecord quoteId={quote.id} number={quote.number.value} pastValidity={quote.validUntil < todayKey} />
        ) : quote.legacyWithoutDocument && !isQuoteDecided(quote) ? (
          <p className="border-t border-line pt-6 text-[0.85rem] leading-snug text-muted">
            Een akkoord of afwijzing wordt vastgelegd bij een opgeslagen PDF, en die is er van deze offerte niet. Stuurt
            de klant een akkoord, maak dan een nieuwe versie, verstuur die en leg het akkoord daarop vast.
          </p>
        ) : null}

        <section aria-labelledby="pdf-heading" className="space-y-4 border-t border-line pt-6">
          <h2 id="pdf-heading" className="label-mono text-ink">
            PDF
          </h2>
          {quote.document ? (
            <>
              <QuoteDocument quoteId={quote.id} document={quote.document} />
              {replaced ? (
                <p className="text-[0.85rem] leading-snug text-muted">
                  Vervangen door {successor!.number.value}; deze versie wordt niet opnieuw verstuurd.
                </p>
              ) : (
                <SendPanel doc={{ kind: "quote", quote }} recipient={recipient} />
              )}
            </>
          ) : quote.legacyWithoutDocument ? (
            <p className="text-[0.85rem] leading-snug text-muted">
              Van deze offerte is geen bestand bewaard. Versturen kan alleen als nieuwe versie.
            </p>
          ) : (
            <>
              <p className="text-[0.85rem] leading-snug text-danger">
                Er is nog geen opgeslagen PDF. Versturen rondt het uitgeven af: het nummer {quote.number.value} blijft van
                deze offerte.
              </p>
              <SendPanel doc={{ kind: "quote", quote }} recipient={recipient} />
            </>
          )}
        </section>

        {quote.sentAt && !successor && !revisionBlocked ? (
          <QuoteRevision quoteId={quote.id} number={quote.number.value} />
        ) : null}
      </aside>
    </div>
  );
}
