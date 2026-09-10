import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import ProcessCta from "@/components/process-cta";
import ProcessHeroSketch from "@/components/process-hero-sketch";
import ProcessScale from "@/components/process-scale";
import ProcessTimeline from "@/components/process-timeline";
import SiteShell from "@/components/site-shell";
import { processPageContent } from "@/lib/content/process";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "en") {
    return {};
  }

  return buildMetadata({
    locale: "en",
    pathname: getLocalizedPath("en", "process"),
    title: processPageContent.en.metaTitle,
    description: processPageContent.en.metaDescription,
    alternates: getRouteAlternates("process"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "en" }];
}

export default async function HowWeWorkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "en" || !isValidLocale(locale)) {
    notFound();
  }

  return <ProcessPageContent locale={locale} />;
}

export function ProcessPageContent({ locale }: { locale: Locale }) {
  const content = siteContent[locale];
  const page = processPageContent[locale];
  const path = getLocalizedPath(locale, "process");

  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: page.metaTitle,
          description: page.metaDescription,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PageHeader
          label={page.label}
          title={page.title}
          intro={page.intro}
          visual={<ProcessHeroSketch />}
        />

        {/* The four phases as one process on a single rail. */}
        <section className="pt-12 lg:pt-16" aria-labelledby="process-phases">
          <ProcessTimeline
            headingId="process-phases"
            label={page.phasesLabel}
            phases={page.phases}
            resultLabel={page.resultLabel}
          />
        </section>

        {/* Same outline at a different size, and what helps at the start. */}
        <section className="mt-14 bg-paper-deep lg:mt-20" aria-labelledby="process-scale">
          <div className="container-x grid gap-12 py-14 lg:grid-cols-12 lg:gap-8 lg:py-20">
            <div className="lg:col-span-6">
              <ProcessScale
                headingId="process-scale"
                title={page.scale.title}
                text={page.scale.text}
                phaseLabels={page.scale.phaseLabels}
                phaseNumbers={page.phases.map((phase) => phase.number)}
                rows={page.scale.rows}
                note={page.scale.note}
              />
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              <h2 className="display-sm">{page.needs.title}</h2>
              <p className="mt-3 max-w-[28rem] text-[1rem] leading-relaxed text-muted">
                {page.needs.text}
              </p>
              <ul className="mt-5 max-w-[28rem] space-y-2 text-[1rem] leading-snug text-body">
                {page.needs.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-ink" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 max-w-[28rem] text-[1rem] leading-relaxed text-muted">
                {page.needs.closing}
              </p>
            </div>
          </div>
        </section>

        <section className="pb-4 pt-14 lg:pt-20" aria-labelledby="process-cta">
          <ProcessCta
            headingId="process-cta"
            label={page.cta.label}
            title={page.cta.title}
            text={page.cta.text}
            primaryLabel={page.cta.primary}
            primaryHref={getLocalizedPath(locale, "contact")}
            secondaryLabel={page.cta.secondary}
            secondaryHref={getLocalizedPath(locale, "pricing")}
          />
        </section>
      </SiteShell>
    </>
  );
}
