import { compare, daily, sum } from "@/lib/admin/analytics/aggregate";
import { isBrandedQuery } from "@/lib/admin/analytics/branded";
import { describeSearchPage, serviceLabel } from "@/lib/admin/analytics/page-types";
import { inRange } from "@/lib/admin/analytics/periods";
import { bingWebmasterUrl, searchConsoleUrl } from "@/lib/admin/analytics/providers";
import type {
  AcquisitionRow,
  BingSearchBlock,
  BrandSplit,
  FactRecord,
  GoogleSearchBlock,
  InquiryRecord,
  Insight,
  PeriodRanges,
  SearchMetrics,
  SearchPageRow,
  SearchRow,
  ServiceRow,
} from "@/lib/admin/analytics/types";

/**
 * Search Console, Bing and the side-by-side acquisition view, as pure
 * functions over the synced facts.
 *
 * Totals come from the totals reports only (`gsc.totals`, `bing.traffic`).
 * Query rows are never added up into a total: Search Console leaves out
 * anonymised queries and we keep the top 500 per day, so a sum of queries
 * is always a part. The branded split is therefore a split of the
 * classified query clicks, and says so.
 *
 * CTR and position are re-derived when rows are combined: CTR as clicks
 * over impressions, position as the impression-weighted mean of the rows'
 * positions (Search Console's own definition of an average position).
 */

/**
 * Trend thresholds. A query or page is a riser or faller only when it had
 * at least `SEARCH_TREND_MIN_IMPRESSIONS` impressions in one of the two
 * periods and its clicks moved by at least `SEARCH_TREND_MIN_CLICK_CHANGE`.
 * Below 50 impressions one click moves CTR by two points or more, and a
 * change of one or two clicks is day-to-day noise; these two keep the
 * lists to movements an admin can act on. A percentage is shown only when
 * the previous period had `SEARCH_RELATIVE_MIN_BASE` clicks: from 1 to 6
 * is "+500%" and means nothing.
 */
export const SEARCH_TREND_MIN_IMPRESSIONS = 50;
export const SEARCH_TREND_MIN_CLICK_CHANGE = 3;
export const SEARCH_RELATIVE_MIN_BASE = 10;

/** Insight thresholds; see `buildInsights`. */
export const INSIGHT_LOW_CTR_MIN_IMPRESSIONS = 200;
export const INSIGHT_LOW_CTR_FACTOR = 0.5;
export const INSIGHT_SEARCH_CHANGE_MIN_BASE = 30;
export const INSIGHT_SEARCH_CHANGE_MIN_RATIO = 0.25;
export const INSIGHT_SERVICE_MIN_VIEWS = 50;
export const INSIGHT_SERVICE_LOW_CTA_RATE = 0.02;
export const INSIGHT_SOURCE_MIN_SESSIONS = 100;
const INSIGHT_LIMIT = 6;

type Which = "current" | "previous";

function of(facts: FactRecord[], report: string): FactRecord[] {
  return facts.filter((row) => row.report === report);
}

function within(rows: FactRecord[], ranges: PeriodRanges, which: Which): FactRecord[] {
  return rows.filter((row) => inRange(row.date, ranges[which]));
}

/** Sums and re-weighted rates. `positionMetric` names the stored position (Bing has two). */
export function searchMetrics(rows: FactRecord[], positionMetric = "position"): SearchMetrics {
  const clicks = sum(rows, "clicks");
  const impressions = sum(rows, "impressions");
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    const position = row.metrics[positionMetric];
    const shown = row.metrics.impressions ?? 0;
    if (typeof position === "number" && shown > 0) {
      weighted += position * shown;
      weight += shown;
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: weight > 0 ? weighted / weight : null,
  };
}

