"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import { centsToInput, formatCents, parseCents } from "@/lib/money";
import { recordManualPayment } from "@/lib/payments/payment-actions";

/** "Betaling registreren": a bank transfer, entered by hand against this invoice. */
export default function RecordPayment({ invoiceId, outstandingCents, todayKey }: { invoiceId: string; outstandingCents: number; todayKey: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToInput(outstandingCents));
  const [paidOn, setPaidOn] = useState(todayKey);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { save, pending, error } = useSave();

  const cents = parseCents(amount);
  const invalid = cents === null || cents <= 0 ? "Vul een bedrag hoger dan nul in." : cents > outstandingCents ? `Maximaal ${formatCents(outstandingCents)} (wat nog openstaat).` : null;

  if (outstandingCents <= 0) return null;

  return (
    <div className="space-y-3">
      {done ? (
        <p role="status" className="text-[0.9rem] text-success">
          {done}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-4 rounded-sm border border-line bg-paper-deep p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="payment-amount" label="Ontvangen bedrag" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" error={invalid ?? undefined} />
            <TextField id="payment-date" label="Ontvangen op" type="date" value={paidOn} max={todayKey} onChange={(event) => setPaidOn(event.target.value)} />
          </div>
          <TextField id="payment-note" label="Omschrijving (optioneel)" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Bankoverschrijving" />
          {error ? (
            <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton
              disabled={pending || Boolean(invalid)}
              onClick={() =>
                save(
                  () => recordManualPayment(invoiceId, { amountCents: cents ?? 0, paidOn, note }),
                  () => {
                    setOpen(false);
                    setDone(`${formatCents(cents ?? 0)} als bankoverschrijving vastgelegd.`);
                  },
                )
              }
            >
              {pending ? "Vastleggen…" : "Betaling vastleggen"}
            </AdminButton>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="link-static text-[0.9rem] text-ink">
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <AdminButton variant="secondary" onClick={() => setOpen(true)}>
          Betaling registreren
        </AdminButton>
      )}
    </div>
  );
}
