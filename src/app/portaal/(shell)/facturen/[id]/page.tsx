import type { Metadata } from "next";
import Link from "next/link";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { PayInvoiceButton } from "@/components/portal/payment-buttons";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentLines, DownloadLink, PageHeader, Section, TotalRow } from "@/components/portal/portal-ui";
import { formatDate, toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNotFound, requirePortalMember } from "@/lib/portal/access";
import { portalDocumentHref } from "@/lib/portal/documents/read";
import {
  paymentMethodLabel,
  portalCreditNoteStateLabels,
  portalInvoiceStateLabels,
  portalInvoiceStateTone,
  portalInvoiceView,
} from "@/lib/portal/invoices/model";
import { readPortalInvoice } from "@/lib/portal/invoices/read";
import { portalInvoicesPath } from "@/lib/portal/paths";
import { invoicePaymentBlock } from "@/lib/portal/payments/model";
import { readPortalPaymentContext } from "@/lib/portal/payments/read";
import { invoicePaymentModeAction } from "@/lib/portal/payment-actions";

export const metadata: Metadata = { title: "Factuur" };

type PageProps = { params: Promise<{ id: string }> };

/**
 * One invoice: the figures of the document, what arrived against it, the
 * credit notes that corrected it, and what is still open -- the last from
 * the ledger, not from a status column. The PDF is the document itself.
 */
export default async function PortalInvoicePage({ params }: PageProps) {
  const member = await requirePortalMember();
  const { id } = await params;
  const todayKey = toDateKey(new Date());
  const [found, context] = await orNotFound(Promise.all([readPortalInvoice(member.current.customerId, id), readPortalPaymentContext(member.current.customerId)]));
  const view = portalInvoiceView(found, todayKey);
  const { invoice, ledger } = view;
  const block = invoicePaymentBlock(view, context);
  /* The same decision the click gets: `first` when this payment is also the direct debit mandate. */
  const mode = block === undefined ? await invoicePaymentModeAction(invoice.id) : undefined;

  return (
    <div>
      <p className="text-[0.9rem]">
        <Link href={portalInvoicesPath} className="link-static text-muted">
          ← Facturen
        </Link>
      </p>
      <div className="mt-6">
        <PageHeader label="Factuur" title={invoice.number} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <StatusBadge tone={portalInvoiceStateTone[view.state]}>{portalInvoiceStateLabels[view.state]}</StatusBadge>
        <DownloadLink href={portalDocumentHref("invoice", invoice.id)}>Factuur downloaden (PDF)</DownloadLink>
      </div>

      <DetailList className="mt-8">
        <DetailRow term="Factuurdatum">{day(invoice.issueDate)}</DetailRow>
        <DetailRow term="Vervaldatum">{day(invoice.dueDate)}</DetailRow>
        {invoice.billingPeriod ? (
          <DetailRow term="Periode">
            {day(invoice.billingPeriod.start)} t/m {day(invoice.billingPeriod.end)}
          </DetailRow>
        ) : null}
        <DetailRow term="Betalingskenmerk">{invoice.paymentReference}</DetailRow>
        <DetailRow term="Gericht aan">
          {invoice.addressedTo.companyName}
          <span className="block text-[0.88rem] text-muted">
            {invoice.addressedTo.street}, {invoice.addressedTo.postalCode} {invoice.addressedTo.city}
          </span>
        </DetailRow>
      </DetailList>

      <Section title="Specificatie">
        <DocumentLines lines={invoice.lines} totals={view.totals} />
      </Section>

      <Section title="Stand van de betaling">
        <dl className="max-w-sm text-[0.92rem]">
          <TotalRow term="Factuurbedrag" value={formatCents(ledger.totalCents)} />
          {ledger.creditedCents > 0 ? <TotalRow term="Gecrediteerd" value={`− ${formatCents(ledger.creditedCents)}`} /> : null}
          {ledger.paidCents > 0 ? <TotalRow term="Ontvangen" value={`− ${formatCents(ledger.paidCents)}`} /> : null}
          {ledger.refundedCents > 0 ? <TotalRow term="Aan u terugbetaald" value={`+ ${formatCents(ledger.refundedCents)}`} /> : null}
          {ledger.refundInFlightCents + ledger.refundDueCents > 0 ? (
            <TotalRow term="Nog aan u terug te betalen" value={`+ ${formatCents(ledger.refundInFlightCents + ledger.refundDueCents)}`} />
          ) : null}
          <TotalRow term="Nog te betalen" value={formatCents(view.openCents)} strong />
        </dl>
        {block === undefined ? (
          <div className="mt-6">
            {mode === "first" ? (
              <p className="mb-4 max-w-prose text-[0.92rem] text-body">
                Met deze betaling van {formatCents(view.openCents)} voldoet u de factuur en geeft u tegelijkertijd toestemming voor de
                automatische incasso van de toekomstige maandbedragen van uw dienst. U betaalt nu alleen het factuurbedrag; vóór elke
                afschrijving krijgt u bericht.
              </p>
            ) : null}
            <PayInvoiceButton
              invoiceId={invoice.id}
              label={mode === "first" ? "Factuur betalen en automatische incasso activeren" : `${formatCents(view.openCents)} betalen`}
            />
            <p className="mt-3 max-w-prose text-[0.86rem] text-muted">
              U betaalt via de beveiligde betaalpagina van onze betaalprovider. Liever per bankoverschrijving? Vermeld dan{" "}
              {invoice.paymentReference}.
            </p>
          </div>
        ) : block === "direct_debit" ? (
          /*
            No pay button for an invoice the direct debit collects, also once it
            is past due: a collection may still be under way at the bank, and a
            second payment beside it would charge the customer twice. Past due,
            the page says what is true and who sorts it out.
          */
          <p className="mt-4 max-w-prose text-[0.88rem] text-muted">
            {view.state === "overdue"
              ? "Deze factuur zou automatisch van uw rekening worden afgeschreven, maar is nog niet betaald. Betaal niet zelf zonder overleg, zodat er niet dubbel wordt afgeschreven: neem contact met ons op via contact@ymcreations.com, dan regelen we de betaling met u."
              : "Deze factuur wordt automatisch van uw rekening afgeschreven; u hoeft zelf niets te betalen."}
          </p>
        ) : null}
      </Section>

      {invoice.payments.length > 0 ? (
        <Section title="Ontvangen betalingen">
          <ul className="border-t border-line">
            {invoice.payments.map((payment, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-3 text-[0.92rem]">
                <span className="text-ink">
                  {payment.paidAt ? formatDate(payment.paidAt) : "Datum onbekend"}
                  <span className="ml-2 text-muted">{paymentMethodLabel(payment)}</span>
                </span>
                <span className="tabular text-ink">{formatCents(payment.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {view.creditNotes.length > 0 ? (
        <Section title="Creditnota's">
          <ul className="border-t border-line">
            {view.creditNotes.map((note) => (
              <li key={note.id} className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{note.number}</p>
                  <p className="mt-0.5 text-[0.86rem] text-muted">
                    {day(note.issueDate)} · {portalCreditNoteStateLabels[note.state]}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                  <span className="tabular text-[0.95rem] text-ink">{formatCents(note.totalCents)}</span>
                  <DownloadLink href={portalDocumentHref("credit_note", note.id)}>PDF</DownloadLink>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