function searchRow(key: string, current: SearchMetrics, previous: SearchMetrics): SearchRow {
  const clickChange = current.clicks - previous.clicks;
  return {
    key,
    current,
    previous,
    clickChange,
    impressionChange: current.impressions - previous.impressions,
    relativeClickChange: previous.clicks >= SEARCH_RELATIVE_MIN_BASE ? clickChange / previous.clicks : null,
  };
}

/** Rows grouped by one dimension, each with its current and previous figures. */
export function searchRows(rows: FactRecord[], ranges: PeriodRanges, dimension: string, positionMetric = "position"): SearchRow[] {
  const groups = new Map<string, { current: FactRecord[]; previous: FactRecord[] }>();
  for (const row of rows) {
    const key = row.dims[dimension];
    if (key === undefined) continue;
    const which: Which | null = inRange(row.date, ranges.current) ? "current" : inRange(row.date, ranges.previous) ? "previous" : null;
    if (!which) continue;
    const group = groups.get(key) ?? { current: [], previous: [] };
    group[which].push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => searchRow(key, searchMetrics(group.current, positionMetric), searchMetrics(group.previous, positionMetric)));
}

const byCurrent = (a: SearchRow, b: SearchRow) => b.current.clicks - a.current.clicks || b.current.impressions - a.current.impressions || a.key.localeCompare(b.key);

function trendEligible(row: SearchRow): boolean {
  return Math.max(row.current.impressions, row.previous.impressions) >= SEARCH_TREND_MIN_IMPRESSIONS;
}

export function risersAndFallers(rows: SearchRow[], limit = 10): { risers: SearchRow[]; fallers: SearchRow[] } {
  const eligible = rows.filter(trendEligible);
  return {
    risers: eligible
      .filter((row) => row.clickChange >= SEARCH_TREND_MIN_CLICK_CHANGE)
      .sort((a, b) => b.clickChange - a.clickChange || b.impressionChange - a.impressionChange)
      .slice(0, limit),
    fallers: eligible
      .filter((row) => row.clickChange <= -SEARCH_TREND_MIN_CLICK_CHANGE)
      .sort((a, b) => a.clickChange - b.clickChange || a.impressionChange - b.impressionChange)
      .slice(0, limit),
  };
}

export function buildBrandSplit(queryRows: FactRecord[], ranges: PeriodRanges): BrandSplit {
  const part = (which: Which, branded: boolean) => within(queryRows, ranges, which).filter((row) => isBrandedQuery(row.dims.query ?? "") === branded);
  const clicks = (which: Which, branded: boolean) => sum(part(which, branded), "clicks");
  const impressions = (which: Which, branded: boolean) => sum(part(which, branded), "impressions");
  const share = (which: Which) => {
    const total = clicks(which, true) + clicks(which, false);
    return total > 0 ? clicks(which, true) / total : null;
  };
  return {
    branded: { clicks: compare(clicks("current", true), clicks("previous", true)), impressions: compare(impressions("current", true), impressions("previous", true)) },
    nonBranded: {
      clicks: compare(clicks("current", false), clicks("previous", false)),
      impressions: compare(impressions("current", false), impressions("previous", false)),
    },
    brandedShare: { current: share("current"), previous: share("previous") },
  };
}

function pageRows(rows: SearchRow[]): SearchPageRow[] {
  return rows.map((row) => {
    const info = describeSearchPage(row.key);
    return { ...row, ...info, serviceLabel: info.serviceId ? serviceLabel(info.serviceId) : null };
  });
}

function anyIn(rows: FactRecord[], ranges: PeriodRanges): boolean {
  return rows.some((row) => inRange(row.date, ranges.current) || inRange(row.date, ranges.previous));
}

