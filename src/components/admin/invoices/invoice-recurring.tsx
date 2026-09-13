"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import type { Project } from "@/lib/admin/projects/types";
import { activationStatusLabels, activationStatusTone, type ActivationStatus } from "@/lib/payments/activation-decision";
import { attachRecurringToInvoice, detachRecurringFromInvoice } from "@/lib/payments/actions";
import { earliestDebitDate, prenotificationDays } from "@/lib/payments/prenotification";
import { recurringChargeCents, type RecurringService } from "@/lib/payments/types";
import { formatCents, parseCents } from "@/lib/money";

/**
 * "Maandelijkse service activeren" on an invoice.
 *
 * One payment can do two things: settle this invoice and authorise the monthly
 * collection that follows it. That is what this block records -- not an extra
 * line on the invoice, and not a monthly amount stored on it. The monthly
 * service is a `recurring_services` row like any other, and the only new fact
 * is which invoice switches it on.
 *
 * The admin never sees a sequence type, a customer id or a mandate id. They
 * pick or type a service, name the day of the first collection, and the send
 * flow decides whether the customer still has to authorise anything at all.
 */
const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

type InvoiceRecurringProps = {
  invoiceId: string;
  /** Services of this customer that could still be switched on by an invoice. */
  services: RecurringService[];
  /** The one this invoice already activates, if it does. */
  attached?: RecurringService;
  /** What the admin needs to know about the collection, in plain words. */
  status: ActivationStatus;
  /** Whether the one-off invoice itself has been paid. */
  invoicePaid: boolean;
  projects: Project[];
  defaultProjectId?: string;
  /** Sent invoices are fixed; what they promised the customer stands. */
  sent: boolean;
  /** Today, from the server, so client and server judge the same calendar. */
  todayKey: string;
};

