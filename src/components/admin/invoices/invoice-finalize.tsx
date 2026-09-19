"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import { isProvisionalDocumentNumber } from "@/lib/admin/documents/numbering";
import { cancelInvoice, finalizeInvoice } from "@/lib/admin/invoices/finalize";
import type { Invoice } from "@/lib/admin/invoices/types";

/**
 * Turning a concept into a document.
 *
 * Two steps on purpose, like sending: the first click asks, the second acts.
 * This is where the official number is taken, and a number is not a thing to
 * hand out by brushing against a button -- the sequence never gives the same
 * one twice, so an invoice issued by accident leaves a gap that has to be
 * explained to an accountant.
 *
 * The confirmation says the two things that become true and cannot be undone:
 * the invoice gets its number, and the figures freeze. It also says what will
 * happen to the payment reference, because that is the one field whose
 * behaviour depends on what the admin typed.
 */
export default function InvoiceFinalize({ invoice, ready }: { invoice: Invoice; ready: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { save, pending, error } = useSave();
  const cancelling = useSave();

  const followsNumber = !invoice.paymentReference.trim() || isProvisionalDocumentNumber(invoice.paymentReference);
  const blocked = !invoice.id ? "Sla de factuur eerst op." : !ready ? "Vul een klant en minstens één volledige regel in." : null;

  return (
    <div className="border-t border-line pt-6">
      <h3 className="label-mono text-ink">Definitief maken</h3>

      {invoice.finalizingAt ? (
        /*
          Not a concept any more: the number is taken and the figures are
          frozen, only the PDF never got stored. Finishing that is one click
          and needs no warning -- nothing more becomes irreversible.
        */
        <>
          <p className="mt-3 text-[0.85rem] leading-snug text-muted">
            {invoice.number.value} is al toegekend. Er wordt geen nieuw nummer gemaakt; alleen de definitieve PDF wordt
            alsnog opgeslagen.
          </p>
          <AdminButton className="mt-3" disabled={pending} onClick={() => save(() => finalizeInvoice(invoice.id))}>
            {pending ? "Bezig…" : "Definitief maken afronden"}
          </AdminButton>
        </>
      ) : confirming ? (
        <div className="mt-3 space-y-3 rounded-sm border border-line bg-paper-deep p-4">
          <p className="text-[0.85rem] leading-snug text-body">
            Na definitief maken krijgt deze factuur een officieel factuurnummer en kan de financiële inhoud niet meer
            worden gewijzigd.
          </p>
          <p className="text-[0.85rem] leading-snug text-muted">
            {followsNumber
              ? "Het betalingskenmerk wordt dat factuurnummer."
              : `Het betalingskenmerk blijft ${invoice.paymentReference}.`}{" "}
            De PDF wordt één keer gemaakt en opgeslagen; precies dat bestand bekijk je daarna en gaat later naar de
            klant. Er gaat nu nog niets naar de klant.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton onClick={() => save(() => finalizeInvoice(invoice.id), () => setConfirming(false))} disabled={pending}>
              {pending ? "Bezig…" : "Definitief maken"}
            </AdminButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="link-static text-[0.9rem] text-ink"
            >
              Terug
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[0.85rem] leading-snug text-muted">
            Dit is nog een concept: {invoice.number.value} is een voorlopig nummer. Bij definitief maken komt het
            officiële YM-F-nummer uit de jaarreeks en liggen de bedragen vast.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AdminButton disabled={Boolean(blocked)} onClick={() => setConfirming(true)}>
              Definitief maken
            </AdminButton>
            {invoice.id && invoice.status !== "cancelled" ? (
              <button
                type="button"
                disabled={cancelling.pending}
                onClick={() => cancelling.save(() => cancelInvoice(invoice.id))}
                className="link-static text-[0.9rem] text-ink"
              >
                {cancelling.pending ? "Annuleren…" : "Concept annuleren"}
              </button>
            ) : null}
          </div>
        </>
      )}

      {blocked ? <p className="mt-2 text-[0.82rem] text-muted">{blocked}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
      {cancelling.error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {cancelling.error}
        </p>
      ) : null}
    </div>
  );
}
