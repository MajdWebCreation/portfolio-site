import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import DocumentTotalsView from "@/components/admin/documents/document-totals";
import CreditNoteActions from "@/components/admin/payments/credit-note-actions";
import RefundPanel from "@/components/admin/payments/refund-panel";
import StatusBadge from "@/components/admin/status-badge";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCommunicationsForInvoice } from "@/lib/admin/communications/repository";
import { communicationCategoryLabel, communicationStatusLabels, communicationStatusTone } from "@/lib/admin/communications/types";
import { getCreditNote, listCreditNotesForInvoice, listRefundsForInvoice } from "@/lib/admin/credit-notes/repository";
import { creditNoteLedger, creditNoteStateLabels, creditNoteStateTone } from "@/lib/admin/credit-notes/settlement";
import { creditNoteSourceLabels, creditNoteStatusLabels, creditNoteStatusTone, isFinanciallyIssued } from "@/lib/admin/credit-notes/types";
import { formatDate, formatDateTime, toDateKey } from "@/lib/admin/format";
import { readCustomerRecipient, readInvoice } from "@/lib/admin/readers";
import { calculateTotals, formatCents, formatQuantity, lineNetCents } from "@/lib/money";
import { listPaymentsForInvoice } from "@/lib/payments/repository";

type PageProps = { params: Promise<{ id: string }> };

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const creditNote = await getCreditNote(id);
  return { title: creditNote ? `${creditNote.number.value} · Creditnota's` : "Creditnota" };
}

/**
 * One credit note: the document, the invoice it corrects, and the money
 * that went back or still has to. Everything financial on this page comes
 * out of the one ledger the payments page and the invoice page also read.
 */
