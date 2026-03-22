import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditorialArticleCard from "@/components/editorial-article-card";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
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
  const path = locale === "nl" ? "/nl/blog" : "/en/blog";
  const editorialImages = [
    "/images/visuals/blog-editorial-curve-panel.png",
    "/images/visuals/blog-editorial-angular-panel.png",
    "/images/visuals/blog-editorial-diagonal-panel.png",
    "/images/visuals/blog-editorial-perspective-panel.png",
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
          <div className="absolute inset-0">
            <Image
              src="/images/visuals/ambient-texture-minimal-curve.png"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-14"
            />
          </div>
          <div className="relative grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-end">
            <RevealSection>
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {overview.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {overview.title}
                </h1>
                <p className="mt-6 text-base leading-8 text-white/64">
                  {overview.intro}
                </p>
              </div>
            </RevealSection>
            <RevealSection delay={0.08}>
              <div className="grid gap-4 sm:grid-cols-2">
                {overview.pillars.slice(0, 4).map((pillar) => (
                  <div
                    key={pillar.title}
                    className="border-b border-white/10 pb-5"
                  >
                    <p className="text-sm font-medium text-white">{pillar.title}</p>
                    <p className="mt-3 text-sm leading-7 text-white/62">
                      {pillar.description}
                    </p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>

          <div className="relative mt-14 grid gap-5 md:grid-cols-2">
            {articles.length > 0
              ? articles.map((article) => (
                  <RevealSection
                    key={article.path}
                    className={article.path === articles[0]?.path ? "md:col-span-2" : ""}
                  >
                    <EditorialArticleCard
                      article={article}
                      locale={locale}
                      imageSrc={
                        editorialImages[
                          articles.findIndex((entry) => entry.path === article.path) %
                            editorialImages.length
                        ]
                      }
                      priority={article.path === articles[0]?.path}
                      variant={
                        article.path === articles[0]?.path ? "featured" : "default"
                      }
                    />
                  </RevealSection>
                ))
              : overview.pillars.map((pillar, index) => (
                  <RevealSection key={pillar.title} delay={index * 0.04}>
                    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6">
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

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
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
            </div>
            <div className="space-y-4">
              <Link
                href={locale === "nl" ? "/nl/diensten" : "/en/services"}
                data-track-event="primary_cta_click"
                data-track-category="blog-overview"
                data-track-label={locale === "nl" ? "Diensten" : "Services"}
                data-track-location="blog-support-links"
                className="block border-b border-white/10 pb-4 text-sm leading-7 text-white/62 transition hover:text-white"
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
                className="block border-b border-white/10 pb-4 text-sm leading-7 text-white/62 transition hover:text-white"
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
                className="block border-b border-white/10 pb-4 text-sm leading-7 text-white/62 transition hover:text-white"
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
