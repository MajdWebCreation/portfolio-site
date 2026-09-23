import AdminSection from "@/components/admin/admin-section";
import { Delta, Empty, Note, dec, num, pct, signedNum, signedPct } from "@/components/admin/analytics/parts";
import { HealthBadge } from "@/components/admin/analytics/sync-status";
import TrendLine from "@/components/admin/analytics/trend-line";
import { pageTypeLabels } from "@/lib/admin/analytics/page-types";
import {
  SEARCH_RELATIVE_MIN_BASE,
  SEARCH_TREND_MIN_CLICK_CHANGE,
  SEARCH_TREND_MIN_IMPRESSIONS,
} from "@/lib/admin/analytics/search-queries";
import type {
  AcquisitionRow,
  BingSearchBlock,
  Comparison,
  GoogleSearchBlock,
  Insight,
  ProviderSyncStatus,
  SearchPageRow,
  SearchRow,
} from "@/lib/admin/analytics/types";

/**
 * The search blocks and the side-by-side acquisition view. Search
 * Console and Bing each get their own section with their own words; their
 * figures are never merged with GA's, and the acquisition table puts
 * sessions, search clicks and inquiries in separate columns without a
 * total, because they count different things.
 */

function Tile({ label, value, previous, comparison }: { label: string; value: string; previous: string; comparison?: Comparison }) {
  return (
    <div className="border-t border-line py-3">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className="mt-1">
        <span className="tabular block text-[1.45rem] font-semibold leading-tight text-ink">{value}</span>
        <span className="tabular mt-0.5 block text-[0.8rem] text-muted">
          vorige {previous}
          {comparison ? (
            <>
              {" · "}
              <Delta comparison={comparison} />
            </>
          ) : null}
        </span>
      </dd>
    </div>
  );
}

function Change({ row }: { row: SearchRow }) {
  const tone = row.clickChange > 0 ? "text-success" : row.clickChange < 0 ? "text-danger" : "text-muted";
  return (
    <span className={tone}>
      {signedNum(row.clickChange)}
      {row.relativeClickChange !== null ? <span className="ml-1 text-muted">({signedPct(row.relativeClickChange)})</span> : null}
    </span>
  );
}

