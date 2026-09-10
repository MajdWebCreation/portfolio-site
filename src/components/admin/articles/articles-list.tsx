"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CtaLink from "@/components/cta-link";
import { FilterBar, FilterSelect, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { docToPlainText } from "@/lib/admin/articles/doc";
import { articleStatusLabels, articleStatusOrder, articleStatusTone, type Article } from "@/lib/admin/articles/types";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { getBlogCategoryLabel } from "@/lib/content/blog";

export default function ArticlesList({ articles }: { articles: Article[] }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles
      .filter((article) => status === "all" || article.status === status)
      .filter(
        (article) =>
          !needle || [article.title, article.slug, article.excerpt, docToPlainText(article.content)].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [articles, status, query]);


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
          </FilterSelect>
          <SearchField id="article-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Titel, slug of tekst" />
        </FilterBar>
        <CtaLink href="/admin/artikelen/nieuw" className="max-sm:w-full">
          Nieuw artikel
        </CtaLink>
      </div>

      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {articles.length} artikelen
      </p>

      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">Geen artikelen die aan deze filters voldoen.</p>
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
                  <StatusBadge tone={articleStatusTone[article.status]}>{articleStatusLabels[article.status]}</StatusBadge>
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
