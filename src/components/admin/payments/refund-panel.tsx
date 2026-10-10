"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import type { CreditNoteLedger } from "@/lib/admin/credit-notes/settlement";
import { refundMethodLabels, refundStatusLabels, refundStatusTone, type Refund } from "@/lib/admin/credit-notes/types";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { centsToInput, formatCents, parseCents } from "@/lib/money";
import { markCreditNoteRefundedManually, refreshRefundStatus, refundCreditNoteViaMollie } from "@/lib/payments/refund-actions";

/**
 * The money side of one credit note: what went back, what still has to, and
 * the two ways to make it go back. Both are two clicks: the first asks, the
 * second does. A Mollie refund is money leaving the account, so the
 * confirmation names everything it is about to do.
 */
export type RefundPanelProps = {
  creditNoteId: string;
  creditNoteNumber: string;
  customerName: string;
  invoiceNumber: string;
  ledger: CreditNoteLedger;
  refunds: Refund[];
  /** The Mollie payment(s) that could be refunded; absent when the invoice was not paid through Mollie. */
  molliePayments: { id: string; amountCents: number; paidAt?: string }[];
  todayKey: string;
};

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function RefundPanel(props: RefundPanelProps) {
  const { ledger, refunds } = props;
  const [mode, setMode] = useState<"idle" | "mollie" | "manual">("idle");
  const [amount, setAmount] = useState(centsToInput(ledger.remainingCents));
  const [settledOn, setSettledOn] = useState(props.todayKey);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mollie = useSave();
  const manual = useSave();
  const refresh = useSave();

  const amountCents = parseCents(amount);
  const amountInvalid = amountCents === null || amountCents <= 0 ? "Vul een bedrag hoger dan nul in." : amountCents > ledger.remainingCents ? `Maximaal ${formatCents(ledger.remainingCents)}.` : null;
  const canMollie = props.molliePayments.length > 0;

  function runMollie() {
    if (amountInvalid || amountCents === null) return setError(amountInvalid);
    setError(null);
    mollie.save(
      () => refundCreditNoteViaMollie(props.creditNoteId, amountCents),
      (value) => {
        setMode("idle");
        setMessage(value.warning ?? `${formatCents(value.refund.amountCents)} terugbetaald via Mollie (${value.refund.providerRefundId ?? "zonder id"}), status ${refundStatusLabels[value.refund.status].toLowerCase()}.`);
      },
    );
  }

  function runManual() {
    if (amountInvalid || amountCents === null) return setError(amountInvalid);
    setError(null);
    manual.save(
      () => markCreditNoteRefundedManually(props.creditNoteId, { amountCents, settledOn, note }),
      (value) => {
        setMode("idle");
        setMessage(`${formatCents(value.refund.amountCents)} als handmatig terugbetaald vastgelegd.`);
      },
    );
  }

  const busy = mollie.pending || manual.pending;

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-8 gap-y-2 text-[0.92rem] sm:grid-cols-3">
        <div className="border-t border-line pt-2">
          <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">Creditnota</dt>
          <dd className="tabular mt-0.5 text-ink">{formatCents(ledger.totalCents)}</dd>
        </div>
        <div className="border-t border-line pt-2">
          <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">Terugbetaald</dt>
          <dd className="tabular mt-0.5 text-ink">
            {formatCents(ledger.refundedCents)}
            {ledger.inFlightCents > 0 ? <span className="block text-[0.8rem] text-muted">+ {formatCents(ledger.inFlightCents)} onderweg</span> : null}
          </dd>
        </div>
        <div className="border-t border-line pt-2">
          <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">Nog terug te betalen</dt>
          <dd className={`tabular mt-0.5 font-medium ${ledger.remainingCents > 0 ? "text-accent" : "text-ink"}`}>{formatCents(ledger.remainingCents)}</dd>
        </div>
      </dl>

      {ledger.state === "offset" ? (
        <p className="text-[0.9rem] leading-snug text-muted">
          Factuur {props.invoiceNumber} was niet (volledig) betaald, dus deze creditnota verrekent met wat openstond. Er hoeft niets te worden terugbetaald.
        </p>
      ) : ledger.remainingCents > 0 ? (
        <p role="status" className="border-l-2 border-accent pl-3 text-[0.95rem] font-medium text-ink">
          Nog terug te betalen: {formatCents(ledger.remainingCents)}
        </p>
      ) : (
        <p className="text-[0.9rem] text-success">Volledig verwerkt: alles wat terug moest, is terugbetaald.</p>
      )}

      {message ? (
        <p role="status" className="text-[0.9rem] leading-snug text-success">
          {message}
        </p>
      ) : null}

      {ledger.remainingCents > 0 && mode === "idle" ? (
        <div className="flex flex-wrap gap-3">
          <AdminButton
            onClick={() => {
              setMessage(null);
              setAmount(centsToInput(ledger.remainingCents));
              setMode("mollie");
            }}
            disabled={!canMollie || busy}
          >
            Via Mollie terugbetalen
          </AdminButton>
          <AdminButton
            variant="secondary"
            onClick={() => {
              setMessage(null);
              setAmount(centsToInput(ledger.remainingCents));
              setMode("manual");
            }}
            disabled={busy}
          >
            Handmatig terugbetaald markeren
          </AdminButton>
          {!canMollie ? <p className="basis-full text-[0.82rem] text-muted">Deze factuur is niet via Mollie betaald; een terugbetaling gaat per bank en wordt hier handmatig vastgelegd.</p> : null}
        </div>
      ) : null}

      {mode !== "idle" ? (
        <div className="space-y-4 rounded-sm border border-line bg-paper-deep p-4">
          <h3 className="label-mono text-ink">{mode === "mollie" ? "Terugbetalen via Mollie" : "Handmatige terugbetaling vastleggen"}</h3>
          <dl className="grid gap-x-6 gap-y-1 text-[0.88rem] sm:grid-cols-2">
            <Fact label="Klant" value={props.customerName} />
            <Fact label="Originele factuur" value={props.invoiceNumber} />
            <Fact label="Creditnota" value={props.creditNoteNumber} />
            {mode === "mollie" ? <Fact label="Mollie-betaling" value={props.molliePayments.map((payment) => payment.id).join(", ")} /> : null}
            <Fact label="Reeds terugbetaald" value={formatCents(ledger.refundedCents)} />
            <Fact label="Resterend terug te betalen" value={formatCents(ledger.remainingCents)} />
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="refund-amount" label="Bedrag" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            {mode === "manual" ? (
              <TextField id="refund-date" label="Terugbetaald op" type="date" value={settledOn} max={props.todayKey} onChange={(event) => setSettledOn(event.target.value)} />
            ) : null}
          </div>
          {mode === "manual" ? (
            <TextField id="refund-note" label="Notitie of referentie (optioneel)" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Bankreferentie" />
          ) : (
            <p className="text-[0.85rem] leading-snug text-body">
              Mollie boekt {amountCents !== null && !amountInvalid ? formatCents(amountCents) : "het bedrag"} terug naar de rekening waarmee factuur {props.invoiceNumber} is betaald. Dit kan niet ongedaan worden gemaakt.
            </p>
          )}
          {error || amountInvalid ? (
            <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
              {error ?? amountInvalid}
            </p>
          ) : null}
          {mollie.error || manual.error ? (
            <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
              {mollie.error ?? manual.error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {mode === "mollie" ? (
              <AdminButton onClick={runMollie} disabled={busy || Boolean(amountInvalid)}>
                {mollie.pending ? "Terugbetalen…" : `${amountCents !== null && !amountInvalid ? formatCents(amountCents) : "—"} terugbetalen via Mollie`}
              </AdminButton>
            ) : (
              <AdminButton onClick={runManual} disabled={busy || Boolean(amountInvalid)}>
                {manual.pending ? "Vastleggen…" : "Handmatig terugbetaald markeren"}
              </AdminButton>
            )}
            <button type="button" onClick={() => setMode("idle")} disabled={busy} className="link-static text-[0.9rem] text-ink">
              Annuleren
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="label-mono text-ink">Refund-historie</h3>
        {refunds.length === 0 ? (
          <p className="mt-3 text-[0.9rem] text-muted">Nog geen terugbetaling.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {refunds.map((refund) => (
              <li key={refund.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[0.9rem]">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {formatCents(refund.amountCents)} · {refundMethodLabels[refund.method]}
                  </span>
                  <span className="block text-[0.82rem] text-muted">
                    {refund.settledAt ? `Terugbetaald ${refund.method === "manual" ? day(refund.settledAt.slice(0, 10)) : formatDateTime(refund.settledAt)}` : `Aangemaakt ${formatDateTime(refund.createdAt)}`}
                    {refund.providerRefundId ? ` · ${refund.providerRefundId}` : refund.method === "mollie" ? " · nog geen Mollie-id" : ""}
                    {refund.note ? ` · ${refund.note}` : ""}
                  </span>
                  {refund.failureReason ? <span className="block text-[0.82rem] text-danger">{refund.failureReason}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={refundStatusTone[refund.status]}>{refundStatusLabels[refund.status]}</StatusBadge>
                  {refund.method === "mollie" && (refund.status === "pending" || refund.status === "processing") ? (
                    <button
                      type="button"
                      className="link-static text-[0.85rem] text-ink"
                      disabled={refresh.pending}
                      onClick={() => refresh.save(() => refreshRefundStatus(props.creditNoteId, refund.id))}
                    >
                      {refresh.pending ? "Controleren…" : "Status controleren"}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {refresh.error ? (
          <p role="alert" className="mt-2 text-[0.85rem] text-danger">
            {refresh.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
