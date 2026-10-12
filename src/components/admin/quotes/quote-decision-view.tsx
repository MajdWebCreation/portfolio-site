import DecisionMailRetry from "@/components/admin/quotes/decision-mail-retry";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import type { AdminQuoteDecision } from "@/lib/admin/quotes/decisions";
import { quoteDecisionSourceLabels, shortHash } from "@/lib/quotes/decision";

/**
 * The decision on a quote, as it is on record. Read-only: a decision is
 * written once and nothing in the admin -- or anywhere else -- changes or
 * removes it. For a portal decision, whether its two mails went out, and a
 * retry when one did not.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-2">
      <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[0.92rem] text-ink">{children}</dd>
    </div>
  );
}

export default function QuoteDecisionView({ quoteId, decision }: { quoteId: string; decision: AdminQuoteDecision }) {
  const portal = decision.source === "portal";
  const notice = decision.notification;
  const mailPending = portal && notice && (!notice.customerNotifiedAt || !notice.internalNotifiedAt);

  return (
    <section aria-labelledby="decision-heading" className="space-y-3 border-t border-line pt-6">
      <h2 id="decision-heading" className="label-mono text-ink">
        Beslissing
      </h2>
      <dl>
        <Row label="Moment">{formatDateTime(decision.decidedAt)}</Row>
        <Row label="Bron">{quoteDecisionSourceLabels[decision.source]}</Row>
        <Row label={portal ? "Door (portaalaccount)" : "Vastgelegd door"}>{decision.actorEmail ?? "Onbekend"}</Row>
        <Row label="Document">
          <span className="font-mono text-[0.85rem]" title={decision.documentSha256}>
            SHA-256 {shortHash(decision.documentSha256)}
          </span>
        </Row>
        <Row label="Voorwaarden">
          Algemene Voorwaarden B2B {decision.termsEdition}, gepubliceerd {formatDate(`${decision.termsPublishedOn}T12:00:00+02:00`)}
          {portal && decision.decision === "accepted" && decision.termsConfirmed ? " · klant vinkte “gelezen en akkoord” aan" : ""}
        </Row>
        {decision.rejectionReason ? (
          <Row label="Reden">
            <span className="whitespace-pre-line">{decision.rejectionReason}</span>
          </Row>
        ) : null}
        {decision.note ? (
          <Row label="Interne notitie">
            <span className="whitespace-pre-line">{decision.note}</span>
          </Row>
        ) : null}
        {portal && notice ? (
          <Row label="Bevestiging">
            {notice.customerNotifiedAt ? `Klant gemaild ${formatDateTime(notice.customerNotifiedAt)}` : "Klant nog niet gemaild"}
            {" · "}
            {notice.internalNotifiedAt ? "interne melding verstuurd" : "interne melding nog niet verstuurd"}
          </Row>
        ) : null}
      </dl>
      {mailPending ? <DecisionMailRetry quoteId={quoteId} /> : null}
      <p className="text-[0.8rem] leading-snug text-muted">Een beslissing ligt vast en kan niet worden gewijzigd of verwijderd.</p>
    </section>
  );
}
