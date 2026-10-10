"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import StoredDocument from "@/components/admin/documents/stored-document";
import { useSave } from "@/components/admin/save-controls";
import type { RecipientResult } from "@/lib/admin/communications/recipient";
import { creditNoteDocumentFile, finishCreditNoteIssue, sendCreditNoteToCustomer } from "@/lib/admin/credit-notes/actions";
import type { CreditNote } from "@/lib/admin/credit-notes/types";
import { formatDateTime } from "@/lib/admin/format";

/** The PDF, finishing an interrupted issue, and sending: the document side of a credit note. */
export default function CreditNoteActions({ creditNote, recipient }: { creditNote: CreditNote; recipient: RecipientResult }) {
  const finish = useSave();
  const send = useSave();
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<{ number: string; recipient: string } | null>(null);

  return (
    <div className="space-y-6">
      <section aria-labelledby="credit-pdf" className="space-y-4">
        <h2 id="credit-pdf" className="label-mono text-ink">
          PDF
        </h2>
        {creditNote.document ? (
          <StoredDocument document={creditNote.document} load={() => creditNoteDocumentFile(creditNote.id)} title="Definitieve creditnota" />
        ) : (
          <>
            <p className="text-[0.85rem] leading-snug text-danger">
              Het afronden is niet klaar: er is geen opgeslagen PDF. Het nummer {creditNote.number.value} blijft van deze creditnota.
            </p>
            <AdminButton disabled={finish.pending} onClick={() => finish.save(() => finishCreditNoteIssue(creditNote.id))}>
              {finish.pending ? "Afronden…" : "Creditnota afronden"}
            </AdminButton>
            {finish.error ? (
              <p role="alert" className="text-[0.85rem] text-danger">
                {finish.error}
              </p>
            ) : null}
          </>
        )}
      </section>

      {creditNote.document ? (
        <div className="border-t border-line pt-4">
          <h3 className="label-mono text-ink">Versturen</h3>
          {creditNote.sentAt ? (
            <p className="mt-3 text-[0.85rem] leading-snug text-muted">
              Verstuurd op {formatDateTime(creditNote.sentAt)}
              {creditNote.recipientEmail ? ` naar ${creditNote.recipientEmail}` : ""}.
            </p>
          ) : null}
          {sent ? (
            <p role="status" className="mt-3 text-[0.85rem] leading-snug text-success">
              Verstuurd naar {sent.recipient} met nummer {sent.number}.
            </p>
          ) : null}
          {confirming ? (
            <div className="mt-3 space-y-3 rounded-sm border border-line bg-paper-deep p-4">
              <p className="text-[0.85rem] leading-snug text-body">
                De creditnota gaat als PDF naar <span className="text-ink">{recipient.ok ? recipient.recipient.email : "—"}</span>. Er wordt hiermee niets terugbetaald; dat is een aparte stap hieronder.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <AdminButton
                  onClick={() =>
                    send.save(
                      () => sendCreditNoteToCustomer(creditNote.id),
                      (value) => {
                        setSent(value);
                        setConfirming(false);
                      },
                    )
                  }
                  disabled={send.pending}
                >
                  {send.pending ? "Versturen…" : "Definitief versturen"}
                </AdminButton>
                <button type="button" onClick={() => setConfirming(false)} disabled={send.pending} className="link-static text-[0.9rem] text-ink">
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <AdminButton
              variant="secondary"
              className="mt-3"
              disabled={!recipient.ok}
              onClick={() => {
                setSent(null);
                setConfirming(true);
              }}
            >
              {creditNote.sentAt ? "Opnieuw versturen" : "Versturen naar klant"}
            </AdminButton>
          )}
          {!recipient.ok ? <p className="mt-2 text-[0.82rem] text-muted">{recipient.reason}</p> : null}
          {send.error ? (
            <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
              {send.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
