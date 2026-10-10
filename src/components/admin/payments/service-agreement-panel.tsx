"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { saveServiceAgreement } from "@/lib/payments/actions";
import type { ProrationRule } from "@/lib/payments/pricing";
import {
  agreementSourceKindLabels,
  billingLabel,
  currentTermsSet,
  minimumTermLabel,
  noticeLabel,
  prorationRuleLabels,
  standardTermsFor,
  termsSetLabel,
  unknownTermsLabel,
  type AgreementHistoryEntry,
  type AgreementSourceKind,
  type ResolvedAgreement,
  type ServiceAgreementInput,
  type ServiceAgreementRevision,
  type TermsSet,
} from "@/lib/payments/service-agreement";

/**
 * The contract terms of one monthly service, as they apply today, and the
 * form that records a new revision of them.
 *
 * Everything shown is what the server resolved (`ResolvedAgreement`): the
 * financial facts come from the service and its price history, the terms
 * from the agreement chain, and for each term whether it is the general
 * terms' standard or a deviation with a source. The form edits from the
 * chain's head and sends that head's id along, so a save on a stale page
 * is refused instead of overwriting what a colleague just recorded.
 */
const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export type AgreementQuoteOption = { id: string; number: string; provisional: boolean; status: string; issueDate: string };

export type AgreementFinancials = {
  currentNetCents: number;
  currentGrossCents: number;
  vatRate: number;
  startsOn?: string;
  /** Day of the month the collection falls on: the day of `startsOn`. */
  anchorDay?: number;
};

