"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField } from "@/components/admin/form-field";
import DirectDebitPanel from "@/components/admin/payments/direct-debit-panel";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  cancelRecurringService,
  createRecurringService,
  markRecurringCreditSettled,
  scheduleRecurringPriceChange,
  startMonthlyCollection,
  withdrawRecurringCancellation,
  withdrawRecurringPriceChange,
} from "@/lib/payments/actions";
import { cancellationPlan, type CancellationPlan } from "@/lib/payments/cancellation-plan";
import type { DirectDebitView } from "@/lib/payments/direct-debit-view";
import {
  prenotificationStateLabels,
  prenotificationStateTone,
  type RecurringOverview,
} from "@/lib/payments/prenotification";
import type { RecurringManagement } from "@/lib/payments/recurring-management";
import type { MailResult } from "@/lib/payments/service-change-email";
import { recurringLifecycleLabel, recurringLifecycleTone, type RecurringService } from "@/lib/payments/types";
import { calculateTotals, formatCents, parseCents } from "@/lib/money";

/**
 * The customer's direct debit and recurring services.
 *
 * Three steps, each visible on its own: the activation link the customer pays
 * EUR 0.01 through (`DirectDebitPanel`), the mandate Mollie then confirms,
 * and -- per service, only once that mandate is valid -- starting the monthly
 * collection. Activation is never a status the admin picks; it follows from
 * what the customer and Mollie actually did.
 *
 * Once a service collects, two more things can be done with it, and both
 * are confirmed on a screen that says exactly what will happen and when:
 * changing the monthly price from a coming period, and ending the service
 * after its notice. Every date and amount shown comes from the server's
 * `RecurringManagement`; nothing is computed here, so what is promised is
 * what the action does.
 */
