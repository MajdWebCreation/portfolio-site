import type { Metadata } from "next";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import { day, Empty, PageHeader } from "@/components/portal/portal-ui";
import { toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { portalServiceStateLabels, portalServiceStateTone, portalServiceView, type PortalServiceView } from "@/lib/portal/services/model";
import { readPortalServices } from "@/lib/portal/services/read";
import { agreementSourceKindLabels, billingLabel, minimumTermLabel, noticeLabel, prorationRuleLabels, unknownTermsLabel } from "@/lib/payments/service-agreement";

export const metadata: Metadata = { title: "Diensten" };

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
  const views = (await orNoAccess(readPortalServices(member.current.customerId))).map((service) => portalServiceView(service, todayKey));

  return (
    <div>
      <PageHeader label="Diensten" title="Uw diensten">
        <p>Wilt u iets aan een dienst veranderen of hem opzeggen? Mail dan naar contact@ymcreations.com.</p>
      </PageHeader>

      <div className="mt-10 space-y-14">
        {views.length === 0 ? <Empty>U heeft geen lopende diensten bij YM Creations.</Empty> : views.map((view) => <ServiceBlock key={view.service.id} view={view} />)}
      </div>
    </div>
  );
}
