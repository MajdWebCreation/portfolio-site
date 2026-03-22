import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/content/site-content";
import type { PublishedArticle } from "@/lib/content/blog";
import { getBlogCategoryLabel } from "@/lib/content/blog";

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
  return (
    <article
      className={`group relative grid overflow-hidden rounded-[2rem] border border-white/10 bg-[#071019] ${
        variant === "featured" ? "min-h-[520px]" : "min-h-[400px]"
      }`}
    >
      <div className="absolute inset-0">
        <Image
          src={imageSrc}
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1280px) 32vw, (min-width: 768px) 48vw, 100vw"
          className="object-cover object-center transition duration-700 group-hover:scale-[1.03] group-hover:rotate-[0.6deg]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.04),rgba(4,7,12,0.48)_40%,rgba(4,7,12,0.95)_100%)]" />
      </div>

      <div className="relative flex h-full flex-col justify-end p-6 md:p-7">
        <div className="mb-6 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.26em] text-cyan-200/80">
          <span>{getBlogCategoryLabel(locale, article.category)}</span>
          <span className="text-white/30">/</span>
          <span>{article.readingTime}</span>
        </div>

        <h2
          className={`max-w-xl font-semibold leading-tight text-white ${
            variant === "featured" ? "text-[2.2rem]" : "text-3xl"
          }`}
        >
          {article.title}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/68">
          {article.metaDescription}
        </p>

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

          {article.publishedAt ? (
            <span className="text-xs uppercase tracking-[0.22em] text-white/38">
              {article.publishedAt}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
