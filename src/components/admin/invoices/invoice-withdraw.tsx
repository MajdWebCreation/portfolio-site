"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import { cancelInvoice } from "@/lib/admin/invoices/finalize";

/**
 * Withdrawing a definitive invoice that is not going to be sent.
 *
 * Deliberately modest on the screen -- a link-sized action under the send
 * button, not a second primary one. It is the rarer choice, and the wording
 * says what it does and does not do: the number stays spent, because a
 * sequence that hands the same number to a second document is worth far more
 * trouble than a gap in the series.
 */
export default function InvoiceWithdraw({ invoiceId, number }: { invoiceId: string; number: string }) {
  const [confirming, setConfirming] = useState(false);
  const { save, pending, error } = useSave();

  return (
    <div className="border-t border-line pt-6">
      <h3 className="label-mono text-ink">Niet versturen</h3>

      {confirming ? (
        <div className="mt-3 space-y-3 rounded-sm border border-line bg-paper-deep p-4">
          <p className="text-[0.85rem] leading-snug text-body">
            {number} wordt geannuleerd. De factuur blijft bestaan en het nummer blijft gebruikt: het gaat niet terug
            naar de reeks en wordt nooit aan een andere factuur gegeven.
          </p>
          <p className="text-[0.85rem] leading-snug text-muted">
            Terug naar concept kan niet. Wil je andere bedragen, maak dan een nieuwe factuur aan.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton onClick={() => save(() => cancelInvoice(invoiceId), () => setConfirming(false))} disabled={pending}>
              {pending ? "Annuleren…" : "Factuur annuleren"}
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
            Deze factuur toch niet versturen? Annuleren houdt hem in de administratie, met het nummer erbij.
          </p>
          <button type="button" onClick={() => setConfirming(true)} className="link-static mt-3 text-[0.9rem] text-ink">
            Factuur annuleren
          </button>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