export default function InvoiceRecurring({
  invoiceId,
  services,
  attached,
  status,
  invoicePaid,
  projects,
  defaultProjectId,
  sent,
  todayKey,
}: InvoiceRecurringProps) {
  /*
    A collection is announced fourteen calendar days ahead, and this invoice
    mail is that announcement, so a date sooner than that cannot be honoured.
    The field will not offer it and the server refuses it as well.
  */
  const earliest = earliestDebitDate(todayKey);
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [startsOn, setStartsOn] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const { save, pending, error: saveError, savedAt } = useSave();
  const detach = useSave();

  // Picking an existing service fills the fields with what it already says, so
  // the admin corrects figures rather than retypes them.
  function pick(id: string) {
    setServiceId(id);
    const chosen = services.find((service) => service.id === id);
    if (!chosen) return;
    setName(chosen.name);
    setAmount((chosen.amountCents / 100).toFixed(2).replace(".", ","));
    setVatRate(String(chosen.vatRate));
    if (chosen.startsOn && chosen.startsOn >= earliest) setStartsOn(chosen.startsOn);
    if (chosen.projectId) setProjectId(chosen.projectId);
  }

  function submit() {
    const amountCents = parseCents(amount);
    if (!name.trim()) return setError("Vul een naam voor de maandelijkse service in.");
    if (amountCents === null || amountCents <= 0) return setError("Vul een maandbedrag hoger dan nul in.");
    if (!startsOn) return setError("Kies de datum van de eerste automatische incasso.");
    if (startsOn < earliest) {
      return setError(
        `De eerste automatische incasso moet minstens ${prenotificationDays} dagen na vandaag liggen, dus op ${day(earliest)} of later.`,
      );
    }
    setError(null);

    save(
      () =>
        attachRecurringToInvoice(invoiceId, {
          ...(serviceId ? { serviceId } : {}),
          name,
          amountCents,
          vatRate: Number(vatRate),
          startsOn,
          ...(projectId ? { projectId } : {}),
        }),
      () => setOpen(false),
    );
  }

  if (attached) {
    return (
      <div className="space-y-3">
        <dl className="space-y-1 text-[0.9rem]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <dt className="text-muted">Eenmalige factuur</dt>
            <dd className="text-ink">{invoicePaid ? "betaald" : "open"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <dt className="text-muted">Maandelijkse service</dt>
            <dd className="text-ink">
              {attached.name} · {formatCents(recurringChargeCents(attached))} per maand, incl. btw
            </dd>
          </div>
          {attached.startsOn ? (
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <dt className="text-muted">Eerste automatische incasso</dt>
              <dd className="tabular text-ink">{day(attached.startsOn)}</dd>
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <dt className="text-muted">Incasso</dt>
            <dd>
              <StatusBadge tone={activationStatusTone[status]}>{activationStatusLabels[status]}</StatusBadge>
            </dd>
          </div>
        </dl>
        <p className="text-[0.85rem] text-muted">
          {sent
            ? "De klant heeft deze factuur ontvangen; betalen activeert de maandelijkse incasso."
            : "Bij het versturen vraagt de betaallink meteen toestemming voor automatische incasso. Het maandbedrag wordt nu niet geïncasseerd."}
        </p>
        {sent ? null : (
          <>
            <AdminButton
              variant="secondary"
              className="min-h-8 px-3 text-[0.85rem]"
              disabled={detach.pending}
              onClick={() => detach.save(() => detachRecurringFromInvoice(invoiceId))}
            >
              {detach.pending ? "Ontkoppelen…" : "Loskoppelen van deze factuur"}
            </AdminButton>
            {detach.error ? (
              <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
                {detach.error}
              </p>
            ) : null}
          </>
        )}
      </div>
    );
  }

  if (sent) {
    return <p className="text-[0.9rem] text-muted">Deze factuur is verstuurd en activeert geen maandelijkse service.</p>;
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-[0.9rem] text-muted">
          Deze factuur activeert geen maandelijkse service. De klant betaalt alleen dit bedrag.
        </p>
        <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={() => setOpen(true)}>
          Maandelijkse service activeren
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {services.length > 0 ? (
        <SelectField
          id="recurring-existing"
          label="Bestaande dienst"
          optional
          value={serviceId}
          onChange={(event) => pick(event.target.value)}
          hint="Kies een dienst die deze klant al heeft, of laat leeg om een nieuwe aan te maken."
        >
          <option value="">Nieuwe dienst</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {formatCents(service.amountCents)} p/m excl. btw
            </option>
          ))}
        </SelectField>
      ) : null}

      <TextField
        id="recurring-service-name"
        label="Naam van de dienst"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Websitebeheer"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="recurring-service-amount"
          label="Bedrag per maand, excl. btw"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="25,00"
          inputMode="decimal"
        />
        <SelectField id="recurring-service-vat" label="Btw" value={vatRate} onChange={(event) => setVatRate(event.target.value)}>
          <option value="21">21%</option>
          <option value="9">9%</option>
          <option value="0">0%</option>
        </SelectField>
      </div>

      <TextField
        id="recurring-service-start"
        label="Eerste automatische incasso"
        type="date"
        value={startsOn}
        min={earliest}
        onChange={(event) => setStartsOn(event.target.value)}
        hint={`Vanaf deze dag wordt het maandbedrag geïncasseerd, nadat deze factuur betaald is. Minstens ${prenotificationDays} dagen na vandaag, dus op ${day(earliest)} of later: de factuurmail is de vooraankondiging.`}
      />

      <SelectField
        id="recurring-service-project"
        label="Project"
        optional
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
        hint={projects.length === 0 ? "Deze klant heeft nog geen projecten." : "De maandfacturen komen onder hetzelfde project te staan."}
      >
        <option value="">Geen project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </SelectField>

      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}

      <SaveControls label="Koppelen aan deze factuur" pending={pending} error={saveError} savedAt={savedAt} onSave={submit} />
      <AdminButton variant="secondary" onClick={() => setOpen(false)}>
        Annuleren
      </AdminButton>
    </div>
  );
}
