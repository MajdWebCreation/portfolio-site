import Link from "next/link";
import AdminSection from "@/components/admin/admin-section";
import RefreshButton from "@/components/admin/analytics/refresh-button";
import TrendLine from "@/components/admin/analytics/trend-line";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import { pageTypeLabels } from "@/lib/admin/analytics/page-types";
import { periods, type AnalyticsDashboard, type Comparison, type FunnelStep, type OverviewKey, type SyncStatus } from "@/lib/admin/analytics/types";
import { trafficClassLabels } from "@/lib/attribution/types";

/**
 * The analytics page, block by block. Every number comes from the model
 * the repository built; nothing here queries, computes a rate, or knows
 * a provider. Tables use the admin's table styles; the only drawing is
 * the trend line and the funnel bars.
 */
const nl = new Intl.NumberFormat("nl-NL");
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });

function num(value: number | null): string {
  return value === null ? "—" : nl.format(value);
}

function pct(value: number | null): string {
  return value === null ? "—" : percent.format(value);
}

const tileLabels: Record<OverviewKey, { label: string; kind: "count" | "rate" }> = {
  sessions: { label: "Sessies", kind: "count" },
  users: { label: "Gebruikers", kind: "count" },
  engagedSessions: { label: "Betrokken sessies", kind: "count" },
  engagementRate: { label: "Betrokkenheid", kind: "rate" },
  pageViews: { label: "Paginaweergaven", kind: "count" },
  keyEvents: { label: "Key events", kind: "count" },
  inquiries: { label: "Aanvragen", kind: "count" },
  conversionRate: { label: "Conversie", kind: "rate" },
};

function Delta({ comparison }: { comparison: Comparison }) {
  if (comparison.delta === null) return <span className="text-faint">geen vergelijking</span>;
  const tone = comparison.delta > 0 ? "text-success" : comparison.delta < 0 ? "text-danger" : "text-muted";
  return <span className={tone}>{signedPercent.format(comparison.delta)}</span>;
}

export function PeriodSwitch({ period }: { period: number }) {
  return (
    <nav aria-label="Periode" className="flex flex-wrap gap-1 rounded-sm border border-line bg-surface p-1">
      {periods.map((option) => (
        <Link
          key={option}
          href={`/admin/analytics?period=${option}`}
          aria-current={option === period ? "page" : undefined}
          className={`rounded-xs px-3 py-1.5 text-[0.88rem] font-medium transition-colors ${
            option === period ? "bg-ink text-paper" : "text-muted hover:text-ink"
          }`}
        >
          {option} dagen
        </Link>
      ))}
    </nav>
  );
}