export default function ServiceAgreementPanel({
  serviceId,
  agreement,
  head,
  history,
  financials,
  quotes,
  todayKey,
}: {
  serviceId: string;
  /** The terms in force today. */
  agreement: ResolvedAgreement;
  /** The latest revision, which a new one supersedes; absent when none was recorded yet. */
  head?: ServiceAgreementRevision;
  history: AgreementHistoryEntry[];
  financials: AgreementFinancials;
  /** The customer's quotes, for naming one as the source. */
  quotes: AgreementQuoteOption[];
  todayKey: string;
}) {
  const [editing, setEditing] = useState(false);
  const standard = standardTermsFor(agreement.terms?.edition);
  const deviations = [
    ...(agreement.noticeIsStandard ? [] : [`Opzegtermijn ${noticeLabel(agreement.noticeMonths)}`]),
    ...(agreement.minimumTermMonths !== undefined ? [`Minimale looptijd ${minimumTermLabel(agreement.minimumTermMonths)}`] : []),
    ...(agreement.prorationIsStandard ? [] : [prorationRuleLabels[agreement.prorationRule]]),
    ...(agreement.specialTerms.trim() ? [agreement.specialTerms.trim()] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <Group title="Financieel">
          <Row term="Maandbedrag">{formatCents(financials.currentNetCents)} excl. btw</Row>
          <Row term="Incl. btw">{formatCents(financials.currentGrossCents)}</Row>
          <Row term="Btw">{financials.vatRate}%</Row>
          <Row term="Facturatie">
            {billingLabel(agreement.billing)} <StatusBadge tone="neutral">Standaard · enige ondersteunde wijze</StatusBadge>
          </Row>
          <Row term="Facturatiedag">{financials.anchorDay !== undefined ? `${financials.anchorDay}e van de maand` : "Nog niet bepaald"}</Row>
        </Group>
        <Group title="Looptijd">
          <Row term="Startdatum">{financials.startsOn ? day(financials.startsOn) : "Nog niet gestart"}</Row>
          <Row term="Minimale looptijd">{minimumTermLabel(agreement.minimumTermMonths)}</Row>
          <Row term="Opzegtermijn">
            {noticeLabel(agreement.noticeMonths)}{" "}
            {agreement.noticeIsStandard ? (
              <StatusBadge tone="neutral">Standaard</StatusBadge>
            ) : (
              <StatusBadge tone="accent">Afwijkend · standaard {noticeLabel(standard.noticeMonths)}</StatusBadge>
            )}
          </Row>
          <Row term="Laatste termijn">
            {prorationRuleLabels[agreement.prorationRule]} {agreement.prorationIsStandard ? <StatusBadge tone="neutral">Standaard</StatusBadge> : <StatusBadge tone="accent">Afwijkend</StatusBadge>}
          </Row>
        </Group>
        <Group title="Contractuele bron">
          <Row term={agreementSourceKindLabels[agreement.source.kind]}>{agreement.source.label}</Row>
          {agreement.source.acceptedOn ? <Row term="Geaccepteerd">{day(agreement.source.acceptedOn)}</Row> : null}
          <Row term="Voorwaarden">
            {agreement.terms ? (
              <>
                {termsSetLabel(agreement.terms)} · gepubliceerd {day(agreement.terms.publishedOn)}
              </>
            ) : (
              <StatusBadge tone="neutral">{unknownTermsLabel}</StatusBadge>
            )}
          </Row>
          <Row term="Geldig vanaf">{agreement.revision ? day(agreement.revision.effectiveFrom) : "Niet vastgelegd; standaard"}</Row>
          <Row term="Afwijkende afspraken">{deviations.length === 0 ? "Geen" : deviations.join("; ")}</Row>
        </Group>
      </div>

      {head && head.effectiveFrom > todayKey ? (
        <p className="border-l-2 border-accent pl-3 text-[0.85rem] text-muted">
          Een nieuwere versie gaat in op {day(head.effectiveFrom)}; tot die dag gelden de afspraken hierboven.
        </p>
      ) : null}

      {editing ? (
        <AgreementForm serviceId={serviceId} agreement={agreement} head={head} quotes={quotes} todayKey={todayKey} onClose={() => setEditing(false)} />
      ) : (
        <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={() => setEditing(true)}>
          Afspraken bewerken
        </AdminButton>
      )}

      {history.length > 0 ? <AgreementHistory history={history} /> : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[0.78rem] font-medium uppercase tracking-wide text-muted">{title}</h3>
      <dl className="mt-2 space-y-1 text-[0.88rem]">{children}</dl>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-muted">{term}</dt>
      <dd className="tabular text-right text-ink">{children}</dd>
    </div>
  );
}

type NoticeMode = "standard" | "custom";
type TermsMode = "unknown" | "current" | "custom";

function sameSet(a: TermsSet | undefined, b: TermsSet): boolean {
  return Boolean(a && a.edition === b.edition && a.publishedOn === b.publishedOn);
}

function AgreementForm({
  serviceId,
  agreement,
  head,
  quotes,
  todayKey,
  onClose,
}: {
  serviceId: string;
  agreement: ResolvedAgreement;
  head?: ServiceAgreementRevision;
  quotes: AgreementQuoteOption[];
  todayKey: string;
  onClose: () => void;
}) {
  /*
    Prefilled from the chain's head -- the latest recorded revision, which
    may take effect later than today -- so an edit continues from what was
    last recorded, not from a snapshot that a future revision already
    replaces.
  */
  const base = head;
  const standard = standardTermsFor(base?.terms?.edition ?? agreement.terms?.edition);
  const current = currentTermsSet();
  const [sourceKind, setSourceKind] = useState<AgreementSourceKind>(base?.sourceKind ?? agreement.source.kind);
  const [quoteId, setQuoteId] = useState(base?.sourceQuoteId ?? "");
  const [sourceLabel, setSourceLabel] = useState(base && !base.sourceQuoteId && base.sourceKind !== "standard_terms" ? base.sourceLabel : "");
  const [acceptedOn, setAcceptedOn] = useState(base?.acceptedOn ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(base && base.effectiveFrom > todayKey ? base.effectiveFrom : todayKey);
  const [noticeMode, setNoticeMode] = useState<NoticeMode>(base?.noticeMonths !== undefined ? "custom" : "standard");
  const [noticeMonths, setNoticeMonths] = useState(String(base?.noticeMonths ?? standard.noticeMonths));
  const [minimumMode, setMinimumMode] = useState<NoticeMode>(base?.minimumTermMonths !== undefined ? "custom" : "standard");
  const [minimumMonths, setMinimumMonths] = useState(String(base?.minimumTermMonths ?? 12));
  const [prorationMode, setProrationMode] = useState<NoticeMode>(base?.prorationRule !== undefined ? "custom" : "standard");
  const [prorationRule, setProrationRule] = useState<ProrationRule>(base?.prorationRule ?? "none");
  const [specialTerms, setSpecialTerms] = useState(base?.specialTerms ?? "");
  const baseTerms = base ? base.terms : agreement.terms;
  const [termsMode, setTermsMode] = useState<TermsMode>(!baseTerms ? "unknown" : sameSet(baseTerms, current) ? "current" : "custom");
  const [terms, setTerms] = useState<TermsSet>(baseTerms ?? current);
  const [note, setNote] = useState("");
  const { save, pending, error } = useSave();

  const standardSource = sourceKind === "standard_terms";
  const deviates = noticeMode === "custom" || minimumMode === "custom" || prorationMode === "custom" || specialTerms.trim() !== "";
  const selectable = quotes.filter((quote) => !quote.provisional && quote.status === "accepted");
  const offerOutsideSystem = sourceKind === "accepted_offer" && quoteId === "";

  const input: ServiceAgreementInput = {
    effectiveFrom,
    sourceKind,
    ...(sourceKind === "accepted_offer" && quoteId ? { sourceQuoteId: quoteId } : {}),
    ...(!standardSource && (sourceKind === "later_written_amendment" || offerOutsideSystem) ? { sourceLabel } : {}),
    ...(!standardSource && acceptedOn ? { acceptedOn } : {}),
    ...(noticeMode === "custom" ? { noticeMonths: Number(noticeMonths) } : {}),
    ...(minimumMode === "custom" ? { minimumTermMonths: Number(minimumMonths) } : {}),
    ...(prorationMode === "custom" ? { prorationRule } : {}),
    specialTerms,
    ...(termsMode === "unknown" ? {} : { terms: termsMode === "current" ? current : terms }),
    note,
    ...(head ? { supersedesId: head.id } : {}),
  };

  return (
    <div className="space-y-4 rounded-sm border border-line bg-surface p-4">
      <p className="label-mono text-ink">Afspraken bewerken</p>
      <p className="text-[0.85rem] text-muted">
        Een wijziging wordt als nieuwe versie vastgelegd; de vorige blijft in de historie. Een afwijking van de standaard heeft altijd een bron en een acceptatiedatum.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`agreement-source-${serviceId}`}
          label="Bron van de afspraken"
          value={sourceKind}
          onChange={(event) => {
            setSourceKind(event.target.value as AgreementSourceKind);
            if (event.target.value === "standard_terms") {
              setNoticeMode("standard");
              setMinimumMode("standard");
              setProrationMode("standard");
              setSpecialTerms("");
              setAcceptedOn("");
              setQuoteId("");
            }
          }}
          hint={standardSource ? "Alleen de standaard uit de algemene voorwaarden; geen afwijking mogelijk." : undefined}
        >
          {(Object.keys(agreementSourceKindLabels) as AgreementSourceKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {agreementSourceKindLabels[kind]}
            </option>
          ))}
        </SelectField>
        {sourceKind === "accepted_offer" ? (
          <SelectField
            id={`agreement-quote-${serviceId}`}
            label="Offerte"
            value={quoteId}
            onChange={(event) => setQuoteId(event.target.value)}
            hint={selectable.length === 0 ? "Geen geaccepteerde offerte met definitief nummer bij deze klant; vermeld het nummer hieronder." : "Alleen geaccepteerde offertes met een definitief nummer."}
          >
            <option value="">Niet in dit systeem</option>
            {selectable.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.number} · {day(quote.issueDate)}
              </option>
            ))}
          </SelectField>
        ) : null}
        {sourceKind === "later_written_amendment" || offerOutsideSystem ? (
          <TextField
            id={`agreement-label-${serviceId}`}
            label={offerOutsideSystem ? "Offertenummer" : "Omschrijving van de afspraak"}
            value={sourceLabel}
            onChange={(event) => setSourceLabel(event.target.value)}
            placeholder={offerOutsideSystem ? "Offerte YM-O-2026-000014" : "E-mail van de klant, 10 januari 2027"}
          />
        ) : null}
        {!standardSource ? (
          <TextField
            id={`agreement-accepted-${serviceId}`}
            label="Geaccepteerd op"
            type="date"
            value={acceptedOn}
            max={effectiveFrom}
            onChange={(event) => setAcceptedOn(event.target.value)}
            hint="De dag waarop de klant de offerte of de afspraak heeft geaccepteerd."
          />
        ) : null}
        <TextField
          id={`agreement-effective-${serviceId}`}
          label="Geldig vanaf"
          type="date"
          value={effectiveFrom}
          min={head?.effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
          hint={head ? `Niet vóór de huidige versie (${day(head.effectiveFrom)}). Een opzegging gebruikt de versie die op de opzegdag geldt.` : "Een opzegging gebruikt de versie die op de opzegdag geldt."}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`agreement-notice-mode-${serviceId}`}
          label="Opzegtermijn"
          value={noticeMode}
          onChange={(event) => setNoticeMode(event.target.value as NoticeMode)}
          disabled={standardSource}
        >
          <option value="standard">Standaard · {noticeLabel(standard.noticeMonths)}</option>
          <option value="custom">Afwijkende afspraak</option>
        </SelectField>
        {noticeMode === "custom" ? (
          <TextField
            id={`agreement-notice-${serviceId}`}
            label="Opzegtermijn in kalendermaanden"
            type="number"
            min={1}
            max={24}
            step={1}
            inputMode="numeric"
            value={noticeMonths}
            onChange={(event) => setNoticeMonths(event.target.value)}
            hint="Hele kalendermaanden, geen dagen: 31 januari plus één maand is 28 februari."
          />
        ) : null}
        <SelectField
          id={`agreement-minimum-mode-${serviceId}`}
          label="Minimale looptijd"
          value={minimumMode}
          onChange={(event) => setMinimumMode(event.target.value as NoticeMode)}
          disabled={standardSource}
        >
          <option value="standard">Geen (standaard)</option>
          <option value="custom">Afgesproken minimale looptijd</option>
        </SelectField>
        {minimumMode === "custom" ? (
          <TextField
            id={`agreement-minimum-${serviceId}`}
            label="Minimale looptijd in maanden"
            type="number"
            min={1}
            max={60}
            step={1}
            inputMode="numeric"
            value={minimumMonths}
            onChange={(event) => setMinimumMonths(event.target.value)}
          />
        ) : null}
        <SelectField
          id={`agreement-proration-mode-${serviceId}`}
          label="Laatste termijn bij opzegging"
          value={prorationMode}
          onChange={(event) => setProrationMode(event.target.value as NoticeMode)}
          disabled={standardSource}
        >
          <option value="standard">Standaard · {prorationRuleLabels[standard.prorationRule].toLowerCase()}</option>
          <option value="custom">Afwijkende afspraak</option>
        </SelectField>
        {prorationMode === "custom" ? (
          <SelectField id={`agreement-proration-${serviceId}`} label="Regel" value={prorationRule} onChange={(event) => setProrationRule(event.target.value as ProrationRule)}>
            <option value="none">{prorationRuleLabels.none}</option>
            <option value="pro_rata_days">{prorationRuleLabels.pro_rata_days}</option>
          </SelectField>
        ) : null}
      </div>

      <TextareaField
        id={`agreement-special-${serviceId}`}
        label="Bijzondere contractuele afspraak"
        optional
        value={specialTerms}
        onChange={(event) => setSpecialTerms(event.target.value)}
        disabled={standardSource}
        hint="In woorden, voor de administratie; het systeem leidt hier niets uit af."
        className="min-h-20"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`agreement-terms-mode-${serviceId}`}
          label="Toepasselijke algemene voorwaarden"
          value={termsMode}
          onChange={(event) => setTermsMode(event.target.value as TermsMode)}
          hint="Een later gepubliceerde set geldt niet vanzelf voor een bestaande overeenkomst; leg alleen vast wat aantoonbaar bij deze overeenkomst hoort."
        >
          <option value="unknown">{unknownTermsLabel}</option>
          <option value="current">
            {termsSetLabel(current)} · gepubliceerd {day(current.publishedOn)}
          </option>
          <option value="custom">Andere set</option>
        </SelectField>
        {termsMode === "custom" ? (
          <>
            <TextField
              id={`agreement-terms-edition-${serviceId}`}
              label="Editie algemene voorwaarden"
              value={terms.edition}
              onChange={(event) => setTerms({ ...terms, edition: event.target.value })}
              hint="Het jaartal waarmee de set naar buiten wordt aangeduid."
            />
            <TextField
              id={`agreement-terms-published-${serviceId}`}
              label="Publicatiedatum van die set"
              type="date"
              value={terms.publishedOn}
              onChange={(event) => setTerms({ ...terms, publishedOn: event.target.value })}
              hint="Zoals het register in docs/legal/voorwaarden de set identificeert."
            />
          </>
        ) : null}
      </div>

      <TextareaField
        id={`agreement-note-${serviceId}`}
        label="Reden of notitie"
        optional
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="min-h-16"
      />

      {deviates && standardSource ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          Een afwijking van de standaard heeft een bron: kies de geaccepteerde offerte of een latere schriftelijke afspraak.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AdminButton
          className="min-h-8 px-3 text-[0.85rem]"
          disabled={pending || (deviates && standardSource)}
          onClick={() => save(() => saveServiceAgreement(serviceId, input), () => onClose())}
        >
          {pending ? "Vastleggen…" : "Nieuwe versie vastleggen"}
        </AdminButton>
        <AdminButton variant="secondary" className="min-h-8 px-3 text-[0.85rem]" onClick={onClose} disabled={pending}>
          Annuleren
        </AdminButton>
      </div>
    </div>
  );
}

