import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/content/site-content";
import type { PublishedArticle } from "@/lib/content/blog";
import {
  getArticleDateLabel,
  getBlogCategoryLabel,
} from "@/lib/content/blog";

type EditorialArticleCardProps = {
  article: PublishedArticle;
  locale: Locale;
  imageSrc: string;
  priority?: boolean;
  variant?: "featured" | "default";
};

export default function EditorialArticleCard({
  article,
  locale,
  imageSrc,
  priority = false,
  variant = "default",
}: EditorialArticleCardProps) {
  const formattedDate = article.publishedAt
    ? getArticleDateLabel(locale, article.publishedAt)
    : null;
  const isFeatured = variant === "featured";

  return (
    <article
      className={`ym-surface-strong group overflow-hidden rounded-[2rem] ${
        isFeatured ? "min-h-[520px]" : "min-h-[380px]"
      }`}
    >
      <div className={isFeatured ? "grid min-h-[520px] lg:grid-cols-[1.02fr_0.98fr]" : "flex h-full flex-col"}>
        <div
          className={`relative overflow-hidden border-b border-[color:var(--line)] ${
            isFeatured ? "min-h-[320px] lg:min-h-full lg:border-b-0 lg:border-r" : "min-h-[220px]"
          }`}
        >
          <Image
            src={imageSrc}
            alt=""
            fill
            priority={priority}
            sizes={
              isFeatured
                ? "(min-width: 1280px) 36vw, (min-width: 1024px) 44vw, 100vw"
                : "(min-width: 1280px) 24vw, (min-width: 768px) 48vw, 100vw"
            }
            className="object-cover object-center transition duration-700 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(10,18,28,0.18))]" />
          <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/14 bg-[rgba(9,16,24,0.62)] px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-white/84 backdrop-blur-sm">
            <span>{getBlogCategoryLabel(locale, article.category)}</span>
            <span className="text-white/35">/</span>
            <span>{article.readingTime}</span>
          </div>
        </div>

        <div className="flex h-full flex-col justify-between bg-[var(--background-elevated)] p-6 md:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
              <span className="text-[var(--accent-text)]">
                {locale === "nl" ? "Insight" : "Insight"}
              </span>
              {formattedDate ? (
                <>
                  <span>/</span>
                  <span>{formattedDate}</span>
                </>
              ) : null}
            </div>

            <h2
              className={`mt-5 max-w-xl font-semibold leading-tight text-[var(--foreground)] ${
                isFeatured ? "text-[2.1rem] md:text-[2.35rem]" : "text-[1.65rem]"
              }`}
            >
              {article.title}
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--muted-foreground)]">
              {article.metaDescription}
            </p>
          </div>

          {isFeatured ? (
            <div className="mt-8 flex items-center justify-between gap-4 border-t border-[color:var(--line)] pt-6">
              <Link
                href={article.path}
                data-track-event="article_cta_click"
                data-track-category="blog-overview"
                data-track-label={article.title}
                data-track-location="editorial-article-card"
                className="inline-flex items-center gap-3 rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-5 py-3 text-sm font-medium text-[var(--button-text)] transition duration-300 hover:opacity-92"
              >
                {locale === "nl" ? "Lees artikel" : "Read article"}
                <span className="text-[var(--button-text)] transition group-hover:translate-x-1">
                  →
                </span>
              </Link>

              {formattedDate ? (
                <span className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                  {formattedDate}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-7 border-t border-[color:var(--line)] pt-5">
              <Link
                href={article.path}
                data-track-event="article_cta_click"
                data-track-category="blog-overview"
                data-track-label={article.title}
                data-track-location="editorial-article-card"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--foreground)] transition hover:text-[var(--accent-text)]"
              >
                {locale === "nl" ? "Lees artikel" : "Read article"}
                <span className="text-[var(--accent-text)] transition group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
