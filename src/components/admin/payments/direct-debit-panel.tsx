"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import {
  createMandateActivation,
  mailMandateActivation,
  refreshDirectDebitStatus,
} from "@/lib/payments/actions";
import type { DirectDebitView } from "@/lib/payments/direct-debit-view";
import { directDebitStatusLabels, directDebitStatusTone } from "@/lib/payments/direct-debit-status";

/**
 * A customer's direct debit. Normally the customer authorises with the
 * online payment of an open invoice -- that one payment is also Mollie's
 * first payment (pay-link.ts) -- so there is nothing to do here but look
 * and ask Mollie again. The EUR 0.01 link is the recovery route for a
 * customer without an open invoice, for instance one who paid by bank
 * transfer; the server refuses it while an invoice is open.
 */
export default function DirectDebitPanel({
  customerId,
  view,
  context = "customer",
}: {
  customerId: string;
  view: DirectDebitView;
  context?: "customer" | "invoice";
}) {
  const create = useSave();
  const mail = useSave();
  const refresh = useSave();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const link = url ?? view.openLink?.url;
  const busy = create.pending || mail.pending || refresh.pending;

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // A valid or pending mandate is not asked for again; the server refuses it too.
  const canActivate = view.status === "not_active" || view.status === "problem";
  const error = create.error ?? mail.error ?? refresh.error;

  return (
    <div className="space-y-3 text-[0.9rem]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted">Automatische incasso</span>
        <StatusBadge tone={directDebitStatusTone[view.status]}>{directDebitStatusLabels[view.status]}</StatusBadge>
      </div>

      {view.lastPaid ? (
        <p className="text-[0.82rem] text-muted">
          Activatie betaald op {formatDateTime(view.lastPaid.paidAt)}
          {view.lastPaid.validatedAt ? `, machtiging bevestigd op ${formatDateTime(view.lastPaid.validatedAt)}` : ""}
          {view.lastPaid.checkedAt ? `. Laatst gecontroleerd ${formatDateTime(view.lastPaid.checkedAt)}.` : "."}
        </p>
      ) : null}

      <p className="text-[0.82rem] text-muted">
        De klant geeft de machtiging met de online betaling van een openstaande factuur
        {context === "invoice" ? ", zoals deze" : ""}: die ene betaling voldoet de factuur en is ook de eerste incassobetaling.
        Staat er geen factuur open, bijvoorbeeld omdat die per overschrijving is betaald, dan kun je een losse activatielink van
        €0,01 maken. Dat bedrag wordt nergens mee verrekend.
      </p>

      {link ? (
        <div className="space-y-2 rounded-sm border border-line bg-paper-deep px-3 py-2">
          {view.openLink ? (
            <p className="text-[0.82rem] text-muted">
              Aangemaakt op {formatDateTime(view.openLink.createdAt)} ·{" "}
              {view.openLink.mailedAt ? `gemaild op ${formatDateTime(view.openLink.mailedAt)}` : "nog niet gemaild"}
            </p>
          ) : null}
          <p className="break-all font-mono text-[0.78rem] text-ink">{link}</p>
          <div className="flex flex-wrap gap-2">
            <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={() => copy(link)}>
              {copied ? "Gekopieerd" : "Activatielink kopiëren"}
            </AdminButton>
            <AdminButton
              variant="secondary"
              className="min-h-8 px-3 text-[0.85rem]"
              disabled={busy}
              onClick={() => mail.save(() => mailMandateActivation(customerId), (email: string) => setSentTo(email))}
            >
              {mail.pending ? "Versturen…" : "Activatielink mailen"}
            </AdminButton>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canActivate && !link ? (
          <AdminButton
            variant="secondary"
            className="min-h-8 px-3 text-[0.85rem]"
            disabled={busy}
            onClick={() => create.save(() => createMandateActivation(customerId), (value) => setUrl(value.url))}
          >
            {create.pending ? "Aanmaken…" : "Losse activatielink (€0,01)"}
          </AdminButton>
        ) : null}
        {/* Also when nothing is on record: an invoice payment may have given the mandate while its webhook went missing. */}
        <AdminButton
          variant="secondary"
          className="min-h-8 px-3 text-[0.85rem]"
          disabled={busy}
          onClick={() => refresh.save(() => refreshDirectDebitStatus(customerId))}
        >
          {refresh.pending ? "Controleren…" : "Status controleren"}
        </AdminButton>
      </div>

      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : sentTo ? (
        <p className="text-[0.85rem] text-muted">Activatielink verstuurd naar {sentTo}.</p>
      ) : null}
    </div>
  );
}
