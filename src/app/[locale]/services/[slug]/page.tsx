import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CtaLink from "@/components/cta-link";
import FaqList from "@/components/faq-list";
import JsonLd from "@/components/json-ld";
import NextStep from "@/components/next-step";
import PageHeader from "@/components/page-header";
import ProcessSteps from "@/components/process-steps";
import ProjectRow from "@/components/project-row";
import SiteShell from "@/components/site-shell";
import { getProjectById, type Project } from "@/lib/content/projects";
import { getLocalizedPath } from "@/lib/content/routes";
import {
  getServiceAlternates,
  getServiceBySlug,
  getServicesForLocale,
  serviceDefinitions,
  serviceKeys,
  type LocalizedService,
  type ServicePart,
} from "@/lib/content/services";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { serviceSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";

export async function generateStaticParams() {
  return serviceKeys.map((key) => ({
    locale: "en",
    slug: serviceDefinitions[key].locale.en.slug,
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

  const service = getServiceBySlug(locale, slug);

  if (!service) {
    return {};
  }

  return buildMetadata({
    locale,
    pathname: service.path,
    title: service.metaTitle,
    description: service.metaDescription,
    alternates: getServiceAlternates(service.key),
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  if (!isValidLocale(locale) || locale !== "en") {
    notFound();
  }

  return <ServiceDetailContent locale={locale} slug={slug} />;
}

const labels = {
  nl: {
    services: "Diensten",
    proof: "Uit de praktijk",
    visit: "Bekijk live",
    built: "Gebouwd",
    related: "Andere diensten",
    allProjects: "Alle projecten",
    contact: "Neem contact op",
    planner: "Gebruik de projectplanner",
    pricing: "Bekijk tarieven",
  },
  en: {
    services: "Services",
    proof: "From practice",
    visit: "View live",
    built: "Built",
    related: "Other services",
    allProjects: "All projects",
    contact: "Get in touch",
    planner: "Use the project planner",
    pricing: "View pricing",
  },
} as const;

/* A short list with an accent dash in front of each item. */
function DashList({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[0.98rem] leading-snug text-body">
          <span aria-hidden="true" className="mt-[0.65em] h-px w-3 shrink-0 bg-accent" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* What is not automatically included: a tinted panel. */
function ScopePanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-sm bg-paper-deep p-6 sm:p-7">
      <h2 className="label-mono text-ink">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[0.95rem] leading-snug text-body">
            <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-line-strong" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Layers of a product, stacked along a rail. */
function PartsLayers({ parts }: { parts: ServicePart[] }) {
  return (
    <dl className="grid gap-x-10 border-t border-line md:grid-cols-2">
      {parts.map((part) => (
        <div
          key={part.label}
          className="grid grid-cols-[1.25rem_1fr] gap-x-3 border-b border-line py-4"
        >
          <span aria-hidden="true" className="relative top-[0.55em] block h-[8px] w-[8px] rounded-full bg-accent" />
          <dt className="text-[1.05rem] font-semibold leading-snug text-ink">{part.label}</dt>
          <dd className="col-start-2 mt-1 text-[0.95rem] leading-relaxed text-muted">
            {part.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* Steps a customer takes, left to right, joined by a hairline. */
function PartsFlow({ parts }: { parts: ServicePart[] }) {
  return (
    <ol className="grid gap-y-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-6">
      {parts.map((part, index) => (
        <li key={part.label} className="relative pt-4">
          <span aria-hidden="true" className="absolute left-0 top-0 h-px w-full bg-line-strong" />
          <span
            aria-hidden="true"
            className={`absolute top-[-4px] block h-[9px] w-[9px] rounded-full ${
              index === parts.length - 1 ? "bg-ink" : "bg-accent"
            }`}
          />
          <h3 className="text-[1.05rem] font-semibold leading-snug text-ink">{part.label}</h3>
          <p className="mt-1.5 text-[0.93rem] leading-relaxed text-muted">{part.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function ServiceDetailContent({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const service = getServiceBySlug(locale, slug);

  if (!service) {
    notFound();
  }

  const content = siteContent[locale];
  const text = labels[locale];
  const siblingServices = getServicesForLocale(locale).filter(
    (item) => item.key !== service.key,
  );
  const proofProjects = service.proof
    .map((id) => getProjectById(id))
    .filter((project): project is Project => Boolean(project));
  const supportsPlanner =
    service.kind === "package" || service.key === "web-app-development";

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: service.metaTitle,
            description: service.metaDescription,
            url: getCanonicalUrl(service.path),
          }),
          serviceSchema({
            name: service.navLabel,
            description: service.metaDescription,
            url: getCanonicalUrl(service.path),
          }),
        ]}
      />
      <SiteShell locale={locale} content={content} currentPath={service.path}>
        <PageHeader
          label={`${text.services} · ${service.familyTitle}`}
          title={service.title}
          intro={service.intro}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <CtaLink
              href={service.contactPath}
              data-track-event="contact_cta_click"
              data-track-category="service-detail"
              data-track-label={text.contact}
              data-track-location="service-header"
            >
              {text.contact}
            </CtaLink>
            {service.kind === "package" ? (
              <CtaLink
                href={getLocalizedPath(locale, "pricing")}
                variant="text"
                data-track-event="primary_cta_click"
                data-track-category="service-detail"
                data-track-label={text.pricing}
                data-track-location="service-header"
              >
                {text.pricing}
              </CtaLink>
            ) : service.priceNote ? (
              <p className="flex max-w-sm items-start gap-2.5 text-[0.9rem] leading-snug text-muted">
                <span aria-hidden="true" className="mt-[0.5em] block h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
                {service.priceNote}
              </p>
            ) : null}
          </div>
        </PageHeader>

        {/* When it fits, and what we build or change. */}
        <section className="container-x pt-12 lg:pt-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-5">
              <h2 className="display-sm">{service.fitTitle}</h2>
              <DashList items={service.fit} className="mt-5" />
            </div>
            <div className="lg:col-span-6 lg:col-start-7">
              <h2 className="display-sm">{service.buildTitle}</h2>
              <DashList items={service.build} className="mt-5" />
            </div>
          </div>
        </section>

        {/* Parts and scope, laid out by the kind of service. */}
        <ServiceParts service={service} />

        {/* Proof: a live project that shows this kind of work. */}
        {proofProjects.length > 0 ? (
          <section className="container-x mt-16 lg:mt-24">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-line pt-8">
              <h2 className="display-sm">{text.proof}</h2>
              <CtaLink
                href={getLocalizedPath(locale, "projects")}
                variant="text"
                data-track-event="primary_cta_click"
                data-track-category="service-detail"
                data-track-label="projects"
                data-track-location="service-proof"
              >
                {text.allProjects}
              </CtaLink>
            </div>
            <div className="mt-2 border-b border-line">
              {proofProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  locale={locale}
                  visitLabel={text.visit}
                  builtLabel={text.built}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* How the project runs, specific to this service. */}
        <section className="container-x mt-16 lg:mt-24">
          <div className="border-t border-line pt-8">
            <h2 className="display-sm">{service.approachTitle}</h2>
            <div className="mt-8">
              <ProcessSteps steps={service.approach} />
            </div>
          </div>
        </section>

        {/* FAQ. */}
        <section className="container-x mt-16 lg:mt-24">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <h2 className="display-sm lg:col-span-4">{service.faqTitle}</h2>
            <div className="lg:col-span-7 lg:col-start-6">
              <FaqList items={service.faqs} />
            </div>
          </div>
        </section>

        {/* Closing step. */}
        <div className="mt-20 lg:mt-28">
          <NextStep
            title={service.ctaTitle}
            text={service.ctaText}
            primaryLabel={text.contact}
            primaryHref={service.contactPath}
            secondaryLabel={supportsPlanner ? text.planner : undefined}
            secondaryHref={
              supportsPlanner ? getLocalizedPath(locale, "projectPlanner") : undefined
            }
            trackingContext="service"
          />
        </div>

        {/* Related services, as plain links. */}
        <nav aria-label={text.related} className="container-x mt-16 lg:mt-20">
          <p className="label-mono">{text.related}</p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {siblingServices.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  data-track-event="service_cta_click"
                  data-track-category="service-detail"
                  data-track-label={item.navLabel}
                  data-track-location="related-services"
                  className="link-static text-[0.98rem] text-ink"
                >
                  {item.navLabel}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={service.overviewPath}
                className="link-static text-[0.98rem] text-muted"
                data-track-event="service_cta_click"
                data-track-category="service-detail"
                data-track-label="services-overview"
                data-track-location="related-services"
              >
                {text.services} →
              </Link>
            </li>
          </ul>
        </nav>
      </SiteShell>
    </>
  );
}

/**
 * Package: what is included next to what depends on scope.
 * Custom: the parts of the product as layers or as a flow, then scope.
 * Improve: no parts list; only what depends on scope.
 */
function ServiceParts({ service }: { service: LocalizedService }) {
  if (service.kind === "custom" && service.parts && service.partsTitle) {
    return (
      <section className="container-x mt-16 lg:mt-24">
        <div className="border-t border-line pt-8">
          <h2 className="display-sm">{service.partsTitle}</h2>
          <div className="mt-8">
            {service.partsLayout === "flow" ? (
              <PartsFlow parts={service.parts} />
            ) : (
              <PartsLayers parts={service.parts} />
            )}
          </div>
        </div>
        <div className="mt-8 rounded-sm bg-paper-deep p-6 sm:p-8">
          <h2 className="label-mono text-ink">{service.scopeTitle}</h2>
          <ul className="mt-4 grid gap-x-10 gap-y-2.5 md:grid-cols-2">
            {service.scope.map((item) => (
              <li key={item} className="flex gap-3 text-[0.95rem] leading-snug text-body">
                <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-line-strong" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  if (service.kind === "package" && service.parts && service.partsTitle) {
    return (
      <section className="container-x mt-16 lg:mt-24">
        <div className="grid gap-10 border-t border-line pt-8 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <h2 className="display-sm">{service.partsTitle}</h2>
            <DashList items={service.parts.map((part) => part.label)} className="mt-5" />
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <ScopePanel title={service.scopeTitle} items={service.scope} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container-x mt-16 lg:mt-24">
      <div className="grid gap-6 border-t border-line pt-8 lg:grid-cols-12 lg:gap-8">
        <h2 className="display-sm lg:col-span-4">{service.scopeTitle}</h2>
        <div className="lg:col-span-7 lg:col-start-6">
          <DashList items={service.scope} />
        </div>
      </div>
    </section>
  );
}