export default async function CreditNotePage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const creditNote = await getCreditNote(id);
  if (!creditNote) notFound();

  const [invoice, payments, creditNotes, refunds, communications, recipient] = await Promise.all([
    readInvoice(creditNote.invoiceId),
    listPaymentsForInvoice(creditNote.invoiceId),
    listCreditNotesForInvoice(creditNote.invoiceId),
    listRefundsForInvoice(creditNote.invoiceId),
    listCommunicationsForInvoice(creditNote.invoiceId),
    readCustomerRecipient(creditNote.customer.customerId),
  ]);
  if (!invoice) notFound();

  const ledger = creditNoteLedger(creditNote, { invoice, payments, creditNotes, refunds });
  const ownRefunds = refunds.filter((refund) => refund.creditNoteId === creditNote.id);
  const molliePayments = payments
    .filter((payment) => payment.status === "paid" && payment.source === "mollie" && payment.providerPaymentId)
    .map((payment) => ({ id: payment.providerPaymentId!, amountCents: payment.amountCents, ...(payment.paidAt ? { paidAt: payment.paidAt } : {}) }));
  const mails = communications.filter((item) => item.category === "credit_note_sent");
  const totals = calculateTotals(creditNote.lines);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Creditnota · ${creditNote.number.value}`}
        title={creditNote.customer.companyName}
        meta={
          <>
            {isFinanciallyIssued(creditNote) ? (
              <StatusBadge tone={creditNoteStatusTone[creditNote.status]}>{creditNoteStatusLabels[creditNote.status]}</StatusBadge>
            ) : (
              <StatusBadge tone="danger">Niet afgerond</StatusBadge>
            )}
            <StatusBadge tone={creditNoteStateTone[ledger.state]}>{creditNoteStateLabels[ledger.state]}</StatusBadge>
            {ledger.remainingCents > 0 ? <span className="tabular text-[0.85rem] text-muted">Nog terug te betalen: {formatCents(ledger.remainingCents)}</span> : null}
          </>
        }
        text={`Correctie op factuur ${invoice.number.value} · ${creditNoteSourceLabels[creditNote.source]}`}
        actions={
          <>
            <Link href={`/admin/facturen/${invoice.id}`} className="link-static text-[0.92rem] text-ink">
              Naar factuur {invoice.number.value}
            </Link>
            <Link href={`/admin/betalingen?tab=creditnotas`} className="link-static text-[0.92rem] text-ink">
              Alle creditnota&apos;s
            </Link>
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <div className="space-y-10">
          <AdminSection id="document" title="Creditnota" note="Definitief; de gegevens liggen vast">
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <Fact label="Creditnotanummer" value={creditNote.number.value} />
              <Fact label="Datum" value={day(creditNote.issueDate)} />
              <Fact label="Klant" value={creditNote.customer.companyName} />
              <Fact label="Originele factuur" value={`${invoice.number.value} · ${day(invoice.issueDate)} · ${formatCents(calculateTotals(invoice.lines).totalCents)}`} />
              <Fact label="Reden" value={creditNote.reason} />
              {creditNote.issuedAt ? <Fact label="Definitief gemaakt" value={formatDateTime(creditNote.issuedAt)} /> : null}
              {creditNote.sentAt ? <Fact label="Verstuurd" value={`${formatDateTime(creditNote.sentAt)}${creditNote.recipientEmail ? ` naar ${creditNote.recipientEmail}` : ""}`} /> : null}
            </dl>
          </AdminSection>

          <AdminSection id="lines" title="Regels" note="Positieve bedragen; het geheel is de creditering">
            <table className="w-full text-[0.92rem]">
              <thead>
                <tr className="border-b border-line text-left text-[0.8rem] uppercase tracking-[0.08em] text-muted">
                  <th scope="col" className="py-2 font-normal">Omschrijving</th>
                  <th scope="col" className="py-2 text-right font-normal">Aantal</th>
                  <th scope="col" className="py-2 text-right font-normal">Bedrag excl.</th>
                  <th scope="col" className="py-2 text-right font-normal">Btw</th>
                  <th scope="col" className="py-2 text-right font-normal">Gecrediteerd</th>
                </tr>
              </thead>
              <tbody>
                {creditNote.lines.map((line) => (
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

          <AdminSection id="refunds" title="Terugbetaling" note={ledger.state === "offset" ? "Verrekend met de factuur" : undefined}>
            <RefundPanel
              creditNoteId={creditNote.id}
              creditNoteNumber={creditNote.number.value}
              customerName={creditNote.customer.companyName}
              invoiceNumber={invoice.number.value}
              ledger={ledger}
              refunds={ownRefunds}
              molliePayments={molliePayments}
              todayKey={toDateKey(new Date())}
            />
          </AdminSection>

          <AdminSection id="communication" title="Communicatie" note="Mails over deze creditnota">
            {mails.length === 0 ? (
              <p className="text-[0.95rem] text-muted">Nog niet naar de klant gemaild.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {mails.map((mail) => (
                  <li key={mail.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[0.9rem]">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{mail.subject}</span>
                      <span className="block text-[0.82rem] text-muted">
                        {communicationCategoryLabel(mail.category)} · {formatDateTime(mail.sentAt ?? mail.createdAt)} · {mail.recipient}
                      </span>
                    </span>
                    <StatusBadge tone={communicationStatusTone[mail.status]}>{communicationStatusLabels[mail.status]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>

        <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
          <div className="space-y-3">
            <p className="font-mono text-[1.05rem] text-ink">{creditNote.number.value}</p>
            <p className="text-[0.85rem] leading-snug text-muted">
              Gecrediteerd <span className="tabular text-ink">{formatCents(creditNote.totalCents)}</span> incl. btw op factuur{" "}
              <Link href={`/admin/facturen/${invoice.id}`} className="link-static text-ink">
                {invoice.number.value}
              </Link>
              .
            </p>
          </div>
          <div className="border-t border-line pt-6">
            <CreditNoteActions creditNote={creditNote} recipient={recipient} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line py-2">
      <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink">{value}</dd>
    </div>
  );
}
