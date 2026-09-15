"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import CtaLink from "@/components/cta-link";
import { FilterBar, FilterSelect, SearchField, FilterSummary, NoMatches } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import {
  articleStateLabel,
  articleStateTone,
  articleStatusLabels,
  articleStatusOrder,
  isScheduled,
  type ArticleSummary,
} from "@/lib/admin/articles/types";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { getBlogCategoryLabel } from "@/lib/content/blog";

type ArticlesListProps = { articles: ArticleSummary[]; todayKey: string; search: string };

/**
 * Two filters, answered in two different places on purpose.
 *
 * Status is a property of the rows already on screen, so it is decided here
 * and takes effect as the selection changes. Searching reads the article text,
 * which lives in the database and stays there -- the term goes into the URL,
 * the server searches, and the rows come back. The field stays responsive
 * because what you type is local state; only the query is debounced.
 */
export default function ArticlesList({ articles, todayKey, search }: ArticlesListProps) {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [term, setTerm] = useState(search);
  const [applied, setApplied] = useState(search);
  const [searching, startSearch] = useTransition();

  // A search that arrives from elsewhere -- the back button, a shared link --
  // is what the field should show. Adjusted while rendering rather than in an
  // effect, so the field never paints the old term first.
  if (search !== applied) {
    setApplied(search);
    setTerm(search);
  }

  useEffect(() => {
    const next = term.trim();
    if (next === search) return;

    const timer = setTimeout(() => {
      startSearch(() => {
        router.replace(next ? `/admin/artikelen?q=${encodeURIComponent(next)}` : "/admin/artikelen", { scroll: false });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [term, search, router]);

  const filtered = status !== "all" || term.trim() !== "";
  function reset() {
    setStatus("all");
    setTerm("");
  }

  const rows = useMemo(
    () =>
      articles
        .filter((article) => {
          if (status === "all") return true;
          if (status === "scheduled") return isScheduled(article, todayKey);
          if (status === "published") return article.status === "published" && !isScheduled(article, todayKey);
          return article.status === status;
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [articles, status, todayKey],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar label="Artikelen filteren">
          <FilterSelect id="article-status" label="Status" value={status} onChange={setStatus}>
            <option value="all">Alle</option>
            {articleStatusOrder.map((value) => (
              <option key={value} value={value}>
                {articleStatusLabels[value]}
              </option>
            ))}
            <option value="scheduled">Ingepland</option>
          </FilterSelect>
          <SearchField id="article-search" label="Zoeken" value={term} onChange={setTerm} placeholder="Titel, slug of tekst" />
        </FilterBar>
        <CtaLink href="/admin/artikelen/nieuw" className="max-sm:w-full">
          Nieuw artikel
        </CtaLink>
      </div>

      <FilterSummary filtered={filtered} onReset={reset}>
        {searching ? "Zoeken…" : `${rows.length} van ${articles.length} artikelen`}
      </FilterSummary>

      {rows.length === 0 ? (
        <NoMatches>Geen artikelen die aan deze filters voldoen.</NoMatches>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Titel</th>
              <th scope="col">Status</th>
              <th scope="col">Gepubliceerd</th>
              <th scope="col">Gewijzigd</th>
              <th scope="col" className="adm-xl">
                Categorie
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((article) => (
              <tr key={article.id}>
                <td className="adm-primary" data-label="Titel">
                  <Link href={`/admin/artikelen/${article.id}`} className="adm-title link-static">
                    {article.title || "Zonder titel"}
                  </Link>
                  <span className="adm-wrap block font-mono text-[0.78rem] text-muted">/nl/blog/{article.slug || "…"}</span>
                </td>
                <td data-label="Status">
                  <StatusBadge tone={articleStateTone(article, todayKey)}>{articleStateLabel(article, todayKey)}</StatusBadge>
                </td>
                <td data-label="Gepubliceerd">
                  {article.publishedAt ? formatDate(`${article.publishedAt}T12:00:00+02:00`) : <span className="text-muted">—</span>}
                </td>
                <td data-label="Gewijzigd">
                  <time dateTime={article.updatedAt}>{formatDateTime(article.updatedAt)}</time>
                </td>
                <td data-label="Categorie" className="adm-xl">
                  {getBlogCategoryLabel("nl", article.category)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