function SearchTable({
  rows,
  label,
  render = (row) => row.key,
  positionLabel = "Positie",
}: {
  rows: SearchRow[];
  label: string;
  render?: (row: SearchRow) => React.ReactNode;
  positionLabel?: string;
}) {
  return (
    <table className="adm-table mt-2">
      <thead>
        <tr>
          <th scope="col">{label}</th>
          <th scope="col" className="adm-num">
            Klikken
          </th>
          <th scope="col" className="adm-num">
            Impressies
          </th>
          <th scope="col" className="adm-num">
            CTR
          </th>
          <th scope="col" className="adm-num">
            {positionLabel}
          </th>
          <th scope="col" className="adm-num">
            Klikken vorige
          </th>
          <th scope="col" className="adm-num">
            Verschil
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td data-label={label} className="tabular adm-wrap adm-primary">
              {render(row)}
            </td>
            <td data-label="Klikken" className="adm-num">
              {num(row.current.clicks)}
            </td>
            <td data-label="Impressies" className="adm-num">
              {num(row.current.impressions)}
            </td>
            <td data-label="CTR" className="adm-num">
              {pct(row.current.ctr)}
            </td>
            <td data-label={positionLabel} className="adm-num">
              {dec(row.current.position)}
            </td>
            <td data-label="Klikken vorige" className="adm-num">
              {num(row.previous.clicks)}
            </td>
            <td data-label="Verschil" className="adm-num">
              <Change row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PageLabel({ row }: { row: SearchRow }) {
  const page = row as SearchPageRow;
  const detail = page.serviceLabel ?? (page.articleSlug ? `Artikel · ${page.articleSlug}` : pageTypeLabels[page.pageType]);
  return (
    <>
      {page.path}
      <span className="block text-[0.8rem] text-muted">{detail}</span>
    </>
  );
}

function SubTable({ title, rows, label, empty, render, positionLabel }: { title: string; rows: SearchRow[]; label: string; empty: string; render?: (row: SearchRow) => React.ReactNode; positionLabel?: string }) {
  return (
    <div>
      <h3 className="text-[0.9rem] font-medium text-ink">{title}</h3>
      {rows.length === 0 ? (
        <div className="mt-2">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <SearchTable rows={rows} label={label} render={render} positionLabel={positionLabel} />
      )}
    </div>
  );
}

function ProviderState({ status, name }: { status: ProviderSyncStatus | undefined; name: string }) {
  if (!status) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-[0.85rem] text-muted">
      <HealthBadge health={status.health} />
      {!status.configured ? <span>{name} is niet gekoppeld; zie Synchronisatie onderaan.</span> : null}
    </p>
  );
}

function ExternalCard({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <aside className="mt-8 rounded-sm border border-line bg-surface p-4">
      <h3 className="text-[0.9rem] font-medium text-ink">{title}</h3>
      <p className="mt-1 text-[0.85rem] text-muted">{children}</p>
      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[0.88rem] font-medium text-accent underline-offset-2 hover:underline">
        {linkLabel} ↗
      </a>
    </aside>
  );
}

const deviceLabels: Record<string, string> = { DESKTOP: "Desktop", MOBILE: "Mobiel", TABLET: "Tablet" };

function emptyText(status: ProviderSyncStatus | undefined, name: string): string {
  if (!status?.configured) return `${name} is niet gekoppeld.`;
  return status.hasFacts ? "Geen gegevens in deze periode." : "Nog niets gesynchroniseerd.";
}

export function GoogleSearchSection({ block, status }: { block: GoogleSearchBlock; status: ProviderSyncStatus | undefined }) {
  const empty = emptyText(status, "Search Console");
  const { totals, brand } = block;

  return (
    <AdminSection id="google-search" title="Google Search" note="Search Console, zoekresultaten op het web; dagen in Pacific-tijd">
      <ProviderState status={status} name="Search Console" />
      {!block.available ? (
        <div className="mt-3">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <div className="mt-3 space-y-10">
          <div>
            <dl className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
              <Tile label="Klikken" value={num(totals.current.clicks)} previous={num(totals.previous.clicks)} comparison={totals.clicks} />
              <Tile label="Impressies" value={num(totals.current.impressions)} previous={num(totals.previous.impressions)} comparison={totals.impressions} />
              <Tile label="CTR" value={pct(totals.current.ctr)} previous={pct(totals.previous.ctr)} />
              <Tile label="Gem. positie" value={dec(totals.current.position)} previous={dec(totals.previous.position)} />
            </dl>
            <Note>
              Totalen uit het totalenrapport van Search Console. De laatste paar dagen zijn voorlopig en worden bijgewerkt zodra Google ze definitief maakt. Een lagere
              positie is beter.
            </Note>
            <div className="mt-6">
              <TrendLine current={block.daily.current} previous={block.daily.previous} label="Klikken per dag vanuit Google" unit="klikken" />
            </div>
          </div>

          <div>
            <h3 className="text-[0.9rem] font-medium text-ink">Merk en niet-merk</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 md:grid-cols-4">
              <Tile label="Merk: klikken" value={num(brand.branded.clicks.current)} previous={num(brand.branded.clicks.previous)} comparison={brand.branded.clicks} />
              <Tile label="Niet-merk: klikken" value={num(brand.nonBranded.clicks.current)} previous={num(brand.nonBranded.clicks.previous)} comparison={brand.nonBranded.clicks} />
              <Tile
                label="Merk: impressies"
                value={num(brand.branded.impressions.current)}
                previous={num(brand.branded.impressions.previous)}
                comparison={brand.branded.impressions}
              />
              <Tile
                label="Niet-merk: impressies"
                value={num(brand.nonBranded.impressions.current)}
                previous={num(brand.nonBranded.impressions.previous)}
                comparison={brand.nonBranded.impressions}
              />
            </dl>
            <Note>
              Aandeel merk in de klikken op zoekopdrachten: {pct(brand.brandedShare.current)} (vorige {pct(brand.brandedShare.previous)}). Merk is een zoekopdracht met
              &quot;ym creations&quot; of &quot;ymcreations&quot;. Dit telt alleen zoekopdrachten die Search Console per dag teruggeeft (tot 500 per dag, zonder
              geanonimiseerde zoekopdrachten); de som kan dus lager zijn dan het totaal hierboven.
            </Note>
          </div>

          <SubTable title="Zoekopdrachten" rows={block.queries} label="Zoekopdracht" empty="Geen zoekopdrachten in deze periode." />

          <div className="grid gap-10 lg:grid-cols-2">
            <SubTable title="Stijgers" rows={block.risers} label="Zoekopdracht" empty="Geen zoekopdracht die genoeg steeg om te tonen." />
            <SubTable title="Dalers" rows={block.fallers} label="Zoekopdracht" empty="Geen zoekopdracht die genoeg daalde om te tonen." />
          </div>
          <Note>
            Stijgers en dalers: minstens {SEARCH_TREND_MIN_IMPRESSIONS} impressies in een van beide perioden en minstens {SEARCH_TREND_MIN_CLICK_CHANGE} klikken verschil. Een
            percentage staat er alleen bij vanaf {SEARCH_RELATIVE_MIN_BASE} klikken in de vorige periode.
          </Note>

          <SubTable title="Landingspagina's in Google" rows={block.pages} label="Pagina" empty="Geen pagina's in deze periode." render={(row) => <PageLabel row={row} />} />

          <div className="grid gap-10 lg:grid-cols-2">
            <SubTable title="Landen" rows={block.countries} label="Land" empty="Geen landen in deze periode." render={(row) => row.key.toUpperCase()} />
            <SubTable title="Apparaten" rows={block.devices} label="Apparaat" empty="Geen apparaten in deze periode." render={(row) => deviceLabels[row.key] ?? row.key} />
          </div>
          <Note>Landen zoals Search Console ze meldt (ISO-code van drie letters); dit is een andere meting dan de geografie van Google Analytics.</Note>

          {block.appearance.length > 0 ? <SubTable title="Weergave in de zoekresultaten" rows={block.appearance} label="Weergave" empty="" /> : null}
        </div>
      )}

      <ExternalCard title="Google AI in de zoekresultaten" href={block.consoleUrl} linkLabel="Open in Search Console">
        AI Overviews en AI Mode tellen in de Search Console-API mee onder &quot;web&quot; en zijn daar niet apart op te vragen; ze zitten dus in de cijfers hierboven,
        niet als eigen regel. Wat Search Console over AI-functies laat zien, staat alleen in Search Console zelf en wordt niet gesynchroniseerd.
      </ExternalCard>
    </AdminSection>
  );
}

const crawlLabels: Record<string, string> = {
  in_index: "Pagina's in de index",
  crawled_pages: "Gecrawlde pagina's",
  crawl_errors: "Crawlfouten",
  code_2xx: "2xx",
  code_301: "301",
  code_302: "302",
  code_4xx: "4xx",
  code_5xx: "5xx",
  blocked_by_robots_txt: "Geblokkeerd door robots.txt",
  in_links: "Inkomende links",
  dns_failures: "DNS-fouten",
  connection_timeout: "Time-outs",
  contains_malware: "Malware",
  all_other_codes: "Overige codes",
};

export function BingSearchSection({ block, status }: { block: BingSearchBlock; status: ProviderSyncStatus | undefined }) {
  const empty = emptyText(status, "Bing Webmaster Tools");
  const crawlKeys = block.crawl ? Object.keys(crawlLabels).filter((key) => key in (block.crawl?.metrics ?? {})) : [];

  return (
    <AdminSection id="bing-search" title="Bing Search" note="Bing Webmaster Tools; zoekopdrachten en pagina's worden door Bing wekelijks bijgewerkt">
      <ProviderState status={status} name="Bing Webmaster Tools" />
      {!block.available ? (
        <div className="mt-3">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <div className="mt-3 space-y-10">
          <div>
            <dl className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
              <Tile label="Klikken (Web + Chat)" value={num(block.totals.clicks.current)} previous={num(block.totals.clicks.previous)} comparison={block.totals.clicks} />
              <Tile
                label="Impressies (Web + Chat)"
                value={num(block.totals.impressions.current)}
                previous={num(block.totals.impressions.previous)}
                comparison={block.totals.impressions}
              />
            </dl>
            <Note>
              Volgens Microsoft tellen deze dagcijfers sinds 24 maart 2023 alle Bing-onderdelen mee: Web, Chat, News, Afbeeldingen, Video&apos;s en het Knowledge Panel.
              Welk deel uit Copilot of Chat komt, geeft de API niet.
            </Note>
            <div className="mt-6">
              <TrendLine current={block.daily.current} previous={block.daily.previous} label="Klikken per dag vanuit Bing" unit="klikken" />
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-2">
            <SubTable title="Zoekopdrachten" rows={block.queries} label="Zoekopdracht" empty="Geen zoekopdrachten in deze periode." positionLabel="Gem. vertoningspositie" />
            <SubTable
              title="Pagina's"
              rows={block.pages}
              label="Pagina"
              empty="Geen pagina's in deze periode."
              render={(row) => <PageLabel row={row} />}
              positionLabel="Gem. vertoningspositie"
            />
          </div>

          <div>
            <h3 className="text-[0.9rem] font-medium text-ink">Crawl</h3>
            {block.crawl && crawlKeys.length > 0 ? (
              <>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 md:grid-cols-4">
                  {crawlKeys.map((key) => (
                    <div key={key} className="border-t border-line py-2">
                      <dt className="label-mono text-muted">{crawlLabels[key]}</dt>
                      <dd className="tabular mt-1 text-[1.05rem] text-ink">{num(block.crawl?.metrics[key] ?? null)}</dd>
                    </div>
                  ))}
                </dl>
                <Note>Laatste meting van Bing, {block.crawl.date}.</Note>
              </>
            ) : (
              <div className="mt-2">
                <Empty>Nog geen crawlgegevens.</Empty>
              </div>
            )}
          </div>
        </div>
      )}

      <ExternalCard title="Bing AI Performance" href={block.consoleUrl} linkLabel="Open Bing Webmaster Tools">
        Het AI Performance-rapport van Bing heeft geen API en wordt niet gesynchroniseerd. Kies daar de site en open het rapport om te zien hoe vaak de site in
        AI-antwoorden verschijnt.
      </ExternalCard>
    </AdminSection>
  );
}

export function AcquisitionSection({ rows }: { rows: AcquisitionRow[] }) {
  return (
    <AdminSection id="acquisition" title="Per bron naast elkaar" note="Drie verschillende metingen; ze worden niet bij elkaar opgeteld">
      <table className="adm-table">
        <thead>
          <tr>
            <th scope="col">Bron</th>
            <th scope="col" className="adm-num">
              Sessies (GA4)
            </th>
            <th scope="col" className="adm-num">
              Zoekklikken (eigen console)
            </th>
            <th scope="col" className="adm-num">
              Aanvragen (eigen registratie)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source}>
              <td data-label="Bron" className="adm-primary">
                {row.label}
              </td>
              <td data-label="Sessies (GA4)" className="adm-num">
                {num(row.gaSessions)}
              </td>
              <td data-label="Zoekklikken" className="adm-num">
                {row.searchClicksApplicable ? num(row.searchClicks) : <span title="Geen eigen zoekconsole">—</span>}
              </td>
              <td data-label="Aanvragen" className="adm-num">
                {num(row.inquiries)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>
        Sessies zijn bezoeken die Google Analytics mat (Google en Bing: medium organic; ChatGPT: elk medium). Zoekklikken telt de zoekmachine zelf, ook van bezoekers
        zonder toestemming voor analytics. Aanvragen komen uit de eigen database met de bron die de site bij de aanvraag vastlegde. — betekent: geen gegevens van die
        bron in deze periode; 0 betekent dat de bron wel rapporteerde en nul telde. Een zoekopdracht is nooit aan een aanvraag gekoppeld.
      </Note>
    </AdminSection>
  );
}

export function InsightsSection({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <AdminSection id="insights" title="Opvallend" note="Vaste regels over deze periode; beschrijvend, geen verklaring">
      <ul className="border-t border-line">
        {insights.map((insight) => (
          <li key={`${insight.kind}|${insight.text}`} className="border-b border-line py-2 text-[0.92rem] text-ink">
            {insight.text}
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}
