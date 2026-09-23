import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/breadcrumbs";
import CtaLink from "@/components/cta-link";
import JsonLd from "@/components/json-ld";
import NextStep from "@/components/next-step";
import PageHeader from "@/components/page-header";
import ProseSections from "@/components/prose-sections";
import SiteShell from "@/components/site-shell";
import { getCaseBreadcrumbs } from "@/lib/content/breadcrumbs";
import {
  getCaseStudyBySlug,
  getCaseStudyPath,
  getPublishedCaseStudyPaths,
} from "@/lib/content/cases";
import { getProjectById, type ProjectId } from "@/lib/content/projects";
import { getLocalizedPath } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { breadcrumbListSchema, creativeWorkSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent } from "@/lib/content/site-content";

/*
  Only the cases that are actually written get a path, and nothing else is
  rendered on demand: an unknown slug, or a locale that has no case, is a real
  404 rather than an empty page.
*/
export const dynamicParams = false;

export async function generateStaticParams() {
  return getPublishedCaseStudyPaths("nl").map((slug) => ({
    locale: "nl",
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isValidLocale(locale) || locale !== "nl") {
    return {};
  }

  const caseStudy = getCaseStudyBySlug(locale, slug);

  if (!caseStudy) {
    return {
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  /*
    No alternates: the case exists in Dutch only, so there is no counterpart
    to point an hreflang at. The cover screenshot doubles as the share image,
    the way an article's cover does -- a case is the page most likely to be
    passed on as a link.
  */
  const cover = caseStudy.screenshots[0];

  return buildMetadata({
    locale,
    pathname: getCaseStudyPath(locale, caseStudy.slug),
    title: caseStudy.title,
    description: caseStudy.description,
    ...(cover ? { image: getCanonicalUrl(cover.src) } : {}),
  });
}

export default async function DutchProjectCasePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  if (!isValidLocale(locale) || locale !== "nl") {
    notFound();
  }

  const caseStudy = getCaseStudyBySlug(locale, slug);

  if (!caseStudy) {
    notFound();
  }

  const content = siteContent[locale];
  const project = getProjectById(caseStudy.projectId as ProjectId);
  const path = getCaseStudyPath(locale, caseStudy.slug);
  const pageUrl = getCanonicalUrl(path);
  const projectsPath = getLocalizedPath(locale, "projects");
  const relatedService: string | undefined = caseStudy.relatedServices[0];
  const [cover, ...furtherScreenshots] = caseStudy.screenshots;
  /*
    The crumb for the case itself is the project it is about: short enough to
    sit on one line on a phone, where the case title is a sentence.
  */
  const crumbs = getCaseBreadcrumbs(locale, {
    name: project?.name ?? caseStudy.title,
    path,
  });

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            locale,
            name: caseStudy.title,
            description: caseStudy.description,
            url: pageUrl,
            hasBreadcrumb: true,
          }),
          creativeWorkSchema({
            locale,
            name: caseStudy.title,
            description: caseStudy.description,
            url: pageUrl,
            ...(cover ? { image: getCanonicalUrl(cover.src) } : {}),
          }),
          breadcrumbListSchema({
            url: pageUrl,
            items: crumbs.map((crumb) => ({
              name: crumb.name,
              url: getCanonicalUrl(crumb.path),
            })),
          }),
        ]}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PageHeader
          breadcrumb={<Breadcrumbs locale={locale} items={crumbs} />}
          label={project?.sector[locale]}
          title={caseStudy.title}
          intro={caseStudy.intro}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {project ? (
              <CtaLink
                href={project.url}
                variant="text"
                external
                data-track-link-context="project_live"
              >
                {project.domain}
              </CtaLink>
            ) : null}
            <Link
              href={projectsPath}
              className="link-static text-[0.95rem] text-muted"
              data-track-event="cta_click"
              data-track-cta-id="case_header_projects"
              data-track-cta-target="projects"
              data-track-placement="case_header"
            >
              Alle projecten
            </Link>
          </div>
        </PageHeader>

        {/* The cover: the screenshot the case is about. */}
        {cover ? (
          <section className="container-x pt-10 lg:pt-14">
            <figure>
              <Image
                src={cover.src}
                alt={cover.alt}
                width={cover.width ?? 2000}
                height={cover.height ?? 1250}
                sizes="(min-width: 1024px) 72rem, 100vw"
                priority
                className="h-auto w-full rounded-sm border border-line bg-surface"
              />
              {cover.caption ? (
                <figcaption className="label-mono mt-3 normal-case tracking-normal">
                  {cover.caption}
                </figcaption>
              ) : null}
            </figure>
          </section>
        ) : null}

        <section className="container-x pt-12 lg:pt-16">
          <div className="grid lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-8">
              <ProseSections sections={caseStudy.sections} />
            </div>
          </div>
        </section>

        {/* Any further screenshots, after the text that explains them. */}
        {furtherScreenshots.length > 0 ? (
          <section className="container-x mt-14 lg:mt-20">
            <div className="grid gap-10">
              {furtherScreenshots.map((shot) => (
                <figure key={shot.src}>
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    width={shot.width ?? 2000}
                    height={shot.height ?? 1250}
                    sizes="(min-width: 1024px) 72rem, 100vw"
                    className="h-auto w-full rounded-sm border border-line bg-surface"
                  />
                  {shot.caption ? (
                    <figcaption className="label-mono mt-3 normal-case tracking-normal">
                      {shot.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-20 lg:mt-28">
          <NextStep
            title={caseStudy.cta.title}
            text={caseStudy.cta.text}
            primaryLabel="Neem contact op"
            primaryHref={getLocalizedPath(locale, "contact")}
            secondaryLabel={relatedService ? caseStudy.cta.serviceLabel : undefined}
            secondaryHref={relatedService}
            trackingContext="projects"
          />
        </div>
      </SiteShell>
    </>
  );
}
