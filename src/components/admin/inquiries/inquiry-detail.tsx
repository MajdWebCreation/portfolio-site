import AdminSection from "@/components/admin/admin-section";
import ConvertToCustomer from "@/components/admin/customers/convert-to-customer";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import InquiryPipeline from "@/components/admin/inquiries/inquiry-pipeline";
import { formatDateTime } from "@/lib/admin/format";
import { trafficClassLabels, type AdClickIds, type Attribution } from "@/lib/attribution/types";
import type { InquiryValuePrefill } from "@/lib/admin/inquiries/repository";
import { inquiryOriginLabels, type ConsentAtCapture, type Inquiry, type InquiryStatusEvent, type PlannerInquiry } from "@/lib/admin/inquiries/types";
import type { ServiceKey } from "@/lib/content/services";

function List({ items }: { items: string[] | undefined }) {
  if (!items?.length) return <span className="text-muted">Geen</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function orDash(value: string | null | undefined) {
  return value ? value : <span className="text-muted">—</span>;
}

/** The structured planner block, shown as received: prices are the texts the planner posted. */
function PlannerSummary({ inquiry }: { inquiry: PlannerInquiry }) {
  const { planner } = inquiry;
  return (
    <AdminSection id="planner" title="Projectplanner" note="Zoals ingevuld op de website">
      <DetailList>
        <DetailRow term="Projecttype">{orDash(planner.selectedProjectType)}</DetailRow>
        <DetailRow term="Aanbevolen type">
          {orDash(planner.recommendedPackage)}
          {planner.reason ? <span className="block text-[0.88rem] text-muted">{planner.reason}</span> : null}
        </DetailRow>
        <DetailRow term="Eenmalig vanaf">{orDash(planner.startingPrice)}</DetailRow>
        <DetailRow term="Indicatie">{orDash(planner.indicativeRange)}</DetailRow>
        <DetailRow term="Technisch beheer">{orDash(planner.monthlyManagement)}</DetailRow>
        <DetailRow term="Uitbreidingen">
          <List items={planner.selectedAddOns} />
        </DetailRow>
        <DetailRow term="Kenmerken">
          <List items={planner.selectedFeatures} />
        </DetailRow>
        {planner.pageCount ? <DetailRow term="Pagina's">{planner.pageCount}</DetailRow> : null}
        {planner.webshopProducts ? <DetailRow term="Producten">{planner.webshopProducts}</DetailRow> : null}
        {planner.multilingual ? <DetailRow term="Meertalig">{planner.multilingual}</DetailRow> : null}
        <DetailRow term="Planning">{orDash(planner.launchTimeline)}</DetailRow>
        <DetailRow term="Content gereed">{orDash(planner.contentReady)}</DetailRow>
        <DetailRow term="Huisstijl gereed">{orDash(planner.brandingReady)}</DetailRow>
        <DetailRow term="Prioriteit">{orDash(planner.priority)}</DetailRow>
        <DetailRow term="Zakelijke aanvraag">{planner.businessDeclaration ? "Bevestigd" : "Niet bevestigd"}</DetailRow>
      </DetailList>
    </AdminSection>
  );
}

/**
 * Where the visit that led to this request came from, as the website
 * classified it at the time. Five values at most; "Direct / onbekend" is
 * shown with the caveat it deserves, and a request without a value says so
 * instead of guessing.
 */
function AttributionSummary({ attribution, adClickIds }: { attribution: Attribution | undefined; adClickIds: AdClickIds | undefined }) {
  return (
    <AdminSection id="attribution" title="Herkomst van het bezoek" note="Zoals de website het bij binnenkomst zag">
      {attribution ? (
        <DetailList>
          <DetailRow term="Type">
            {trafficClassLabels[attribution.trafficClass]}
            {attribution.trafficClass === "direct" ? (
              <span className="block text-[0.88rem] text-muted">
                Geen verwijzende site en geen campagne gezien. Dat kan een ingetypt adres zijn, maar ook een link uit mail, een app of een browser die de verwijzer niet meestuurt.
              </span>
            ) : null}
            {attribution.trafficClass === "internal" ? (
              <span className="block text-[0.88rem] text-muted">De eerste gemeten pagina had de site zelf als verwijzer, bijvoorbeeld na een herlaad.</span>
            ) : null}
          </DetailRow>
          {attribution.trafficSource ? <DetailRow term="Bron">{attribution.trafficSource}</DetailRow> : null}
          {attribution.trafficMedium ? <DetailRow term="Medium">{attribution.trafficMedium}</DetailRow> : null}
          {attribution.campaign ? <DetailRow term="Campagne">{attribution.campaign}</DetailRow> : null}
          {attribution.term ? (
            <DetailRow term="Gematcht zoekwoord">
              {attribution.term}
              <span className="block text-[0.85rem] text-muted">Het zoekwoord dat Google Ads matchte (utm_term), niet de zoekopdracht van de bezoeker.</span>
            </DetailRow>
          ) : null}
          {attribution.content ? <DetailRow term="Advertentie-id">{attribution.content}</DetailRow> : null}
          {attribution.adgroupId ? <DetailRow term="Advertentiegroep-id">{attribution.adgroupId}</DetailRow> : null}
          {attribution.matchType ? <DetailRow term="Matchtype">{matchTypeLabel(attribution.matchType)}</DetailRow> : null}
          <DetailRow term="Landingspagina">
            <span className="tabular break-all">{attribution.landingPath}</span>
          </DetailRow>
          {adClickIds
            ? (Object.entries(adClickIds) as [keyof AdClickIds, string][]).map(([key, value]) => (
                <DetailRow key={key} term={`Google Ads-klik (${key})`}>
                  <span className="tabular break-all text-[0.88rem]">{value}</span>
                </DetailRow>
              ))
            : null}
        </DetailList>
      ) : (
        <p className="text-[0.95rem] text-muted">Niet vastgelegd: de website kon de herkomst van dit bezoek niet betrouwbaar vaststellen.</p>
      )}
    </AdminSection>
  );
}

/** Google's `{matchtype}` values, spelled out; anything else as received. */
function matchTypeLabel(value: string): string {
  const labels: Record<string, string> = { e: "Exact (e)", p: "Zinsdeel (p)", b: "Breed (b)" };
  return labels[value] ?? value;
}

/**
 * The consent choice the request itself carried, and the id the browser
 * reported to Google Ads and Meta for it. Provenance for any later sharing
 * of an outcome: nothing here is a decision, only what was recorded.
 */
function ProvenanceSummary({ consent, leadEventId }: { consent: ConsentAtCapture | undefined; leadEventId: string | undefined }) {
  return (
    <AdminSection id="provenance" title="Toestemming bij binnenkomst" note="Zoals het verzoek zelf het meestuurde">
      <DetailList>
        <DetailRow term="Marketing">
          {consent ? (
            <>
              {consent.marketing ? "Toegestaan" : "Niet toegestaan"}
              <span className="block text-[0.85rem] text-muted">
                Keuze van {formatDateTime(consent.decidedAt)}, tekstversie {consent.version}
              </span>
            </>
          ) : (
            <span className="text-muted">Geen geldige keuze meegestuurd</span>
          )}
        </DetailRow>
        <DetailRow term="Lead-id (Ads/Meta)">
          {leadEventId ? <span className="tabular break-all text-[0.88rem]">{leadEventId}</span> : <span className="text-muted">—</span>}
        </DetailRow>
      </DetailList>
    </AdminSection>
  );
}

type InquiryDetailProps = {
  inquiry: Inquiry;
  customerId: string | null;
  prefill: InquiryValuePrefill;
  suggestedService?: ServiceKey;
  events: InquiryStatusEvent[];
};

export default function InquiryDetail({ inquiry, customerId, prefill, suggestedService, events }: InquiryDetailProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection id="contact" title="Aanvrager">
          <DetailList>
            <DetailRow term="Naam">{inquiry.name}</DetailRow>
            {inquiry.company ? <DetailRow term="Bedrijf">{inquiry.company}</DetailRow> : null}
            <DetailRow term="E-mail">
              <a href={`mailto:${inquiry.email}`} className="link-static">
                {inquiry.email}
              </a>
            </DetailRow>
            {inquiry.origin === "websitecheck" ? (
              <DetailRow term="Website">
                <a href={inquiry.websiteUrl} target="_blank" rel="noopener noreferrer" className="link-static break-all">
                  {inquiry.websiteUrl}
                </a>
              </DetailRow>
            ) : null}
            {inquiry.origin !== "contact" && inquiry.phone ? (
              <DetailRow term="Telefoon">
                <a href={`tel:${inquiry.phone.replace(/\s/g, "")}`} className="link-static tabular">
                  {inquiry.phone}
                </a>
              </DetailRow>
            ) : null}
            <DetailRow term="Ontvangen">{formatDateTime(inquiry.receivedAt)}</DetailRow>
            <DetailRow term="Herkomst">{inquiryOriginLabels[inquiry.origin]}</DetailRow>
            <DetailRow term="Taal">{inquiry.locale === "nl" ? "Nederlands" : "Engels"}</DetailRow>
          </DetailList>
        </AdminSection>

        {/* A websitecheck asks for no message, so there is no section for one. */}
        {inquiry.origin !== "websitecheck" ? (
          <AdminSection id="message" title={inquiry.origin === "project_planner" ? "Toelichting" : "Bericht"}>
            {inquiry.message ? (
              <p className="max-w-[64ch] whitespace-pre-line text-[0.98rem] leading-relaxed text-ink">{inquiry.message}</p>
            ) : (
              <p className="text-[0.95rem] text-muted">Geen toelichting meegegeven.</p>
            )}
          </AdminSection>
        ) : null}

        {inquiry.origin === "project_planner" ? <PlannerSummary inquiry={inquiry} /> : null}

        <AttributionSummary attribution={inquiry.attribution} adClickIds={inquiry.adClickIds} />

        <ProvenanceSummary consent={inquiry.consent} leadEventId={inquiry.leadEventId} />
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8" aria-labelledby="handling-heading">
        <InquiryPipeline inquiry={inquiry} prefill={prefill} suggestedService={suggestedService} events={events} />

        <ConvertToCustomer source="inquiry" sourceId={inquiry.id} customerId={customerId} />
      </aside>
    </div>
  );
}
