import Link from "next/link";
import AdminSection from "@/components/admin/admin-section";
import CreditNoteForm from "@/components/admin/invoices/credit-note-form";
import RecordPayment from "@/components/admin/invoices/record-payment";
import StatusBadge from "@/components/admin/status-badge";
import type { CustomerCommunication } from "@/lib/admin/communications/types";
import { communicationCategoryLabel, communicationStatusLabels, communicationStatusTone } from "@/lib/admin/communications/types";
import { invoiceLedger, creditNoteStateLabels, creditNoteStateTone } from "@/lib/admin/credit-notes/settlement";
import { isFinanciallyIssued, refundMethodLabels, refundStatusLabels, refundStatusTone, type CreditNote, type Refund } from "@/lib/admin/credit-notes/types";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import type { Invoice } from "@/lib/admin/invoices/types";
import { formatCents } from "@/lib/money";
import { paymentSourceLabels, paymentStatusLabels, paymentStatusTone, type Payment } from "@/lib/payments/types";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

/**
 * The money side of one issued invoice: what it charges, what was credited,
 * what came in, what went back, and the mail about it. One ledger, the same
 * one the payments page reads, so this section and that page cannot
 * disagree. The actions that belong here: record a bank transfer, make a
 * credit note. Refunds are made on the credit note, where they belong.
 */
export default function InvoiceFinance({
  invoice,
  payments,
  creditNotes,
  refunds,
  communications,
  todayKey,
}: {
  invoice: Invoice;
  payments: Payment[];
  creditNotes: CreditNote[];
  refunds: Refund[];
  communications: CustomerCommunication[];
  todayKey: string;
}) {
  const ledger = invoiceLedger({ invoice, payments, creditNotes, refunds });
  const chargeable = invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "paid";
  const outstanding = chargeable && invoice.status !== "paid" ? ledger.outstandingCents : 0;
  const sortedPayments = [...payments].sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt));
  /* For the cap every note counts, finished or not: a numbered note holds its share of the invoice. */
  const creditedLines = creditNotes.flatMap((note) => note.lines);

  return (
    <>
      <AdminSection id="finance" title="Betalingen" note="Uit de betalingen en creditnota's; niets hiervan wordt los opgeslagen">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Figure label="Factuur" value={formatCents(ledger.totalCents)} />
          <Figure label="Gecrediteerd" value={ledger.creditedCents > 0 ? `−${formatCents(ledger.creditedCents)}` : "—"} />
          <Figure label="Betaald" value={ledger.paidCents > 0 ? formatCents(ledger.paidCents) : "—"} />
          {ledger.overpaidCents > 0 ? (
            <Figure label="Terug te betalen" value={formatCents(ledger.refundDueCents)} tone={ledger.refundDueCents > 0 ? "accent" : undefined} />
          ) : (
            <Figure label="Openstaand" value={outstanding > 0 ? formatCents(outstanding) : "—"} tone={outstanding > 0 && invoice.dueDate < todayKey ? "danger" : undefined} />
          )}
        </dl>

        <div className="mt-6">
          <h3 className="label-mono text-ink">Ontvangen</h3>
          {sortedPayments.length === 0 ? (
            <p className="mt-3 text-[0.9rem] text-muted">Nog geen betaling op deze factuur.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {sortedPayments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[0.9rem]">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">
                      {formatCents(payment.amountCents)} · {paymentSourceLabels[payment.source]}
                      {payment.method ? ` (${payment.method})` : ""}
                    </span>
                    <span className="block text-[0.82rem] text-muted">
                      {formatDateTime(payment.paidAt ?? payment.createdAt)}
                      {payment.providerPaymentId ? ` · Mollie ${payment.providerPaymentId}` : ""}
                      {payment.description ? ` · ${payment.description}` : ""}
                    </span>
                  </span>
                  <StatusBadge tone={paymentStatusTone[payment.status]}>{paymentStatusLabels[payment.status]}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
          {invoice.sentAt && invoice.status !== "cancelled" ? (
            <div className="mt-4">
              <RecordPayment invoiceId={invoice.id} outstandingCents={outstanding} todayKey={todayKey} />
            </div>
          ) : null}
        </div>
      </AdminSection>

      <AdminSection id="credit-notes" title="Creditnota's & refunds" note={ledger.refundDueCents > 0 ? `Nog terug te betalen: ${formatCents(ledger.refundDueCents)}` : undefined}>
        {creditNotes.length === 0 ? (
          <p className="text-[0.9rem] text-muted">Geen creditnota op deze factuur.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {creditNotes.map((note) => {
              const entry = ledger.notes.find((item) => item.creditNoteId === note.id);
              const own = refunds.filter((refund) => refund.creditNoteId === note.id);
              return (
                <li key={note.id} className="py-2.5 text-[0.9rem]">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <Link href={`/admin/betalingen/creditnotas/${note.id}`} className="link-static block font-medium text-ink">
                        {note.number.value} · {formatCents(note.totalCents)}
                      </Link>
                      <span className="block text-[0.82rem] text-muted">
                        {day(note.issueDate)} · {note.reason}
                      </span>
                    </span>
                    {isFinanciallyIssued(note) && entry ? (
                      <StatusBadge tone={creditNoteStateTone[entry.state]}>{creditNoteStateLabels[entry.state]}</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">Niet afgerond</StatusBadge>
                    )}
                  </div>
                  {own.length > 0 ? (
                    <ul className="mt-1.5 space-y-1 pl-3 text-[0.82rem]">
                      {own.map((refund) => (
                        <li key={refund.id} className="flex flex-wrap items-center justify-between gap-x-3">
                          <span className="text-muted">
                            {formatCents(refund.amountCents)} · {refundMethodLabels[refund.method]}
                            {refund.settledAt ? ` · ${formatDateTime(refund.settledAt)}` : ""}
                            {refund.providerRefundId ? ` · ${refund.providerRefundId}` : ""}
                          </span>
                          <StatusBadge tone={refundStatusTone[refund.status]}>{refundStatusLabels[refund.status]}</StatusBadge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {invoice.sentAt && invoice.status !== "cancelled" ? (
          <div className="mt-4">
            <CreditNoteForm invoiceId={invoice.id} invoiceNumber={invoice.number.value} invoiceLines={invoice.lines} creditedLines={creditedLines} todayKey={todayKey} />
          </div>
        ) : (
          <p className="mt-3 text-[0.82rem] text-muted">Crediteren kan zodra de factuur is verstuurd; een factuur die nooit is verstuurd annuleer je.</p>
        )}
      </AdminSection>

      <AdminSection id="invoice-communication" title="Communicatie" note="Mails over deze factuur">
        {communications.length === 0 ? (
          <p className="text-[0.9rem] text-muted">Nog geen mail over deze factuur.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {communications.map((mail) => (
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
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "danger" | "accent" }) {
  return (
    <div className="min-w-0 border-t border-line pt-2">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className={`tabular mt-1 truncate text-[1.05rem] font-medium ${tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
