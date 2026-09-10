import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleList from "@/components/article-list";
import CtaLink from "@/components/cta-link";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import SiteShell from "@/components/site-shell";
import { getPublishedArticles } from "@/lib/content/articles";
import { blogOverviewContent } from "@/lib/content/blog";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { blogSchema } from "@/lib/schema";
import { isValidLocale, siteContent } from "@/lib/content/site-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  return buildMetadata({
    locale,
    pathname: getLocalizedPath(locale, "blog"),
    title: blogOverviewContent[locale].metaTitle,
    description: blogOverviewContent[locale].metaDescription,
    alternates: getRouteAlternates("blog"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }, { locale: "en" }];
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const content = siteContent[locale];
  const overview = blogOverviewContent[locale];
  const articles = await getPublishedArticles(locale);
  const path = getLocalizedPath(locale, "blog");

  return (
    <>
      <JsonLd
        data={blogSchema({
          name: overview.title,
          description: overview.intro,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PageHeader title={overview.title} intro={overview.intro} />

        <section className="container-x pt-6 lg:pt-8">
          {articles.length > 0 ? (
            <ArticleList
              articles={articles}
              locale={locale}
              readLabel={overview.readLabel}
            />
          ) : (
            <div className="pt-6">
              <p className="reading text-[1.05rem] text-muted">{overview.emptyState}</p>
              <CtaLink
                href={getLocalizedPath("nl", "blog")}
                variant="text"
                hrefLang="nl"
                className="mt-4"
              >
                {overview.emptyStateLinkLabel}
              </CtaLink>
            </div>
          )}
        </section>
      </SiteShell>
    </>
  );
}
