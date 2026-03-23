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

  return (
    <article
      className={`group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#071019] ${
        variant === "featured" ? "min-h-[520px]" : "min-h-[360px]"
      }`}
    >
      <div className="absolute inset-0">
        <Image
          src={imageSrc}
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1280px) 32vw, (min-width: 768px) 48vw, 100vw"
          className="object-cover object-center transition duration-700 group-hover:scale-[1.02] group-hover:rotate-[0.3deg]"
        />
        <div
          className={`absolute inset-0 ${
            variant === "featured"
              ? "bg-[linear-gradient(180deg,rgba(4,7,12,0.04),rgba(4,7,12,0.44)_38%,rgba(4,7,12,0.95)_100%)]"
              : "bg-[linear-gradient(180deg,rgba(4,7,12,0.06),rgba(4,7,12,0.54)_44%,rgba(4,7,12,0.96)_100%)]"
          }`}
        />
      </div>

      <div className="relative flex h-full flex-col justify-end p-6 md:p-7">
        <div className="mb-5 flex flex-wrap gap-x-3 gap-y-2 text-[10px] uppercase tracking-[0.24em] text-cyan-200/76">
          <span>{getBlogCategoryLabel(locale, article.category)}</span>
          <span className="text-white/22">/</span>
          <span>{article.readingTime}</span>
          {variant === "default" && formattedDate ? (
            <>
              <span className="text-white/22">/</span>
              <span className="text-white/40">{formattedDate}</span>
            </>
          ) : null}
        </div>

        <h2
          className={`max-w-xl font-semibold leading-tight text-white ${
            variant === "featured" ? "text-[2.15rem]" : "text-[1.75rem]"
          }`}
        >
          {article.title}
        </h2>

        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          {article.metaDescription}
        </p>

        {variant === "featured" ? (
          <div className="mt-8 flex items-center justify-between gap-4">
            <Link
              href={article.path}
              data-track-event="article_cta_click"
              data-track-category="blog-overview"
              data-track-label={article.title}
              data-track-location="editorial-article-card"
              className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-black/35 px-5 py-3 text-sm font-medium text-white transition duration-300 hover:border-cyan-300/40 hover:bg-black/50"
            >
              {locale === "nl" ? "Lees artikel" : "Read article"}
              <span className="text-cyan-200 transition group-hover:translate-x-1">
                →
              </span>
            </Link>

            {formattedDate ? (
              <span className="text-xs uppercase tracking-[0.22em] text-white/36">
                {formattedDate}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="mt-7">
            <Link
              href={article.path}
              data-track-event="article_cta_click"
              data-track-category="blog-overview"
              data-track-label={article.title}
              data-track-location="editorial-article-card"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/76 transition hover:text-white"
            >
              {locale === "nl" ? "Lees artikel" : "Read article"}
              <span className="text-cyan-200 transition group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}