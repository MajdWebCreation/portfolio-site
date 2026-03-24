import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditorialArticleCard from "@/components/editorial-article-card";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import {
  blogOverviewContent,
  getPublishedArticles,
} from "@/lib/content/blog";
import { getRouteAlternates } from "@/lib/content/routes";
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
    pathname: locale === "nl" ? "/nl/blog" : "/en/blog",
    title: blogOverviewContent[locale].metaTitle,
    description: blogOverviewContent[locale].metaDescription,
    alternates: getRouteAlternates("blog"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "en" }, { locale: "nl" }];
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
  const articles = getPublishedArticles(locale);
  const featuredArticle = articles[0] ?? null;
  const remainingArticles = articles.slice(1);
  const path = locale === "nl" ? "/nl/blog" : "/en/blog";
  const editorialImages = [
    "/images/visuals/blog-editorial-ui-01.png",
    "/images/visuals/blog-editorial-ui-02.png",
    "/images/visuals/blog-editorial-ui-03.png",
    "/images/visuals/blog-editorial-ui-04.png",
  ];

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
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-curve pointer-events-none absolute inset-x-[-6%] inset-y-0 opacity-[0.18]" />

          <div className="relative grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[32rem] lg:mx-0 lg:max-w-2xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                  {overview.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
                  {overview.title}
                </h1>
                <p className="mt-6 max-w-xl text-base leading-8 text-[color:var(--muted-foreground)]">
                  {overview.intro}
                </p>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="ym-surface-soft mx-auto max-w-[42rem] rounded-[2rem] p-6 text-center md:p-7 lg:mx-0 lg:text-left">
                <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                  {overview.pillarsTitle}
                </p>

                <div className="mt-6 space-y-5">
                  {overview.pillars.slice(0, 2).map((pillar) => (
                    <div key={pillar.title} className="border-b border-[color:var(--line)] pb-5 last:border-b-0 last:pb-0">
                      <p className="text-sm font-medium text-[var(--foreground)]">{pillar.title}</p>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[color:var(--muted-foreground)] lg:mx-0">
                        {pillar.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>

          {featuredArticle ? (
            <div className="relative mx-auto mt-14 max-w-[42rem] lg:max-w-none">
              <RevealSection>
                <EditorialArticleCard
                  article={featuredArticle}
                  locale={locale}
                  imageSrc={editorialImages[0]}
                  priority
                  variant="featured"
                />
              </RevealSection>
            </div>
          ) : null}

          {remainingArticles.length > 0 ? (
            <div className="relative mx-auto mt-6 max-w-[26rem] grid gap-5 sm:max-w-[42rem] md:max-w-none md:grid-cols-2">
              {remainingArticles.map((article, index) => (
                <RevealSection key={article.path} delay={index * 0.04}>
                  <EditorialArticleCard
                    article={article}
                    locale={locale}
                    imageSrc={
                      editorialImages[(index + 1) % editorialImages.length]
                    }
                    variant="default"
                  />
                </RevealSection>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="relative mx-auto mt-14 max-w-[26rem] grid gap-5 sm:max-w-[42rem] md:max-w-none md:grid-cols-2">
              {overview.pillars.slice(0, 4).map((pillar, index) => (
                <RevealSection key={pillar.title} delay={index * 0.04}>
                  <article className="ym-surface-soft rounded-[1.8rem] p-6">
                    <h2 className="text-2xl font-semibold text-[var(--foreground)]">
                      {pillar.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                      {pillar.description}
                    </p>
                  </article>
                </RevealSection>
              ))}
            </div>
          ) : null}

          <div className="mt-16 border-t border-[color:var(--line)] pt-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[34rem] lg:mx-0 lg:max-w-3xl lg:text-left">
                <h2 className="text-3xl font-semibold text-[var(--foreground)]">
                  {overview.supportTitle}
                </h2>
                <p className="mt-4 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {overview.supportText}
                </p>
                {articles.length === 0 && overview.emptyState ? (
                  <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                    {overview.emptyState}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-end">
                <Link
                  href={locale === "nl" ? "/nl/diensten" : "/en/services"}
                  data-track-event="primary_cta_click"
                  data-track-category="blog-overview"
                  data-track-label={locale === "nl" ? "Diensten" : "Services"}
                  data-track-location="blog-support-links"
                  className="text-sm text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                >
                  {locale === "nl" ? "Bekijk diensten" : "View services"}{" "}
                  <span className="text-[var(--accent-text)]">→</span>
                </Link>
                <Link
                  href={locale === "nl" ? "/nl/contact" : "/en/contact"}
                  data-track-event="contact_cta_click"
                  data-track-category="blog-overview"
                  data-track-label={locale === "nl" ? "Contact" : "Contact"}
                  data-track-location="blog-support-links"
                  className="text-sm text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                >
                  {locale === "nl" ? "Neem contact op" : "Contact us"}{" "}
                  <span className="text-[var(--accent-text)]">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
