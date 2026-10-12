import type { Metadata } from "next";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { ActivateDirectDebitButton } from "@/components/portal/payment-buttons";
import StatusBadge from "@/components/admin/status-badge";
import { day, Empty, PageHeader } from "@/components/portal/portal-ui";
import { toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { portalServiceStateLabels, portalServiceStateTone, portalServiceView, type PortalServiceView } from "@/lib/portal/services/model";
import { readPortalServices } from "@/lib/portal/services/read";
import { mayActivateDirectDebit, portalDirectDebitLabels, portalDirectDebitState, portalDirectDebitTone, type PortalDirectDebitState } from "@/lib/portal/payments/model";
import { readPortalPaymentContext } from "@/lib/portal/payments/read";
import { agreementSourceKindLabels, billingLabel, minimumTermLabel, noticeLabel, prorationRuleLabels, unknownTermsLabel } from "@/lib/payments/service-agreement";

export const metadata: Metadata = { title: "Diensten" };

const directDebitExplanation: Record<PortalDirectDebitState, string> = {
  not_active: "Uw maandbedragen worden automatisch afgeschreven zodra u een machtiging heeft gegeven.",
  started: "U bent begonnen met machtigen, maar de betaling van € 0,01 is nog niet afgerond. U kunt verdergaan waar u was.",
  awaiting_confirmation: "Uw machtiging is ontvangen. Zodra onze betaalprovider die bevestigt, is de automatische incasso actief.",
  active: "Uw maandbedragen worden automatisch van uw rekening afgeschreven. U krijgt vooraf bericht over elke afschrijving.",
  problem: "Uw machtiging kon niet worden bevestigd. U kunt opnieuw machtigen, of contact met ons opnemen.",
};

function money(net: number, gross: number, vatRate: number): string {
  return `${formatCents(net)} excl. btw · ${formatCents(gross)} incl. ${vatRate}% btw`;
}

function ServiceBlock({ view }: { view: PortalServiceView }) {
  const { service, agreement } = view;

  return (
    <article className="border-t border-line-strong pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="display-sm">{service.name}</h2>
        <StatusBadge tone={portalServiceStateTone[view.state]}>{portalServiceStateLabels[view.state]}</StatusBadge>
      </div>

      <DetailList className="mt-5">
        <DetailRow term="Maandbedrag">{money(view.currentNetCents, view.currentGrossCents, service.vatRate)}</DetailRow>
        {view.scheduledChange ? (
          <DetailRow term="Nieuw maandbedrag">
            {money(view.scheduledChange.newNetCents, view.scheduledChange.newGrossCents, service.vatRate)}
            <span className="block text-[0.88rem] text-muted">Vanaf de periode die begint op {day(view.scheduledChange.effectiveFrom)}</span>
          </DetailRow>
        ) : null}
        {service.startsOn ? <DetailRow term="Startdatum">{day(service.startsOn)}</DetailRow> : null}
        {service.endsOn ? (
          <DetailRow term="Laatste dienstdag">
            {day(service.endsOn)}
            {service.cancellationRequestedOn ? (
              <span className="block text-[0.88rem] text-muted">Opgezegd op {day(service.cancellationRequestedOn)}</span>
            ) : null}
          </DetailRow>
        ) : null}
        <DetailRow term="Volgende incasso">
          {view.next ? (
            <>
              {day(view.next.debitOn)} · {formatCents(view.next.grossCents)}
              <span className="block text-[0.88rem] text-muted">
                Voor de periode {day(view.next.period.start)} t/m {day(view.next.period.end)}
              </span>
            </>
          ) : service.collectsByDirectDebit ? (
            "Er staat geen incasso meer gepland."
          ) : (
            "De automatische incasso is nog niet gestart."
          )}
        </DetailRow>
      </DetailList>

      <h3 className="label-mono mt-8 text-muted">Afspraken</h3>
      <DetailList className="mt-3">
        <DetailRow term="Grondslag">
          {agreementSourceKindLabels[agreement.source.kind]}
          {agreement.source.acceptedOn ? <span className="text-muted">, geaccepteerd op {day(agreement.source.acceptedOn)}</span> : null}
        </DetailRow>
        <DetailRow term="Voorwaarden">
          {agreement.terms ? `Algemene Voorwaarden B2B ${agreement.terms.edition}, gepubliceerd ${day(agreement.terms.publishedOn)}` : unknownTermsLabel}
        </DetailRow>
        <DetailRow term="Opzegtermijn">{noticeLabel(agreement.noticeMonths)}</DetailRow>
        <DetailRow term="Minimale looptijd">
          {minimumTermLabel(agreement.minimumTermMonths)}
          {view.minimumTermEndsOn ? <span className="text-muted"> · tot en met {day(view.minimumTermEndsOn)}</span> : null}
        </DetailRow>
        <DetailRow term="Facturering">{billingLabel(agreement.billing)}</DetailRow>
        <DetailRow term="Laatste termijn">{prorationRuleLabels[agreement.prorationRule]}</DetailRow>
        {view.hasSpecialTerms ? (
          <DetailRow term="Aanvullend">Er geldt een aanvullende afspraak, vastgelegd in de bron hierboven.</DetailRow>
        ) : null}
      </DetailList>

      {view.priceHistory.length > 0 ? (
        <>
          <h3 className="label-mono mt-8 text-muted">Prijsverloop</h3>
          <ul className="mt-3 border-t border-line">
            {view.priceHistory.map((change) => (
              <li key={change.effectiveFrom} className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 text-[0.92rem]">
                <span className="text-ink">Vanaf {day(change.effectiveFrom)}</span>
                <span className="tabular text-muted">
                  {formatCents(change.oldNetCents)} → <span className="text-ink">{formatCents(change.newNetCents)}</span> excl. btw
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

/**
 * The customer's monthly services: what each costs now and next, when the
 * next direct debit falls, and the terms it runs on. Read only; changing or
 * ending a service goes through YM Creations.
 */
export default async function PortalServicesPage() {
  const member = await requirePortalMember();
  const todayKey = toDateKey(new Date());
  const [services, context] = await orNoAccess(Promise.all([readPortalServices(member.current.customerId), readPortalPaymentContext(member.current.customerId)]));
  const views = services.map((service) => portalServiceView(service, todayKey));
  const directDebit = portalDirectDebitState(context.directDebit);
  const offerActivation = mayActivateDirectDebit(context.directDebit, services, todayKey);
  const showDirectDebit = directDebit !== "not_active" || offerActivation;

  return (
    <div>
      <PageHeader label="Diensten" title="Uw diensten">
        <p>Wilt u iets aan een dienst veranderen of hem opzeggen? Mail dan naar contact@ymcreations.com.</p>
      </PageHeader>

      {showDirectDebit ? (
        <section className="mt-10 border-y border-line py-6" aria-labelledby="incasso">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="incasso" className="label-mono text-muted">
              Automatische incasso
            </h2>
            <StatusBadge tone={portalDirectDebitTone[directDebit]}>{portalDirectDebitLabels[directDebit]}</StatusBadge>
          </div>
          <p className="mt-4 max-w-prose text-[0.95rem] text-body">{directDebitExplanation[directDebit]}</p>
          {offerActivation ? (
            <div className="mt-5">
              <ActivateDirectDebitButton />
              <p className="mt-3 max-w-prose text-[0.86rem] text-muted">
                U machtigt via een betaling van € 0,01 bij onze betaalprovider. Dat bedrag activeert alleen de machtiging: het is
                geen betaling van een factuur of maandbedrag.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-10 space-y-14">
        {views.length === 0 ? <Empty>U heeft geen lopende diensten bij YM Creations.</Empty> : views.map((view) => <ServiceBlock key={view.service.id} view={view} />)}
      </div>
    </div>
  );
}
