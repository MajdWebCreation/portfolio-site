import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleRichText from "@/components/article-rich-text";
import JsonLd from "@/components/json-ld";
import SeoCta from "@/components/seo-cta";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import {
  getArticleBySlug,
  getArticleDateLabel,
  getArticleMetadataInput,
  getBlogCategoryLabel,
  getPublishedArticlePaths,
  getRelatedLinkLabel,
} from "@/lib/content/blog";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { blogPostingSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent } from "@/lib/content/site-content";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getPublishedArticlePaths("nl").map((path) => ({
    locale: "nl",
    slug: path.split("/").pop() ?? "",
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const article = getArticleBySlug(locale, slug);

  if (!article) {
    return {
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const metadataInput = getArticleMetadataInput(locale, article);

  return buildMetadata({
    locale,
    pathname: metadataInput.pathname,
    title: metadataInput.title,
    description: metadataInput.description,
    absoluteTitle: true,
  });
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const article = getArticleBySlug(locale, slug);

  if (!article) {
    notFound();
  }

  const content = siteContent[locale];
  const pageUrl = getCanonicalUrl(article.path);
  const articleHeaderImages = {
    kosten: "/images/visuals/blog-editorial-curve-panel.png",
    seo: "/images/visuals/blog-editorial-angular-panel.png",
    webapplicaties: "/images/visuals/blog-editorial-perspective-panel.png",
    performance: "/images/visuals/blog-editorial-diagonal-panel.png",
  } as const;

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: article.title,
            description: article.metaDescription,
            url: pageUrl,
          }),
          blogPostingSchema({
            headline: article.title,
            description: article.metaDescription,
            url: pageUrl,
            datePublished: article.publishedAt,
            authorName: article.author,
          }),
        ]}
      />
      <SiteShell locale={locale} content={content} currentPath={article.path}>
        <article className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-curve ym-bg-breathe absolute inset-x-[-8%] inset-y-0 opacity-[0.52]" />
          <header className="relative overflow-hidden rounded-[2.6rem] border border-white/10 bg-[#07111a]">
            <div className="grid lg:grid-cols-[1.02fr_0.98fr]">
              <div className="relative z-10 p-6 md:p-8 lg:p-10">
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-cyan-300/72">
                  <span>{getBlogCategoryLabel(locale, article.category)}</span>
                  <span className="text-white/28">/</span>
                  <span>{article.readingTime}</span>
                  {article.publishedAt ? (
                    <>
                      <span className="text-white/28">/</span>
                      <span>{getArticleDateLabel(locale, article.publishedAt)}</span>
                    </>
                  ) : null}
                  {article.author ? (
                    <>
                      <span className="text-white/28">/</span>
                      <span>{article.author}</span>
                    </>
                  ) : null}
                </div>
                <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {article.title}
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-8 text-white/68 sm:text-lg">
                  {article.intro}
                </p>
              </div>

              <div className="relative min-h-[300px] lg:min-h-full">
                <Image
                  src={articleHeaderImages[article.category]}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,7,12,0.78),transparent_36%),linear-gradient(180deg,rgba(4,7,12,0.12),rgba(4,7,12,0.72)_72%,rgba(4,7,12,0.92))]" />
              </div>
            </div>
          </header>

          <div className="relative mt-10 rounded-[2.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8 lg:p-10">
            <ArticleRichText blocks={article.bodyBlocks} />
          </div>

          {article.relatedServices.length > 0 ? (
            <section className="mt-10 rounded-[2.2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
              <h2 className="text-3xl font-semibold text-white">
                {locale === "nl" ? "Gerelateerde links" : "Related links"}
              </h2>
              <div className="mt-6 flex flex-wrap gap-3">
                {article.relatedServices.map((href) => (
                  <Link
                    key={href}
                    href={href}
                    data-track-event="article_cta_click"
                    data-track-category="article"
                    data-track-label={getRelatedLinkLabel(locale, href)}
                    data-track-location="article-related-links"
                    className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                  >
                    {getRelatedLinkLabel(locale, href)}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-10">
            <SeoCta
              title={locale === "nl" ? "Volgende stap" : "Next step"}
              text={article.ctaText}
              primaryLabel={locale === "nl" ? "Neem contact op" : "Contact us"}
              primaryHref={article.ctaPrimaryLink}
              secondaryLabel={
                article.ctaSecondaryText ??
                (locale === "nl" ? "Terug naar inzichten" : "Back to insights")
              }
              secondaryHref={
                article.ctaSecondaryLink ??
                (locale === "nl" ? "/nl/blog" : "/en/blog")
              }
              trackingContext="article"
            />
          </div>
        </article>
        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
