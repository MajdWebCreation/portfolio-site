import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CtaLink from "@/components/cta-link";
import FaqList from "@/components/faq-list";
import JsonLd from "@/components/json-ld";
import SiteFooter from "@/components/site-footer";
import WebsitecheckForm from "@/components/websitecheck/websitecheck-form";
import WebsitecheckHeader from "@/components/websitecheck/websitecheck-header";
import { getFeaturedProjects } from "@/lib/content/projects";
import { campaignRoutes, getLocalizedPath } from "@/lib/content/routes";
import { siteContent } from "@/lib/content/site-content";
import { websitecheckContent, websitecheckPromotion } from "@/lib/content/websitecheck";
import { getPricingCatalog } from "@/lib/pricing/source";
import { organizationSchema, webPageSchema } from "@/lib/schema";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";

/*
  The landing page of the websitecheck campaign. Dutch only, one goal: the
  form in the first screen. The page is built to be arrived at from an ad,
  so it carries a reduced header and its own composition, not the site's.

  The campaign line on development costs comes from the same stored setting
  the pricing page reads; the page is static and is revalidated when the
  admin saves that setting (lib/admin/pricing/actions.ts).
*/

const content = websitecheckContent;
const path = campaignRoutes.websitecheck;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "nl") {
    return {};
  }

  return buildMetadata({
    locale: "nl",
    pathname: path,
    title: content.meta.title,
    description: content.meta.description,
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function WebsitecheckPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "nl") {
    notFound();
  }

  const promotion = websitecheckPromotion(await getPricingCatalog());
  const projects = getFeaturedProjects();
  const privacyHref = getLocalizedPath("nl", "privacy");

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            locale: "nl",
            name: content.meta.title,
            description: content.meta.description,
            url: getCanonicalUrl(path),
          }),
          organizationSchema(),
        ]}
      />

      <div className="flex min-h-screen flex-col bg-paper text-body">
        <WebsitecheckHeader />

        <main id="main" className="flex-1">
          {/* First screen: the question, the offer, the form. On a phone the trust line sits between the two; on desktop the form takes the right column beside all of the text. */}
          <section className="border-b border-line bg-paper-deep" aria-labelledby="websitecheck-heading">
            <div className="container-x grid gap-6 pb-12 pt-5 sm:pt-10 lg:grid-cols-12 lg:grid-rows-[auto_auto_1fr] lg:gap-x-8 lg:gap-y-8 lg:pb-20 lg:pt-14">
              <div className="lg:col-span-6 lg:row-start-1">
                <p className="label-mono rise mb-3 sm:mb-4">{content.hero.label}</p>
                <h1 id="websitecheck-heading" className="display-lg rise max-w-[18ch]">
                  {content.hero.title}
                </h1>
                <p className="lede rise rise-delay-1 mt-4 max-w-[34rem] sm:mt-5">{content.hero.intro}</p>
              </div>

              <ul
                className="rise rise-delay-1 flex flex-wrap gap-x-6 gap-y-2 text-[0.95rem] text-ink lg:col-span-6 lg:row-start-2"
                aria-label="Voorwaarden van de websitecheck"
              >
                {content.hero.trust.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="block h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="rise rise-delay-2 mt-2 lg:col-span-5 lg:col-start-8 lg:row-span-3 lg:row-start-1 lg:mt-0">
                <WebsitecheckForm copy={content.form} privacyHref={privacyHref} />
              </div>

              {promotion ? (
                <p className="rise rise-delay-2 mt-2 max-w-[34rem] border-t border-line-strong pt-4 text-[0.95rem] leading-relaxed lg:col-span-6 lg:row-start-3 lg:mt-0 lg:self-start">
                  <span className="font-medium text-ink">{promotion.note}.</span>{" "}
                  <span className="text-muted">{promotion.scope}</span>
                </p>
              ) : null}
            </div>
          </section>

          {/* What is looked at: six points, in plain words. */}
          <section className="container-x pt-14 lg:pt-24" aria-labelledby="scope-heading">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-4">
                <p className="label-mono">{content.scope.label}</p>
                <h2 id="scope-heading" className="display-md mt-3 max-w-[16ch]">
                  {content.scope.title}
                </h2>
                <p className="mt-4 max-w-md text-[1rem] leading-relaxed text-muted">{content.scope.intro}</p>
              </div>
              <dl className="grid gap-x-8 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
                {content.scope.points.map((point) => (
                  <div key={point.title} className="border-t border-line py-5">
                    <dt className="text-[1.05rem] font-medium text-ink">{point.title}</dt>
                    <dd className="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{point.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* How it goes and what arrives: the only numbered system on the page. */}
          <section className="mt-14 bg-ink text-paper lg:mt-24" aria-labelledby="how-heading">
            <div className="container-x grid gap-10 py-14 lg:grid-cols-12 lg:gap-8 lg:py-20">
              <div className="lg:col-span-4">
                <p className="label-mono text-paper/55">{content.how.label}</p>
                <h2 id="how-heading" className="display-md mt-3 max-w-[14ch] text-paper">
                  {content.how.title}
                </h2>
                <p className="mt-5 max-w-sm text-[1rem] leading-relaxed text-paper/72">{content.how.note}</p>
              </div>
              <ol className="divide-y divide-paper/15 border-y border-paper/15 lg:col-span-7 lg:col-start-6">
                {content.how.steps.map((step, index) => (
                  <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-4 py-6 sm:grid-cols-[3.5rem_1fr]">
                    <span className="label-mono pt-1.5 text-accent-soft">0{index + 1}</span>
                    <div>
                      <h3 className="text-[1.15rem] font-medium leading-snug text-paper">{step.title}</h3>
                      <p className="mt-2 max-w-[48ch] text-[0.98rem] leading-relaxed text-paper/72">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Who looks: the studio, with the sites that prove it. */}
          <section className="container-x pt-14 lg:pt-24" aria-labelledby="who-heading">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-4">
                <p className="label-mono">{content.who.label}</p>
                <h2 id="who-heading" className="display-md mt-3 max-w-[14ch]">
                  {content.who.title}
                </h2>
              </div>
              <div className="lg:col-span-7 lg:col-start-6">
                <p className="max-w-[60ch] text-[1.05rem] leading-relaxed text-body">{content.who.text}</p>
                <ul className="mt-6 border-t border-line">
                  {projects.map((project) => (
                    <li
                      key={project.id}
                      className="grid gap-x-6 gap-y-1 border-b border-line py-3.5 sm:grid-cols-[1fr_auto] sm:items-baseline"
                    >
                      <span>
                        <span className="font-medium text-ink">{project.name}</span>
                        <span className="block text-[0.9rem] text-muted">{project.sector.nl}</span>
                      </span>
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${project.name}, ${content.who.visitLabel}`}
                        data-track-link-context="project_live"
                        className="link-static tabular text-[0.95rem] text-ink"
                      >
                        {project.domain}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <CtaLink href={getLocalizedPath("nl", "projects")} variant="text" className="mt-5">
                  {content.who.projectsLabel}
                </CtaLink>
              </div>
            </div>
          </section>

          {/* The questions that keep someone from asking. */}
          <section className="container-x pt-14 lg:pt-24" aria-labelledby="faq-heading">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-4">
                <p className="label-mono">{content.faq.label}</p>
                <h2 id="faq-heading" className="display-md mt-3">
                  {content.faq.title}
                </h2>
              </div>
              <div className="lg:col-span-7 lg:col-start-6">
                <FaqList items={[...content.faq.items]} />
              </div>
            </div>
          </section>

          {/* Back to the form. */}
          <section className="container-x pt-14 lg:pt-24" aria-labelledby="closing-heading">
            <div className="grid gap-6 border-t-2 border-ink pt-8 lg:grid-cols-12 lg:items-end lg:gap-8 lg:pt-10">
              <h2 id="closing-heading" className="display-lg max-w-[16ch] lg:col-span-7">
                {content.closing.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:col-span-5 lg:justify-end">
                <CtaLink href="#websitecheck-form">{content.closing.ctaLabel}</CtaLink>
                <span className="text-[0.9rem] text-muted">{content.closing.note}</span>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter locale="nl" content={siteContent.nl} currentPath={path} />
      </div>
    </>
  );
}
