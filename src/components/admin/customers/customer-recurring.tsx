"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField } from "@/components/admin/form-field";
import ActivationLines from "@/components/admin/payments/activation-lines";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { createRecurringService, sendRecurringActivation } from "@/lib/payments/actions";
import type { ActivationSummary } from "@/lib/payments/activation-view";
import {
  prenotificationStateLabels,
  prenotificationStateTone,
  type RecurringOverview,
} from "@/lib/payments/prenotification";
import { recurringStatusLabels, recurringStatusTone, type RecurringService } from "@/lib/payments/types";
import { formatCents, parseCents } from "@/lib/money";

/**
 * The customer's recurring services, and the two things an admin does with
 * them: add one, and ask the customer to authorise direct debit.
 *
 * Activation is never a status the admin picks. It is a link the customer has
 * to open, because only the customer can give a mandate -- so the button here
 * sends that link and the status follows from what actually happened.
 */
const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function CustomerRecurring({
  customerId,
  services,
  overviews,
  activations,
}: {
  customerId: string;
  services: RecurringService[];
  /** Next collection and announcement state per service, derived on the server. */
  overviews: Record<string, RecurringOverview>;
  /** How far the one-off invoice and the mandate have got, per service. */
  activations: Record<string, ActivationSummary>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [error, setError] = useState<string | null>(null);
  const { save, pending, error: saveError, savedAt } = useSave();
  const activation = useSave();
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit() {
    const amountCents = parseCents(amount);
    if (!name.trim()) return setError("Vul een naam in.");
    if (amountCents === null || amountCents <= 0) return setError("Vul een bedrag hoger dan nul in.");
    setError(null);

    save(
      () =>
        createRecurringService({
          customerId,
          name,
          description: "",
          amountCents,
          vatRate: Number(vatRate),
          status: "draft",
        }),
      () => {
        setName("");
        setAmount("");
        setAdding(false);
      },
    );
  }

  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">Terugkerende diensten</h2>

      {services.length === 0 ? (
        <p className="mt-3 text-[0.9rem] text-muted">Nog geen terugkerende diensten.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {services.map((service) => (
            <li key={service.id} className="py-2.5 text-[0.9rem]">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{service.name}</span>
                  <span className="block text-[0.82rem] text-muted">{formatCents(service.amountCents)} per maand, excl. btw</span>
                </span>
                <StatusBadge tone={recurringStatusTone[service.status]}>{recurringStatusLabels[service.status]}</StatusBadge>
              </div>
              <ActivationLines summary={activations[service.id]} />
              {service.mollie.subscriptionId ? (
                <Schedule overview={overviews[service.id]} />
              ) : service.status === "canceled" || activations[service.id]?.invoice ? null : (
                <AdminButton
                  variant="secondary"
                  className="mt-2 min-h-8 px-3 text-[0.85rem]"
                  disabled={activation.pending}
                  onClick={() =>
                    activation.save(() => sendRecurringActivation(service.id), (email: string) => setSentTo(email))
                  }
                >
                  {activation.pending ? "Versturen…" : "Incasso-activatielink versturen"}
                </AdminButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {activation.error ? (
        <p role="alert" className="mt-2 border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {activation.error}
        </p>
      ) : sentTo ? (
        <p className="mt-2 text-[0.85rem] text-muted">Activatielink verstuurd naar {sentTo}.</p>
      ) : null}

      {adding ? (
        <div className="mt-4 space-y-4">
          <TextField id="recurring-name" label="Naam" value={name} onChange={(event) => setName(event.target.value)} placeholder="Websitebeheer" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="recurring-amount" label="Bedrag per maand, excl. btw" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25,00" inputMode="decimal" />
            <SelectField id="recurring-vat" label="Btw" value={vatRate} onChange={(event) => setVatRate(event.target.value)}>
              <option value="21">21%</option>
              <option value="9">9%</option>
              <option value="0">0%</option>
            </SelectField>
          </div>
          {error ? (
            <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
              {error}
            </p>
          ) : null}
          <SaveControls label="Dienst toevoegen" pending={pending} error={saveError} savedAt={savedAt} onSave={submit} />
          <AdminButton variant="secondary" onClick={() => setAdding(false)}>
            Annuleren
          </AdminButton>
        </div>
      ) : (
        <AdminButton variant="secondary" className="mt-3 min-h-8 px-3 text-[0.85rem]" onClick={() => setAdding(true)}>
          Dienst toevoegen
        </AdminButton>
      )}
    </div>
  );
}

/**
 * What is coming for one collecting service. Every date here is derived from
 * the service's own anchor and its invoices; nothing is stored as a plan.
 */
function Schedule({ overview }: { overview?: RecurringOverview }) {
  if (!overview) return <p className="mt-1.5 text-[0.82rem] text-muted">Incasso loopt.</p>;

  if (!overview.debitOn) {
    return (
      <p className="mt-1.5 text-[0.82rem] text-danger">
        {overview.reason === "missing_anchor"
          ? "Geen startdatum vastgelegd; de incassodatum is niet te bepalen."
          : "Incasso loopt niet."}
      </p>
    );
  }

  return (
    <dl className="mt-2 space-y-1 text-[0.82rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <dt className="text-muted">Volgende incasso</dt>
        <dd className="tabular text-ink">{day(overview.debitOn)}</dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <dt className="text-muted">Vooraankondiging vanaf</dt>
        <dd className="tabular text-ink">{day(overview.announceFrom!)}</dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <dt className="text-muted">Aankondiging</dt>
        <dd>
          <StatusBadge tone={prenotificationStateTone[overview.state]}>
            {prenotificationStateLabels[overview.state]}
          </StatusBadge>
        </dd>
      </div>
      {overview.record?.sentAt ? (
        <p className="text-muted">Verzonden naar {overview.record.recipientEmail}.</p>
      ) : null}
      {overview.state === "failed" && overview.record?.error ? (
        <p className="text-danger">{overview.record.error}</p>
      ) : null}
    </dl>
  );
}