export function buildGoogleSearch(facts: FactRecord[], ranges: PeriodRanges, siteUrl: string | null): GoogleSearchBlock {
  const totals = of(facts, "gsc.totals");
  const queries = of(facts, "gsc.queries");
  const current = searchMetrics(within(totals, ranges, "current"));
  const previous = searchMetrics(within(totals, ranges, "previous"));
  const queryRows = searchRows(queries, ranges, "query");

  return {
    available: anyIn(totals, ranges),
    totals: { current, previous, clicks: compare(current.clicks, previous.clicks), impressions: compare(current.impressions, previous.impressions) },
    daily: { current: daily(totals, ranges, "current", "clicks"), previous: daily(totals, ranges, "previous", "clicks") },
    brand: buildBrandSplit(queries, ranges),
    queries: [...queryRows].sort(byCurrent).slice(0, 25),
    ...risersAndFallers(queryRows),
    pages: pageRows(searchRows(of(facts, "gsc.pages"), ranges, "page").sort(byCurrent).slice(0, 20)),
    countries: searchRows(of(facts, "gsc.countries"), ranges, "country").sort(byCurrent).slice(0, 15),
    devices: searchRows(of(facts, "gsc.devices"), ranges, "device").sort(byCurrent),
    appearance: searchRows(of(facts, "gsc.appearance"), ranges, "appearance").sort(byCurrent),
    consoleUrl: searchConsoleUrl(siteUrl),
  };
}

export function buildBingSearch(facts: FactRecord[], ranges: PeriodRanges): BingSearchBlock {
  const traffic = of(facts, "bing.traffic");
  const crawl = of(facts, "bing.crawl")
    .filter((row) => row.date <= ranges.current.end)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  return {
    available: anyIn(traffic, ranges),
    totals: {
      clicks: compare(sum(within(traffic, ranges, "current"), "clicks"), sum(within(traffic, ranges, "previous"), "clicks")),
      impressions: compare(sum(within(traffic, ranges, "current"), "impressions"), sum(within(traffic, ranges, "previous"), "impressions")),
    },
    daily: { current: daily(traffic, ranges, "current", "clicks"), previous: daily(traffic, ranges, "previous", "clicks") },
    queries: searchRows(of(facts, "bing.queries"), ranges, "query", "avg_impression_position").sort(byCurrent).slice(0, 20),
    pages: pageRows(searchRows(of(facts, "bing.pages"), ranges, "page", "avg_impression_position").sort(byCurrent).slice(0, 20)),
    crawl: crawl ? { date: crawl.date, metrics: crawl.metrics } : null,
    consoleUrl: bingWebmasterUrl,
  };
}

/**
 * Google, Bing and ChatGPT, each seen by GA, by its own search console
 * where it has one, and by the inquiries. The GA columns count the organic
 * medium for the search engines (`google / organic`, `bing / organic`) and
 * every medium for ChatGPT; the inquiries count the canonical source the
 * site recorded. A provider without rows in the period gives null, shown
 * as a dash; a provider with rows and none for this source gives 0.
 */
const acquisitionSources: Array<{
  source: AcquisitionRow["source"];
  label: string;
  ga: (source: string, medium: string) => boolean;
  inquirySource: string;
  clicksReport: string | null;
}> = [
  { source: "google", label: "Google", ga: (source, medium) => source === "google" && medium === "organic", inquirySource: "google.com", clicksReport: "gsc.totals" },
  { source: "bing", label: "Bing", ga: (source, medium) => source === "bing" && medium === "organic", inquirySource: "bing.com", clicksReport: "bing.traffic" },
  { source: "chatgpt", label: "ChatGPT", ga: (source) => source === "chatgpt.com" || source === "chat.openai.com", inquirySource: "chatgpt.com", clicksReport: null },
];