function MetricTiles({ overview }: { overview: AnalyticsDashboard["overview"] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
      {(Object.keys(tileLabels) as OverviewKey[]).map((key) => {
        const comparison = overview[key];
        const { label, kind } = tileLabels[key];
        return (
          <div key={key} className="border-t border-line py-3">
            <dt className="label-mono text-muted">{label}</dt>
            <dd className="mt-1">
              <span className="tabular block text-[1.45rem] font-semibold leading-tight text-ink">{kind === "rate" ? pct(comparison.current) : num(comparison.current)}</span>
              <span className="tabular mt-0.5 block text-[0.8rem] text-muted">
                vorige {kind === "rate" ? pct(comparison.previous) : num(comparison.previous)} · <Delta comparison={comparison} />
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.92rem] text-muted">{children}</p>;
}

function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((step) => step.count));
  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li key={step.key} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-x-4 text-[0.9rem]">
          <span className="truncate text-ink">{step.label}</span>
          <span className="block h-2 rounded-xs bg-paper-deep">
            <span className="block h-2 rounded-xs bg-accent" style={{ width: `${Math.round((step.count / max) * 100)}%` }} />
          </span>
          <span className="tabular whitespace-nowrap text-right text-muted">
            <span className="text-ink">{num(step.count)}</span>
            {step.rateFromPrevious !== null ? <span className="ml-2">{pct(step.rateFromPrevious)}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SyncStatusBlock({ sync }: { sync: SyncStatus }) {
  return (
    <AdminSection id="sync" title="Synchronisatie" note="Google Analytics via de dagelijkse job, 06:00 UTC">
      {!sync.configured ? (
        <div className="space-y-3">
          <p className="text-[0.95rem] text-ink">
            <StatusBadge tone="danger">GA4 niet gekoppeld</StatusBadge>
          </p>
          <Empty>
            Ontbrekend of ongeldig in de omgeving: <span className="tabular text-ink">{sync.missing.join(", ")}</span>. Zonder deze waarden haalt de job niets op en blijven de blokken hierboven leeg.
          </Empty>
        </div>
      ) : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-t border-line pt-2">
            <dt className="label-mono text-muted">Schrijven</dt>
            <dd className="mt-1 text-[0.92rem]">
              {sync.enabled ? <StatusBadge tone="success">Aan</StatusBadge> : <StatusBadge tone="neutral">Proefrun</StatusBadge>}
              {!sync.enabled ? <span className="mt-1 block text-[0.85rem] text-muted">ANALYTICS_SYNC_ENABLED is niet &quot;true&quot;: de job telt en slaat niets op.</span> : null}
            </dd>
          </div>
          <div className="border-t border-line pt-2">
            <dt className="label-mono text-muted">Laatste geslaagde sync</dt>
            <dd className="mt-1 text-[0.92rem] text-ink">
              {sync.lastSuccess ? (
                <>
                  {formatDateTime(sync.lastSuccess.at)}
                  <span className="block text-[0.85rem] text-muted">{num(sync.lastSuccess.rows)} rijen</span>
                </>
              ) : (
                <span className="text-muted">Nog geen</span>
              )}
            </dd>
          </div>
          <div className="border-t border-line pt-2">
            <dt className="label-mono text-muted">Laatste fout</dt>
            <dd className="mt-1 text-[0.92rem] text-ink">
              {sync.lastFailure ? (
                <>
                  {formatDateTime(sync.lastFailure.at)}
                  <span className="tabular block text-[0.85rem] text-danger">
                    {sync.lastFailure.report}: {sync.lastFailure.error}
                  </span>
                </>
              ) : (
                <span className="text-muted">Geen</span>
              )}
            </dd>
          </div>
          <div className="border-t border-line pt-2">
            <dt className="label-mono text-muted">Handmatig</dt>
            <dd className="mt-1">
              <RefreshButton />
            </dd>
          </div>
        </dl>
      )}
      {sync.reports.length > 0 ? (
        <table className="adm-table mt-6">
          <thead>
            <tr>
              <th scope="col">Rapport</th>
              <th scope="col">Status</th>
              <th scope="col">Moment</th>
              <th scope="col" className="adm-num">
                Rijen
              </th>
              <th scope="col">Fout</th>
            </tr>
          </thead>
          <tbody>
            {sync.reports.map((report) => (
              <tr key={report.report}>
                <td data-label="Rapport" className="tabular">
                  {report.report}
                </td>
                <td data-label="Status">
                  <StatusBadge tone={report.status === "ok" ? "success" : report.status === "failed" ? "danger" : "neutral"}>{report.status}</StatusBadge>
                </td>
                <td data-label="Moment">{formatDateTime(report.at)}</td>
                <td data-label="Rijen" className="adm-num">
                  {num(report.rows)}
                </td>
                <td data-label="Fout" className="tabular text-muted">
                  {report.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </AdminSection>
  );
}

const noData = (sync: SyncStatus) =>
  !sync.configured ? "GA4 is niet gekoppeld; zie Synchronisatie onderaan." : !sync.hasFacts ? "Nog niets gesynchroniseerd; zie Synchronisatie onderaan." : "Geen gegevens in deze periode.";

export default function AnalyticsDashboardView({ data }: { data: AnalyticsDashboard }) {
  const { ranges, sync } = data;
  const empty = noData(sync);

  return (
    <div className="space-y-10">
      <AdminSection id="overview" title="Kerncijfers" note={`${ranges.current.start} t/m ${ranges.current.end}, vergeleken met ${ranges.previous.start} t/m ${ranges.previous.end}`}>
        <MetricTiles overview={data.overview} />
        <p className="mt-3 text-[0.82rem] text-muted">Aanvragen komen uit de eigen database; conversie is aanvragen gedeeld door sessies. Vandaag telt niet mee: alleen volle dagen.</p>
        <div className="mt-6">
          <TrendLine current={data.daily.current} previous={data.daily.previous} label="Sessies per dag" />
        </div>
      </AdminSection>

      <AdminSection id="sources" title="Herkomst" note="Google Analytics naast de herkomst die de website zelf bij een aanvraag vastlegde">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h3 className="text-[0.9rem] font-medium text-ink">Sessies per kanaal (GA4)</h3>
            {data.sources.length === 0 ? (
              <div className="mt-2">
                <Empty>{empty}</Empty>
              </div>
            ) : (
              <table className="adm-table mt-2">
                <thead>
                  <tr>
                    <th scope="col">Kanaal</th>
                    <th scope="col">Bron / medium</th>
                    <th scope="col" className="adm-num">
                      Sessies
                    </th>
                    <th scope="col" className="adm-num">
                      Betrokken
                    </th>
                    <th scope="col" className="adm-num">
                      Key events
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.slice(0, 20).map((row) => (
                    <tr key={`${row.channel}|${row.sourceMedium}`}>
                      <td data-label="Kanaal">{row.channel}</td>
                      <td data-label="Bron / medium" className="tabular adm-wrap">
                        {row.sourceMedium}
                      </td>
                      <td data-label="Sessies" className="adm-num">
                        {num(row.sessions)}
                      </td>
                      <td data-label="Betrokken" className="adm-num">
                        {num(row.engagedSessions)}
                      </td>
                      <td data-label="Key events" className="adm-num">
                        {num(row.keyEvents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="lg:col-span-5">
            <h3 className="text-[0.9rem] font-medium text-ink">Aanvragen per kanaal (eigen registratie)</h3>
            {data.inquiriesByClass.length === 0 ? (
              <div className="mt-2">
                <Empty>Geen aanvragen in deze periode.</Empty>
              </div>
            ) : (
              <ul className="mt-2 border-t border-line">
                {data.inquiriesByClass.map((row) => (
                  <li key={row.trafficClass ?? "none"} className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-[0.92rem]">
                    <span className="text-ink">{row.trafficClass ? trafficClassLabels[row.trafficClass] : "Niet vastgelegd"}</span>
                    <span className="tabular text-ink">{num(row.inquiries)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.inquiriesBySource.length > 0 ? (
              <ul className="mt-4 border-t border-line">
                {data.inquiriesBySource.slice(0, 12).map((row) => (
                  <li key={`${row.trafficClass}|${row.trafficSource}`} className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-[0.88rem]">
                    <span className="tabular text-muted">
                      {row.trafficSource} <span className="text-faint">· {trafficClassLabels[row.trafficClass]}</span>
                    </span>
                    <span className="tabular text-ink">{num(row.inquiries)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-[0.82rem] text-muted">
              &quot;Direct / onbekend&quot; betekent: geen verwijzende site en geen campagne gezien. Dat is niet per se een ingetypt adres; links uit mail, apps en browsers die de verwijzer niet meesturen komen hier ook terecht.
            </p>
          </div>
        </div>
      </AdminSection>

      <AdminSection id="ai" title="AI-verwijzingen" note="ChatGPT, Perplexity, Claude en andere assistenten">
        {data.ai.length === 0 ? (
          <Empty>Geen bezoek of aanvragen via een AI-assistent in deze periode.</Empty>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Bron</th>
                <th scope="col" className="adm-num">
                  Sessies (GA4)
                </th>
                <th scope="col" className="adm-num">
                  Betrokken
                </th>
                <th scope="col" className="adm-num">
                  Key events
                </th>
                <th scope="col" className="adm-num">
                  Aanvragen
                </th>
              </tr>
            </thead>
            <tbody>
              {data.ai.map((row) => (
                <tr key={row.source}>
                  <td data-label="Bron" className="tabular adm-primary">
                    {row.source}
                  </td>
                  <td data-label="Sessies" className="adm-num">
                    {num(row.sessions)}
                  </td>
                  <td data-label="Betrokken" className="adm-num">
                    {num(row.engagedSessions)}
                  </td>
                  <td data-label="Key events" className="adm-num">
                    {num(row.keyEvents)}
                  </td>
                  <td data-label="Aanvragen" className="adm-num">
                    {num(row.inquiries)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[0.82rem] text-muted">Alleen bronnen die daadwerkelijk als verwijzer of UTM gezien zijn. Een assistent die geen verwijzer meestuurt telt als direct en staat hier niet.</p>
      </AdminSection>

      <div className="grid gap-10 lg:grid-cols-2">
        <AdminSection id="geo" title="Geografie" note="Top 15 naar sessies">
          {data.geo.length === 0 ? (
            <Empty>{empty}</Empty>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Land</th>
                  <th scope="col">Regio</th>
                  <th scope="col">Stad</th>
                  <th scope="col" className="adm-num">
                    Sessies
                  </th>
                  <th scope="col" className="adm-num">
                    Key events
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.geo.map((row) => (
                  <tr key={`${row.country}|${row.region}|${row.city}`}>
                    <td data-label="Land">{row.country}</td>
                    <td data-label="Regio">{row.region}</td>
                    <td data-label="Stad">{row.city}</td>
                    <td data-label="Sessies" className="adm-num">
                      {num(row.sessions)}
                    </td>
                    <td data-label="Key events" className="adm-num">
                      {num(row.keyEvents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[0.82rem] text-muted">Locatie is door Google afgeleid uit het netwerkadres en kan onnauwkeurig zijn; bij kleine aantallen laat Google een plaats weg.</p>
        </AdminSection>

        <AdminSection id="landing" title="Landingspagina's" note="Top 20 naar sessies">
          {data.landing.length === 0 ? (
            <Empty>{empty}</Empty>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Pagina</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="adm-num">
                    Sessies
                  </th>
                  <th scope="col" className="adm-num">
                    Betrokken
                  </th>
                  <th scope="col" className="adm-num">
                    Key events
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.landing.map((row) => (
                  <tr key={row.landingPage}>
                    <td data-label="Pagina" className="tabular adm-wrap adm-primary">
                      {row.landingPage}
                    </td>
                    <td data-label="Type">{pageTypeLabels[row.pageType]}</td>
                    <td data-label="Sessies" className="adm-num">
                      {num(row.sessions)}
                    </td>
                    <td data-label="Betrokken" className="adm-num">
                      {num(row.engagedSessions)}
                    </td>
                    <td data-label="Key events" className="adm-num">
                      {num(row.keyEvents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>
      </div>

      <AdminSection id="services" title="Diensten en pakketten" note="Weergaven, vervolgstappen en plannerinzendingen per dienst en per projecttype">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-[0.9rem] font-medium text-ink">Diensten</h3>
            {data.services.length === 0 ? (
              <div className="mt-2">
                <Empty>{empty}</Empty>
              </div>
            ) : (
              <table className="adm-table mt-2">
                <thead>
                  <tr>
                    <th scope="col">Dienst</th>
                    <th scope="col" className="adm-num">
                      Weergaven
                    </th>
                    <th scope="col" className="adm-num">
                      CTA-klikken
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((row) => (
                    <tr key={row.serviceId}>
                      <td data-label="Dienst" className="adm-primary">
                        {row.label}
                        <span className="tabular block text-[0.8rem] text-muted">{row.serviceId}</span>
                      </td>
                      <td data-label="Weergaven" className="adm-num">
                        {num(row.views)}
                      </td>
                      <td data-label="CTA-klikken" className="adm-num">
                        {num(row.ctaClicks)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="text-[0.9rem] font-medium text-ink">Projecttypes</h3>
            {data.packages.length === 0 ? (
              <div className="mt-2">
                <Empty>{empty}</Empty>
              </div>
            ) : (
              <table className="adm-table mt-2">
                <thead>
                  <tr>
                    <th scope="col">Pakket</th>
                    <th scope="col" className="adm-num">
                      Geopend
                    </th>
                    <th scope="col" className="adm-num">
                      Naar planner
                    </th>
                    <th scope="col" className="adm-num">
                      Planner verzonden
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.packages.map((row) => (
                    <tr key={row.packageId}>
                      <td data-label="Pakket" className="tabular adm-primary">
                        {row.packageId}
                      </td>
                      <td data-label="Geopend" className="adm-num">
                        {num(row.selections)}
                      </td>
                      <td data-label="Naar planner" className="adm-num">
                        {num(row.ctaClicks)}
                      </td>
                      <td data-label="Planner verzonden" className="adm-num">
                        {num(row.plannerCompletions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </AdminSection>

      <AdminSection id="ctas" title="CTA's" note="Klikken per knop, doel en plek; ids zoals de site ze meet">
        {data.ctas.length === 0 ? (
          <Empty>{empty}</Empty>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">CTA</th>
                <th scope="col">Doel</th>
                <th scope="col">Plek</th>
                <th scope="col" className="adm-num">
                  Klikken
                </th>
              </tr>
            </thead>
            <tbody>
              {data.ctas.map((row) => (
                <tr key={`${row.ctaId}|${row.ctaTarget}|${row.placement}`}>
                  <td data-label="CTA" className="tabular adm-primary">
                    {row.ctaId}
                  </td>
                  <td data-label="Doel" className="tabular">
                    {row.ctaTarget}
                  </td>
                  <td data-label="Plek" className="tabular">
                    {row.placement}
                  </td>
                  <td data-label="Klikken" className="adm-num">
                    {num(row.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminSection>

      <div className="grid gap-10 lg:grid-cols-2">
        <AdminSection id="planner-funnel" title="Projectplanner" note="Aantallen per stap en het aandeel dat de volgende stap haalt">
          <FunnelBars steps={data.plannerFunnel.steps} />
          {data.plannerFunnel.errors.length > 0 ? (
            <dl className="mt-5 border-t border-line">
              {data.plannerFunnel.errors.map((error) => (
                <div key={error.stepName} className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-[0.88rem]">
                  <dt className="text-muted">Fouten bij {error.label}</dt>
                  <dd className="tabular text-ink">{num(error.count)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-[0.82rem] text-muted">Geen validatie- of serverfouten gemeten in deze periode.</p>
          )}
        </AdminSection>

        <AdminSection id="contact-funnel" title="Contactformulier" note="Begonnen met invullen tegenover verzonden">
          <FunnelBars steps={data.contactFunnel.steps} />
          <p className="mt-4 text-[0.88rem] text-muted">
            Fouten (validatie, server, netwerk): <span className="tabular text-ink">{num(data.contactFunnel.errors)}</span>
          </p>
        </AdminSection>
      </div>

      <SyncStatusBlock sync={sync} />
    </div>
  );
}
