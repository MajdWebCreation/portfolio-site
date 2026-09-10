import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleRichText from "@/components/article-rich-text";
import JsonLd from "@/components/json-ld";
import NextStep from "@/components/next-step";
import SiteShell from "@/components/site-shell";
import {
  getArticleBySlug,
  getArticleMetadataInput,
  getPublishedArticlePaths,
} from "@/lib/content/articles";
import {
  getArticleDateLabel,
  getBlogCategoryLabel,
  getRelatedLinkLabel,
} from "@/lib/content/blog";
import { articleImageUrl } from "@/lib/admin/articles/media";
import { getLocalizedPath } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { blogPostingSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent } from "@/lib/content/site-content";

/*
  The published articles are prerendered, and an article that is published
  after a build is rendered on demand rather than 404'd -- the admin's save
  revalidates these paths, so publishing and unpublishing both take effect
  without a deploy. A slug that is not a published article still 404s,
  because the database returns nothing for it.
*/
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getPublishedArticlePaths("nl")).map((path) => ({
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

  const article = await getArticleBySlug(locale, slug);

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

  const article = await getArticleBySlug(locale, slug);

  if (!article) {
    notFound();
  }

  const content = siteContent[locale];
  const pageUrl = getCanonicalUrl(article.path);
  const blogPath = getLocalizedPath(locale, "blog");
  // The lede is the article's excerpt and is rendered in the header, so the
  // body is the stored document as it is.
  const bodyBlocks = article.bodyBlocks;

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
        <article className="container-x pt-12 sm:pt-16 lg:pt-20">
          <header className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="label-mono flex flex-wrap gap-x-3 gap-y-1 lg:col-span-3 lg:flex-col">
              <Link href={blogPath} className="transition-colors hover:text-ink">
                {content.nav.blog}
              </Link>
              <span>{getBlogCategoryLabel(locale, article.category)}</span>
              {article.publishedAt ? (
                <time dateTime={article.publishedAt}>
                  {getArticleDateLabel(locale, article.publishedAt)}
                </time>
              ) : null}
              <span>{article.readingTime}</span>
              {article.author ? <span>{article.author}</span> : null}
            </div>
            <div className="lg:col-span-8">
              <h1 className="display-lg">{article.title}</h1>
              <p className="lede reading mt-6">{article.intro}</p>
            </div>
          </header>

          {/* Optional: an article without an image keeps the layout it had. */}
          {article.featuredImage ? (
            <div className="relative mt-10 aspect-[16/9] w-full overflow-hidden rounded-sm bg-paper-deep">
              <Image
                src={articleImageUrl(article.featuredImage.path)}
                alt={article.featuredImage.alt}
                fill
                sizes="(min-width: 1024px) 60rem, 100vw"
                className="object-cover"
                priority
              />
            </div>
          ) : null}

          <div className="mt-12 grid lg:grid-cols-12 lg:gap-8">
            <div className="border-t border-line pt-8 lg:col-span-8 lg:col-start-4">
              <ArticleRichText blocks={bodyBlocks} />

              {article.relatedServices.length > 0 ? (
                <nav
                  aria-label={locale === "nl" ? "Gerelateerde pagina's" : "Related pages"}
                  className="mt-12 border-t border-line pt-6"
                >
                  <p className="label-mono">
                    {locale === "nl" ? "Gerelateerd" : "Related"}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {article.relatedServices.map((href) => (
                      <li key={href}>
                        <Link
                          href={href}
                          data-track-event="article_cta_click"
                          data-track-category="article"
                          data-track-label={getRelatedLinkLabel(locale, href)}
                          data-track-location="article-related-links"
                          className="link-static text-[0.98rem] text-ink"
                        >
                          {getRelatedLinkLabel(locale, href)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </div>
          </div>
        </article>

        <div className="mt-20 lg:mt-28">
          <NextStep
            title={locale === "nl" ? "Hier verder over praten?" : "Want to talk this through?"}
            text={article.ctaText}
            primaryLabel={locale === "nl" ? "Neem contact op" : "Get in touch"}
            primaryHref={article.ctaPrimaryLink}
            secondaryLabel={
              article.ctaSecondaryText ??
              (locale === "nl" ? "Terug naar inzichten" : "Back to insights")
            }
            secondaryHref={article.ctaSecondaryLink ?? blogPath}
            trackingContext="article"
          />
        </div>
      </SiteShell>
    </>
  );
}