export function buildAcquisition(facts: FactRecord[], inquiries: InquiryRecord[], ranges: PeriodRanges): AcquisitionRow[] {
  const gaRows = within(of(facts, "ga4.sources"), ranges, "current");
  return acquisitionSources.map((entry) => {
    const matching = gaRows.filter((row) => {
      const [source = "", medium = ""] = (row.dims.source_medium ?? "").split(" / ").map((part) => part.trim().toLowerCase());
      return entry.ga(source, medium);
    });
    const clicksRows = entry.clicksReport ? within(of(facts, entry.clicksReport), ranges, "current") : [];
    return {
      source: entry.source,
      label: entry.label,
      gaSessions: gaRows.length > 0 ? sum(matching, "sessions") : null,
      searchClicks: entry.clicksReport && clicksRows.length > 0 ? sum(clicksRows, "clicks") : null,
      searchClicksApplicable: entry.clicksReport !== null,
      inquiries: inquiries.filter((row) => row.trafficSource === entry.inquirySource && inRange(row.receivedAt.slice(0, 10), ranges.current)).length,
    };
  });
}

const nl = new Intl.NumberFormat("nl-NL");
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 });

/**
 * "Opvallend": a few rule-based observations, described, not explained.
 *
 *   low_ctr_page       a page with at least 200 Search Console impressions
 *                      whose CTR is below half the site's CTR;
 *   search_change      Google clicks at least 25% above or below the
 *                      previous period, from a base of at least 30;
 *   service_low_cta    a service with at least 50 views and fewer than 2
 *                      CTA clicks per 100 views;
 *   source_no_inquiries  Google, Bing or ChatGPT with at least 100 GA
 *                      sessions and no inquiry recorded from it.
 * The wording states what was measured in the period and nothing about
 * why. No model, no ranking beyond the order above; at most six.
 */
export function buildInsights(input: { googleSearch: GoogleSearchBlock; services: ServiceRow[]; acquisition: AcquisitionRow[] }): Insight[] {
  const insights: Insight[] = [];
  const { googleSearch } = input;
  const siteCtr = googleSearch.totals.current.ctr;

  if (siteCtr !== null) {
    for (const page of googleSearch.pages) {
      const ctr = page.current.ctr;
      if (page.current.impressions >= INSIGHT_LOW_CTR_MIN_IMPRESSIONS && ctr !== null && ctr < siteCtr * INSIGHT_LOW_CTR_FACTOR) {
        insights.push({
          kind: "low_ctr_page",
          text: `${page.path} had in deze periode relatief veel impressies in Google (${nl.format(page.current.impressions)}) en een CTR van ${percent.format(ctr)}, tegen ${percent.format(siteCtr)} voor de hele site.`,
        });
      }
    }
  }

  const clicks = googleSearch.totals.clicks;
  if (clicks.previous >= INSIGHT_SEARCH_CHANGE_MIN_BASE && clicks.delta !== null && Math.abs(clicks.delta) >= INSIGHT_SEARCH_CHANGE_MIN_RATIO) {
    insights.push({
      kind: "search_change",
      text: `Klikken vanuit Google lagen ${percent.format(Math.abs(clicks.delta))} ${clicks.delta > 0 ? "hoger" : "lager"} dan in de vorige periode (${nl.format(clicks.current)} tegen ${nl.format(clicks.previous)}).`,
    });
  }

  for (const service of input.services) {
    if (service.views >= INSIGHT_SERVICE_MIN_VIEWS && service.ctaClicks / service.views < INSIGHT_SERVICE_LOW_CTA_RATE) {
      insights.push({
        kind: "service_low_cta",
        text: `${service.label} werd ${nl.format(service.views)} keer bekeken, met ${nl.format(service.ctaClicks)} CTA-klikken in dezelfde periode.`,
      });
    }
  }

  for (const row of input.acquisition) {
    if (row.gaSessions !== null && row.gaSessions >= INSIGHT_SOURCE_MIN_SESSIONS && row.inquiries === 0) {
      insights.push({
        kind: "source_no_inquiries",
        text: `${row.label} bracht volgens GA ${nl.format(row.gaSessions)} sessies; er is in deze periode geen aanvraag met die bron vastgelegd.`,
      });
    }
  }

  return insights.slice(0, INSIGHT_LIMIT);
}