/** Every revision, newest first, with what it changed against the one before. */
function AgreementHistory({ history }: { history: AgreementHistoryEntry[] }) {
  return (
    <details className="text-[0.85rem]">
      <summary className="cursor-pointer text-muted">Historie van de afspraken ({history.length})</summary>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {history.map((entry) => (
          <li key={entry.revision.id} className="py-2.5">
            <p className="text-ink">
              <span className="font-medium">{formatDateTime(entry.revision.createdAt)}</span>
              {" · "}
              {entry.first ? "Eerste vastlegging" : entry.changes.length === 0 ? "Opnieuw vastgelegd zonder wijziging" : `${entry.changes.length} ${entry.changes.length === 1 ? "wijziging" : "wijzigingen"}`}
              {" · "}geldig vanaf {day(entry.revision.effectiveFrom)}
            </p>
            {entry.changes.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-muted">
                {entry.changes.map((change) => (
                  <li key={change.label}>
                    {change.label}: {change.from} → {change.to}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-muted">
              Bron: {agreementSourceKindLabels[entry.revision.sourceKind]} · {entry.revision.sourceLabel}
              {entry.revision.acceptedOn ? ` · geaccepteerd ${day(entry.revision.acceptedOn)}` : ""}
              {" · "}
              {entry.revision.terms ? `voorwaarden ${termsSetLabel(entry.revision.terms)}` : unknownTermsLabel.toLowerCase()}
            </p>
            {entry.revision.note ? <p className="mt-1 text-muted">{entry.revision.note}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
