import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
import SectionHeading from "@/components/section-heading";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import {
  blogOverviewContent,
  getBlogCategoryLabel,
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
  const path = locale === "nl" ? "/nl/blog" : "/en/blog";

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
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <RevealSection>
            <SectionHeading
              as="h1"
              eyebrow={overview.eyebrow}
              title={overview.title}
              description={overview.intro}
            />
          </RevealSection>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {articles.length > 0
              ? articles.map((article, index) => (
                  <RevealSection key={article.path} delay={index * 0.04}>
                    <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-6 transition hover:border-cyan-300/25 hover:bg-white/[0.05]">
                      <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-cyan-300/72">
                        <span>{getBlogCategoryLabel(locale, article.category)}</span>
                        <span className="text-white/28">/</span>
                        <span>{article.readingTime}</span>
                      </div>
                      <h2 className="mt-4 text-2xl font-semibold text-white">
                        {article.title}
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-white/65">
                        {article.metaDescription}
                      </p>
                      <Link
                        href={article.path}
                        data-track-event="article_cta_click"
                        data-track-category="blog-overview"
                        data-track-label={article.title}
                        data-track-location="article-card"
                        className="mt-6 inline-flex rounded-full border border-white/15 bg-black/35 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/40 hover:bg-black/45"
                      >
                        {locale === "nl" ? "Lees artikel" : "Read article"}
                      </Link>
                    </article>
                  </RevealSection>
                ))
              : overview.pillars.map((pillar, index) => (
                  <RevealSection key={pillar.title} delay={index * 0.04}>
                    <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-6">
                      <h2 className="text-2xl font-semibold text-white">
                        {pillar.title}
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-white/65">
                        {pillar.description}
                      </p>
                    </article>
                  </RevealSection>
                ))}
          </div>

          <div className="mt-12 rounded-[2rem] border border-white/10 bg-black/35 p-6 md:p-8">
            <h2 className="text-3xl font-semibold text-white">
              {overview.supportTitle}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/65">
              {overview.supportText}
            </p>
            {articles.length === 0 && overview.emptyState ? (
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/52">
                {overview.emptyState}
              </p>
            ) : null}
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <Link
                href={locale === "nl" ? "/nl/diensten" : "/en/services"}
                data-track-event="primary_cta_click"
                data-track-category="blog-overview"
                data-track-label={locale === "nl" ? "Diensten" : "Services"}
                data-track-location="blog-support-links"
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/62 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
              >
                {locale === "nl"
                  ? "Bekijk de diensten waar deze inzichten direct op aansluiten."
                  : "Explore the services these insights directly support."}
              </Link>
              <Link
                href={locale === "nl" ? "/nl/projecten" : "/en/projects"}
                data-track-event="primary_cta_click"
                data-track-category="blog-overview"
                data-track-label={locale === "nl" ? "Projecten" : "Projects"}
                data-track-location="blog-support-links"
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/62 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
              >
                {locale === "nl"
                  ? "Bekijk het projectenoverzicht voor de bredere werkcontext."
                  : "See the projects overview for broader work context."}
              </Link>
              <Link
                href={locale === "nl" ? "/nl/contact" : "/en/contact"}
                data-track-event="contact_cta_click"
                data-track-category="blog-overview"
                data-track-label={locale === "nl" ? "Contact" : "Contact"}
                data-track-location="blog-support-links"
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/62 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
              >
                {locale === "nl"
                  ? "Neem contact op als je een website of webapplicatie wilt bespreken."
                  : "Get in touch if you want to discuss a website or web application."}
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <SeoCta
            title={
              locale === "nl"
                ? "Van inzicht naar uitvoering"
                : "From insight to execution"
            }
            text={
              locale === "nl"
                ? "Als je al weet waar de knelpunten zitten, kunnen we ze vertalen naar een scherpere site, shop, applicatie of technische structuur."
                : "If you already know where the friction lives, we can translate that into a sharper site, storefront, application, or technical structure."
            }
            primaryLabel={locale === "nl" ? "Bekijk diensten" : "View services"}
            primaryHref={locale === "nl" ? "/nl/diensten" : "/en/services"}
            secondaryLabel={locale === "nl" ? "Neem contact op" : "Contact us"}
            secondaryHref={locale === "nl" ? "/nl/contact" : "/en/contact"}
            trackingContext="article"
          />
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