const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function CustomerRecurring({
  customerId,
  services,
  overviews,
  managements,
  directDebit,
  firstCollections,
  todayKey,
}: {
  customerId: string;
  services: RecurringService[];
  /** Next collection and announcement state per service, derived on the server. */
  overviews: Record<string, RecurringOverview>;
  /** What may be done with each service and what it would mean, derived on the server. */
  managements: Record<string, RecurringManagement>;
  /** Where the customer's direct debit stands, from what Mollie last said. */
  directDebit: DirectDebitView;
  /** Per service without a subscription: the earliest first collection, from the server. */
  firstCollections: Record<string, string>;
  todayKey: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [error, setError] = useState<string | null>(null);
  const { save, pending, error: saveError, savedAt } = useSave();
  const start = useSave();
  const [startDates, setStartDates] = useState<Record<string, string>>({});

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
      <h2 className="label-mono text-ink">Automatische incasso</h2>
      <div className="mt-3">
        <DirectDebitPanel customerId={customerId} view={directDebit} />
      </div>

      <h2 className="label-mono mt-8 text-ink">Terugkerende diensten</h2>

      {services.length === 0 ? (
        <p className="mt-3 text-[0.9rem] text-muted">Nog geen terugkerende diensten.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {services.map((service) => {
            const management = managements[service.id];
            return (
              <li key={service.id} className="py-2.5 text-[0.9rem]">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{service.name}</span>
                    <span className="block text-[0.82rem] text-muted">
                      {management ? (
                        <>
                          {management.lifecycle === "ended" ? "Laatste maandbedrag" : "Huidig maandbedrag"}:{" "}
                          {formatCents(management.currentNetCents)} excl. btw · {formatCents(management.currentGrossCents)} incl. btw
                        </>
                      ) : (
                        <>{formatCents(service.amountCents)} per maand, excl. btw</>
                      )}
                    </span>
                  </span>
                  <StatusBadge tone={recurringLifecycleTone(service, todayKey)}>
                    {recurringLifecycleLabel(service, todayKey, day)}
                  </StatusBadge>
                </div>

                {management?.scheduled ? <ScheduledPrice serviceId={service.id} management={management} /> : null}

                {service.mollie.subscriptionId ? (
                  <Schedule overview={overviews[service.id]} />
                ) : service.status === "canceled" ? null : directDebit.status !== "active" ? (
                  <p className="mt-1.5 text-[0.82rem] text-muted">
                    Maandelijkse incasso kan starten zodra de machtiging geldig is.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <TextField
                      id={`first-collection-${service.id}`}
                      label="Eerste automatische incasso"
                      type="date"
                      value={startDates[service.id] ?? firstCollections[service.id] ?? ""}
                      min={firstCollections[service.id]}
                      onChange={(event) => setStartDates({ ...startDates, [service.id]: event.target.value })}
                      hint={`Op zijn vroegst ${firstCollections[service.id] ? day(firstCollections[service.id]!) : "–"}: na alle gefactureerde periodes en minstens 14 dagen vooruit, zodat de vooraankondiging op tijd komt.`}
                    />
                    <AdminButton
                      variant="secondary"
                      className="min-h-8 px-3 text-[0.85rem]"
                      disabled={start.pending}
                      onClick={() =>
                        start.save(() => {
                          const chosen = startDates[service.id];
                          return startMonthlyCollection(
                            service.id,
                            chosen && chosen !== firstCollections[service.id] ? chosen : undefined,
                          );
                        })
                      }
                    >
                      {start.pending ? "Starten…" : "Maandelijkse incasso starten"}
                    </AdminButton>
                  </div>
                )}

                {management?.ending ? <Ending serviceId={service.id} management={management} /> : null}

                {management?.warning ? (
                  <p role="alert" className="mt-2 border-l-2 border-danger pl-3 text-[0.82rem] text-danger">
                    {management.warning}
                  </p>
                ) : null}

                {management && (management.canChangePrice || management.canCancel) ? (
                  <ServiceActions service={service} management={management} overview={overviews[service.id]} />
                ) : null}

                {management && management.history.length > 0 ? <PriceHistory history={management.history} /> : null}
              </li>
            );
          })}
        </ul>
      )}

      {start.error ? (
        <p role="alert" className="mt-2 border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {start.error}
        </p>
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

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <dt className="text-muted">{term}</dt>
      <dd className="tabular text-right text-ink">{children}</dd>
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
      <p className={`mt-1.5 text-[0.82rem] ${overview.reason === "ended" ? "text-muted" : "text-danger"}`}>
        {overview.reason === "missing_anchor"
          ? "Geen startdatum vastgelegd; de incassodatum is niet te bepalen."
          : overview.reason === "ended"
            ? "Geen incasso meer gepland; alle termijnen tot de einddatum zijn gefactureerd."
            : "Incasso loopt niet."}
      </p>
    );
  }

  return (
    <dl className="mt-2 space-y-1 text-[0.82rem]">
      <Row term="Volgende incasso">
        {day(overview.debitOn)} · {formatCents(overview.amountCents!)} incl. btw
      </Row>
      <Row term="Vooraankondiging vanaf">{day(overview.announceFrom!)}</Row>
      <Row term="Aankondiging">
        <StatusBadge tone={prenotificationStateTone[overview.state]}>{prenotificationStateLabels[overview.state]}</StatusBadge>
      </Row>
      {overview.record?.sentAt ? <p className="text-muted">Verzonden naar {overview.record.recipientEmail}.</p> : null}
      {overview.state === "failed" && overview.record?.error ? <p className="text-danger">{overview.record.error}</p> : null}
    </dl>
  );
}

/** The planned price, next to the current one, so the two are never confused. */
function ScheduledPrice({ serviceId, management }: { serviceId: string; management: RecurringManagement }) {
  const scheduled = management.scheduled!;
  const withdraw = useSave();
  return (
    <div className="mt-2 border-l-2 border-accent pl-3 text-[0.82rem]">
      <p className="font-medium text-ink">
        Prijswijziging gepland: {formatCents(scheduled.newNetCents)} excl. btw · {formatCents(scheduled.newGrossCents)} incl. btw
      </p>
      {scheduled.blockedReason ? (
        <p role="alert" className="text-danger">
          Geblokkeerd: {scheduled.blockedReason} Het nieuwe bedrag geldt voor geen enkele periode totdat je de wijziging intrekt of opnieuw plant.
        </p>
      ) : (
        <>
          <p className="text-muted">
            Vanaf {day(scheduled.effectiveFrom)}. Tot die dag geldt het huidige bedrag.
            {scheduled.rescheduledFrom
              ? ` Verschoven van ${day(scheduled.rescheduledFrom)}: Mollie had de incasso van die periode al aangemaakt voor het oude bedrag.`
              : ""}
          </p>
          <p className="text-muted">
            {scheduled.providerUpdated
              ? "Mollie is bijgewerkt; de factuur voor de eerste periode tegen het nieuwe bedrag is aangemaakt."
              : `Op ${day(scheduled.announceFrom)} controleert de dagelijkse taak bij Mollie of de incasso van ${day(scheduled.effectiveFrom)} nog niet is aangemaakt en werkt dan het bedrag bij, samen met de vooraankondiging van die periode. Bestaat die incasso al, dan schuift de wijziging een periode op.`}
          </p>
        </>
      )}
      {scheduled.withdrawable ? (
        <AdminButton
          variant="secondary"
          className="mt-1.5 min-h-7 px-2.5 text-[0.8rem]"
          disabled={withdraw.pending}
          onClick={() => withdraw.save(() => withdrawRecurringPriceChange(serviceId, scheduled.changeId))}
        >
          {withdraw.pending ? "Intrekken…" : "Prijswijziging intrekken"}
        </AdminButton>
      ) : null}
      {withdraw.error ? (
        <p role="alert" className="mt-1 text-danger">
          {withdraw.error}
        </p>
      ) : null}
    </div>
  );
}

/** The planned or reached end of a service, and what still happens before it. */
function Ending({ serviceId, management }: { serviceId: string; management: RecurringManagement }) {
  const ending = management.ending!;
  const withdraw = useSave();
  const credit = useSave();
  const ended = management.lifecycle === "ended";
  return (
    <div className="mt-2 border-l-2 border-line-strong pl-3 text-[0.82rem]">
      <p className="font-medium text-ink">{ended ? `Beëindigd op ${day(ending.endsOn)}` : `Opgezegd — eindigt op ${day(ending.endsOn)}`}</p>
      <dl className="mt-1 space-y-1">
        {ending.requestedAt ? <Row term="Opgezegd op">{formatDateTime(ending.requestedAt)}</Row> : null}
        <Row term="Laatste termijn">
          {day(ending.lastTerm.period.start)} t/m {day(ending.lastTerm.partial ? ending.endsOn : ending.lastTerm.period.end)}
          {ending.lastTerm.partial ? ` (${ending.lastTerm.daysUsed} van ${ending.lastTerm.periodDays} dagen)` : ""} · {formatCents(ending.lastTermGrossCents)} incl. btw
        </Row>
        {ending.lastTerm.partial ? (
          <Row term="Afstemming Mollie">
            {ending.lastTermSynced ? "Bedrag laatste termijn afgestemd" : "Nog niet afgestemd; de dagelijkse taak doet dit"}
          </Row>
        ) : null}
        {ending.creditDue ? (
          <Row term="Te crediteren">
            {formatCents(ending.creditDue.grossCents)} incl. btw voor {ending.creditDue.days} dagen na {day(ending.endsOn)}
          </Row>
        ) : null}
        {ending.creditDue ? (
          <Row term="Creditering">
            {ending.creditDue.settledAt ? (
              `Verwerkt op ${formatDateTime(ending.creditDue.settledAt)}`
            ) : (
              <StatusBadge tone="accent">Open — handmatig crediteren en terugbetalen</StatusBadge>
            )}
          </Row>
        ) : null}
        <Row term="Nog te incasseren">
          {ending.collectionsAhead.length > 0 ? ending.collectionsAhead.map(day).join(", ") : "Niets meer"}
        </Row>
        <Row term="Mollie-abonnement">
          {ending.subscriptionCanceledAt
            ? `Geannuleerd op ${formatDateTime(ending.subscriptionCanceledAt)}`
            : `Wordt geannuleerd op ${day(ending.providerCancelFrom)}`}
        </Row>
      </dl>
      {management.canWithdrawCancellation ? (
        <AdminButton
          variant="secondary"
          className="mt-1.5 min-h-7 px-2.5 text-[0.8rem]"
          disabled={withdraw.pending}
          onClick={() => withdraw.save(() => withdrawRecurringCancellation(serviceId))}
        >
          {withdraw.pending ? "Intrekken…" : "Opzegging intrekken"}
        </AdminButton>
      ) : null}
      {ending.creditDue && !ending.creditDue.settledAt ? (
        <AdminButton
          variant="secondary"
          className="mt-1.5 min-h-7 px-2.5 text-[0.8rem]"
          disabled={credit.pending}
          onClick={() => credit.save(() => markRecurringCreditSettled(serviceId))}
        >
          {credit.pending ? "Vastleggen…" : "Creditering als verwerkt markeren"}
        </AdminButton>
      ) : null}
      {credit.error ? (
        <p role="alert" className="mt-1 text-danger">
          {credit.error}
        </p>
      ) : null}
      {withdraw.error ? (
        <p role="alert" className="mt-1 text-danger">
          {withdraw.error}
        </p>
      ) : null}
    </div>
  );
}

function MailNote({ mail }: { mail?: MailResult }) {
  if (!mail) return null;
  return mail.sent ? (
    <p className="text-[0.82rem] text-muted">Bevestiging gemaild.</p>
  ) : (
    <p role="alert" className="text-[0.82rem] text-danger">
      Vastgelegd, maar de bevestigingsmail is niet verstuurd: {mail.reason}
    </p>
  );
}

/** The two things an admin can do with a collecting service, each behind its own confirmation. */
function ServiceActions({
  service,
  management,
  overview,
}: {
  service: RecurringService;
  management: RecurringManagement;
  overview?: RecurringOverview;
}) {
  const [open, setOpen] = useState<"price" | "cancel" | null>(null);

  return (
    <div className="mt-3">
      {open === null ? (
        <div className="flex flex-wrap gap-2">
          {management.canChangePrice ? (
            <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={() => setOpen("price")}>
              Maandbedrag wijzigen
            </AdminButton>
          ) : null}
          {management.canCancel ? (
            <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={() => setOpen("cancel")}>
              Dienst opzeggen
            </AdminButton>
          ) : null}
        </div>
      ) : open === "price" ? (
        <PriceChangeForm service={service} management={management} overview={overview} onClose={() => setOpen(null)} />
      ) : (
        <CancellationForm service={service} management={management} overview={overview} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function PriceChangeForm({
  service,
  management,
  overview,
  onClose,
}: {
  service: RecurringService;
  management: RecurringManagement;
  overview?: RecurringOverview;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(management.priceOptions[0]?.effectiveFrom ?? "");
  const [sendMail, setSendMail] = useState(true);
  const [mail, setMail] = useState<MailResult | undefined>();
  const { save, pending, error } = useSave();

  const newNetCents = parseCents(amount);
  const valid = newNetCents !== null && newNetCents > 0 && newNetCents !== management.currentNetCents;
  const newGrossCents =
    newNetCents !== null && newNetCents > 0
      ? calculateTotals([{ quantityHundredths: 100, unitPriceCents: newNetCents, vatRate: service.vatRate }]).totalCents
      : null;
  const option = management.priceOptions.find((candidate) => candidate.effectiveFrom === effectiveFrom);
  /* The next collection keeps its own price when the change starts later. */
  const nextKeepsOld = Boolean(overview?.debitOn && option && overview.debitOn < option.effectiveFrom);

  return (
    <div className="space-y-3 rounded-sm border border-line bg-surface p-3">
      <p className="label-mono text-ink">Maandbedrag wijzigen</p>
      <TextField
        id={`price-${service.id}`}
        label="Nieuw bedrag per maand, excl. btw"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="15,00"
        inputMode="decimal"
        error={amount && newNetCents === management.currentNetCents ? "Dit is het huidige bedrag." : undefined}
      />
      <SelectField
        id={`price-from-${service.id}`}
        label="Ingangsdatum"
        value={effectiveFrom}
        onChange={(event) => setEffectiveFrom(event.target.value)}
        hint="Altijd het begin van een nog niet gefactureerde maandperiode, minstens 14 dagen vooruit. Een periode die al is aangekondigd houdt haar prijs."
      >
        {management.priceOptions.map((candidate) => (
          <option key={candidate.effectiveFrom} value={candidate.effectiveFrom}>
            {day(candidate.effectiveFrom)}
          </option>
        ))}
      </SelectField>

      <dl className="space-y-1 text-[0.82rem]">
        <Row term="Dienst">{service.name}</Row>
        <Row term="Huidig">
          {formatCents(management.currentNetCents)} excl. · {formatCents(management.currentGrossCents)} incl. btw
        </Row>
        <Row term="Nieuw">
          {newNetCents !== null && newNetCents > 0 && newGrossCents !== null
            ? `${formatCents(newNetCents)} excl. · ${formatCents(newGrossCents)} incl. btw`
            : "—"}
        </Row>
        <Row term="Ingangsdatum">{option ? day(option.effectiveFrom) : "—"}</Row>
        <Row term="Eerstvolgende incasso">
          {overview?.debitOn ? `${day(overview.debitOn)} · ${formatCents(overview.amountCents!)} incl. btw` : "—"}
        </Row>
      </dl>
      {option ? (
        <p className="text-[0.82rem] text-muted">
          {nextKeepsOld
            ? `De incasso van ${day(overview!.debitOn!)} blijft ${formatCents(overview!.amountCents!)}; die periode is of wordt tegen het huidige bedrag aangekondigd. `
            : ""}
          Vanaf {day(option.effectiveFrom)} int Mollie {newGrossCents !== null ? formatCents(newGrossCents) : "het nieuwe bedrag"} per maand. De factuur en
          vooraankondiging voor die eerste periode gaan op {day(option.announceFrom)} uit, en Mollie wordt diezelfde dag bijgewerkt. Je machtiging en je andere
          diensten veranderen niet.
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-[0.85rem] text-ink">
        <input type="checkbox" checked={sendMail} onChange={(event) => setSendMail(event.target.checked)} />
        Bevestiging naar de klant mailen
      </label>
      <MailNote mail={mail} />
      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AdminButton
          className="min-h-8 px-3 text-[0.85rem]"
          disabled={pending || !valid || !option}
          onClick={() =>
            save(
              () => scheduleRecurringPriceChange(service.id, { newAmountCents: newNetCents!, effectiveFrom, sendMail }),
              (value) => {
                setMail(value.mail);
                if (!value.mail || value.mail.sent) onClose();
              },
            )
          }
        >
          {pending ? "Vastleggen…" : "Prijswijziging bevestigen"}
        </AdminButton>
        <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={onClose} disabled={pending}>
          Annuleren
        </AdminButton>
      </div>
    </div>
  );
}

function CancellationForm({
  service,
  management,
  overview,
  onClose,
}: {
  service: RecurringService;
  management: RecurringManagement;
  overview?: RecurringOverview;
  onClose: () => void;
}) {
  const options = management.cancellationOptions;
  const contractual = options[0];
  const [choice, setChoice] = useState<string>(contractual?.endsOn ?? "");
  const [customDate, setCustomDate] = useState("");
  const [agreedDeviation, setAgreedDeviation] = useState(false);
  const [sendMail, setSendMail] = useState(true);
  const [mail, setMail] = useState<MailResult | undefined>();
  const { save, pending, error } = useSave();

  /*
    Any other day the admin types is previewed with the same pure rule the
    action applies, so the screen can never promise an end the server would
    compute differently.
  */
  const endsOn = choice === "custom" ? customDate : choice;
  const plan: CancellationPlan | undefined = (() => {
    const known = options.find((candidate) => candidate.endsOn === endsOn);
    if (known) return known;
    if (!management.planInput || !endsOn) return undefined;
    const computed = cancellationPlan({ ...management.planInput, requestedEndsOn: endsOn });
    return "error" in computed ? undefined : computed;
  })();
  const customError =
    choice === "custom" && customDate && management.planInput
      ? (() => {
          const computed = cancellationPlan({ ...management.planInput, requestedEndsOn: customDate });
          return "error" in computed ? computed.error : undefined;
        })()
      : undefined;
  const confirmable = Boolean(plan) && (!plan!.deviates || agreedDeviation);
  const lastTermLabel = (candidate: CancellationPlan) =>
    `${day(candidate.lastTerm.period.start)} t/m ${day(candidate.lastTerm.partial ? candidate.endsOn : candidate.lastTerm.period.end)}${
      candidate.lastTerm.partial ? ` (${candidate.lastTerm.daysUsed} van ${candidate.lastTerm.periodDays} dagen)` : ""
    }`;

  return (
    <div className="space-y-3 rounded-sm border border-line bg-surface p-3">
      <p className="label-mono text-ink">Dienst opzeggen</p>
      <SelectField
        id={`ends-${service.id}`}
        label="Laatste dag van de dienst"
        value={choice}
        onChange={(event) => {
          setChoice(event.target.value);
          setAgreedDeviation(false);
        }}
        hint="Volgens de voorwaarden één maand opzegtermijn: de dienst eindigt precies een maand na vandaag en de laatste maandperiode wordt naar rato van de dagen gefactureerd. Een andere dag alleen als dat zo met de klant is afgesproken."
      >
        {options.map((candidate, index) => (
          <option key={candidate.endsOn} value={candidate.endsOn}>
            {day(candidate.endsOn)}
            {index === 0 ? " — volgens voorwaarden" : " — einde maandperiode, met instemming klant"}
          </option>
        ))}
        <option value="custom">Andere dag (afgesproken)</option>
      </SelectField>
      {choice === "custom" ? (
        <TextField
          id={`ends-custom-${service.id}`}
          label="Laatste dag"
          type="date"
          value={customDate}
          min={management.planInput?.todayKey}
          onChange={(event) => setCustomDate(event.target.value)}
          error={customError}
        />
      ) : null}

      <dl className="space-y-1 text-[0.82rem]">
        <Row term="Dienst">{service.name}</Row>
        <Row term="Huidig maandbedrag">
          {formatCents(management.currentNetCents)} excl. · {formatCents(management.currentGrossCents)} incl. btw
        </Row>
        <Row term="Laatst gefactureerde periode">
          {management.lastBilledPeriod ? `${day(management.lastBilledPeriod.start)} t/m ${day(management.lastBilledPeriod.end)}` : "Nog niets gefactureerd"}
        </Row>
        <Row term="Eerstvolgende incasso">
          {overview?.debitOn ? `${day(overview.debitOn)} · ${formatCents(overview.amountCents!)} incl. btw` : "—"}
        </Row>
        <Row term="Opzegdatum">{plan ? day(plan.requestedOn) : "—"}</Row>
        <Row term="Opzegtermijn verstrijkt">{plan ? day(plan.noticeEndsOn) : "—"}</Row>
        <Row term="Laatste dag van de dienst">{plan ? day(plan.endsOn) : "—"}</Row>
        <Row term="Laatste termijn">
          {plan ? `${lastTermLabel(plan)} · ${formatCents(plan.creditDue ? plan.lastTermGrossCents + plan.creditDue.grossCents : plan.lastTermGrossCents)} incl. btw` : "—"}
        </Row>
        {plan?.creditDue ? (
          <Row term="Te crediteren">
            {formatCents(plan.creditDue.grossCents)} incl. btw voor {plan.creditDue.days} dagen na {day(plan.endsOn)}
          </Row>
        ) : null}
        <Row term="Nog te incasseren">
          {plan ? (plan.collectionsAhead.length > 0 ? plan.collectionsAhead.map(day).join(", ") : "Niets meer") : "—"}
        </Row>
        <Row term="Mollie-abonnement">
          {plan ? (plan.providerCancelFrom <= plan.requestedOn ? "Wordt direct geannuleerd" : `Wordt geannuleerd op ${day(plan.providerCancelFrom)}, na de laatste incasso`) : "—"}
        </Row>
      </dl>
      {plan ? (
        <p className="text-[0.82rem] text-muted">
          Na {day(plan.endsOn)} wordt voor deze dienst niets meer gefactureerd of geïncasseerd.
          {plan.lastTerm.partial && !plan.creditDue
            ? ` De laatste termijn wordt naar rato gefactureerd en geïncasseerd (${formatCents(plan.lastTermGrossCents)} incl. btw); Mollie wordt daar vóór de incasso op gezet, nadat is gecontroleerd dat die incasso nog niet is aangemaakt.`
            : ""}
          {plan.creditDue
            ? ` De termijn ${lastTermLabel({ ...plan, lastTerm: { ...plan.lastTerm, partial: false } })} is al aangekondigd en wordt zoals aangekondigd geïncasseerd; ${formatCents(plan.creditDue.grossCents)} voor de ${plan.creditDue.days} dagen na de laatste dag crediteer en betaal je handmatig terug.`
            : ""}
          {" "}Alleen deze dienst stopt: de machtiging van de klant en eventuele andere diensten blijven lopen.
          {management.scheduled && (management.scheduled.effectiveFrom > plan.endsOn || (plan.lastTerm.partial && management.scheduled.effectiveFrom >= plan.lastTerm.period.start && !management.scheduled.providerUpdated))
            ? ` De geplande prijswijziging per ${day(management.scheduled.effectiveFrom)} vervalt, omdat die niet meer vóór de laatste termijn kan ingaan.`
            : ""}
        </p>
      ) : null}
      {plan?.deviates ? (
        <label className="flex items-center gap-2 text-[0.85rem] text-ink">
          <input type="checkbox" checked={agreedDeviation} onChange={(event) => setAgreedDeviation(event.target.checked)} />
          {plan.belowNotice
            ? "Korter dan de opzegtermijn van één maand; dit is zo met de klant afgesproken."
            : "Later dan de opzegtermijn van één maand; de klant heeft hiermee ingestemd."}
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-[0.85rem] text-ink">
        <input type="checkbox" checked={sendMail} onChange={(event) => setSendMail(event.target.checked)} />
        Bevestiging naar de klant mailen
      </label>
      <MailNote mail={mail} />
      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AdminButton
          className="min-h-8 px-3 text-[0.85rem]"
          disabled={pending || !confirmable}
          onClick={() =>
            save(
              () => cancelRecurringService(service.id, { endsOn, agreedDeviation, sendMail }),
              (value) => {
                setMail(value.mail);
                if (!value.mail || value.mail.sent) onClose();
              },
            )
          }
        >
          {pending ? "Vastleggen…" : "Opzegging bevestigen"}
        </AdminButton>
        <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={onClose} disabled={pending}>
          Annuleren
        </AdminButton>
      </div>
    </div>
  );
}

function PriceHistory({ history }: { history: RecurringManagement["history"] }) {
  return (
    <details className="mt-2 text-[0.82rem]">
      <summary className="cursor-pointer text-muted">Prijshistorie ({history.length})</summary>
      <ul className="mt-1 space-y-1">
        {history.map((entry) => (
          <li key={`${entry.requestedAt}-${entry.effectiveFrom}`} className="text-muted">
            {formatCents(entry.oldNetCents)} → {formatCents(entry.newNetCents)} excl. btw vanaf {day(entry.effectiveFrom)}; gepland{" "}
            {formatDateTime(entry.requestedAt)}
            {entry.rescheduledFrom ? ` (verschoven van ${day(entry.rescheduledFrom)})` : ""}
            {entry.canceledAt
              ? `, ${entry.canceledReason === "withdrawn" ? "ingetrokken" : "vervallen door opzegging"} ${formatDateTime(entry.canceledAt)}`
              : entry.blockedReason
                ? ", geblokkeerd"
                : entry.appliedAt
                  ? `, doorgevoerd ${formatDateTime(entry.appliedAt)}`
                  : entry.providerUpdatedAt
                    ? `, Mollie bijgewerkt ${formatDateTime(entry.providerUpdatedAt)}`
                    : ", wacht op de ingangsdatum"}
          </li>
        ))}
      </ul>
    </details>
  );
}
