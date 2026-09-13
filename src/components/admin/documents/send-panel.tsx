"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import { sendInvoiceToCustomer, sendQuoteToCustomer } from "@/lib/admin/documents/send";
import { documentRecord, type DocumentView } from "@/lib/admin/documents/view";
import { formatDateTime } from "@/lib/admin/format";

/**
 * Sending the saved document to its customer.
 *
 * Deliberately two steps: the first click asks, the second sends. A quote or
 * invoice leaving for a customer cannot be taken back, and it is the moment
 * the definitive number is issued, so it should not be one stray click away.
 *
 * The server action reads the document from the database, not from this
 * screen — so the panel says what is about to be sent, and refuses while the
 * document has never been saved.
 *
 * Its own module, and not part of the PDF panel any more: sending is the one
 * thing here that always has to work, and the PDF renderer it used to sit next
 * to is a megabyte of JavaScript that most visits never need.
 */
export default function SendPanel({ doc }: { doc: DocumentView }) {
  const document = documentRecord(doc);
  const [confirming, setConfirming] = useState(false);
  const [sentNumber, setSentNumber] = useState<string | null>(null);
  const { save: run, pending, error } = useSave();

  const kindLabel = doc.kind === "quote" ? "offerte" : "factuur";
  const recipient = document.customer.email.trim();
  const saved = Boolean(document.id);
  const blocked = !saved
    ? `Sla de ${kindLabel} eerst op.`
    : !recipient
      ? "Deze klant heeft geen e-mailadres."
      : null;

  function send() {
    run(
      () => (doc.kind === "quote" ? sendQuoteToCustomer(document.id) : sendInvoiceToCustomer(document.id)),
      (number: string) => {
        setSentNumber(number);
        setConfirming(false);
      },
    );
  }

  return (
    <div className="border-t border-line pt-4">
      <h3 className="label-mono text-ink">Versturen</h3>

      {document.sentAt ? (
        <p className="mt-3 text-[0.85rem] leading-snug text-muted">
          Verstuurd op {formatDateTime(document.sentAt)}
          {document.recipientEmail ? ` naar ${document.recipientEmail}` : ""}.
        </p>
      ) : null}

      {sentNumber ? (
        <p role="status" className="mt-3 text-[0.85rem] leading-snug text-success">
          Verstuurd naar {recipient} met nummer {sentNumber}.
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 space-y-3 rounded-sm border border-line bg-paper-deep p-4">
          <p className="text-[0.85rem] leading-snug text-body">
            De opgeslagen {kindLabel} gaat als PDF naar <span className="text-ink">{recipient}</span>.
            {document.number.provisional
              ? " Daarbij wordt het definitieve nummer toegekend."
              : ` Het nummer blijft ${document.number.value}.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton onClick={send} disabled={pending}>
              {pending ? "Versturen…" : "Definitief versturen"}
            </AdminButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="link-static text-[0.9rem] text-ink"
            >
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <AdminButton
          variant="secondary"
          className="mt-3"
          disabled={Boolean(blocked)}
          onClick={() => {
            setSentNumber(null);
            setConfirming(true);
          }}
        >
          {document.sentAt ? "Opnieuw versturen" : "Versturen naar klant"}
        </AdminButton>
      )}

      {blocked ? <p className="mt-2 text-[0.82rem] text-muted">{blocked}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
