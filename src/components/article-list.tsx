import Link from "next/link";
import type { PublicArticle } from "@/lib/content/articles";
import { getArticleDateLabel, getBlogCategoryLabel } from "@/lib/content/blog";
import type { Locale } from "@/lib/content/site-content";

type ArticleListProps = {
  articles: PublicArticle[];
  locale: Locale;
  readLabel: string;
};

/**
 * Articles as editorial rows: date and category in the margin, title and
 * intro in the main column. No images; the text is the content.
 */
export default function ArticleList({
  articles,
  locale,
  readLabel,
}: ArticleListProps) {
  return (
    <div className="border-b border-line">
      {articles.map((article) => (
        <article
          key={article.path}
          className="group grid gap-3 border-t border-line py-7 lg:grid-cols-12 lg:gap-8 lg:py-9"
        >
          <div className="label-mono flex flex-wrap gap-x-3 lg:col-span-3 lg:flex-col lg:gap-y-1.5">
            {article.publishedAt ? (
              <time dateTime={article.publishedAt}>
                {getArticleDateLabel(locale, article.publishedAt)}
              </time>
            ) : null}
            <span>{getBlogCategoryLabel(locale, article.category)}</span>
            <span>{article.readingTime}</span>
          </div>
          <div className="lg:col-span-8">
            <h2 className="display-sm">
              <Link
                href={article.path}
                data-track-event="article_cta_click"
                data-track-category="blog-overview"
                data-track-label={article.title}
                data-track-location="article-list"
                className="transition-colors hover:text-accent"
              >
                {article.title}
              </Link>
            </h2>
            <p className="reading mt-3 text-[0.98rem] leading-relaxed text-muted">
              {article.metaDescription}
            </p>
            <p className="mt-4">
              <Link
                href={article.path}
                tabIndex={-1}
                aria-hidden="true"
                className="link-line inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-ink"
              >
                {readLabel}
                <span className="translate-y-px">→</span>
              </Link>
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
