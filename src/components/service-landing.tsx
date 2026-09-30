import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import ArticleRichText from "@/components/article-rich-text";
import ContactBlock from "@/components/contact-block";
import CtaLink from "@/components/cta-link";
import FaqList from "@/components/faq-list";
import GoogleReviews from "@/components/google-reviews";
import RevealScope from "@/components/reveal-scope";
import type { Project } from "@/lib/content/projects";
import { getLocalizedPath } from "@/lib/content/routes";
import type { LocalizedService } from "@/lib/content/services";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";

/**
 * The page of a service that takes the enquiry itself, as a landing page.
 *
 * Same content as the regular service page, in a different order and at a
 * different scale: the offer and the way to contact on an ink band with live
 * work next to it, then reviews, what is built, the projects, what is
 * included, the trajectory, the explanation in running text, questions, and
 * the form. Every image is a capture of a live site built here.
 *
 * Motion is limited to three things: the hero settles in, the page capture in
 * the hero moves slowly, and sections rise once as they scroll into view.
 */

export type ServiceLandingLabels = {
  proof: string;
  visit: string;
  built: string;
  allProjects: string;
  readCase: string;
  contact: string;
  pricing: string;
  directLead: string;
  call: string;
  or: string;
  whatsappLabel: string;
  liveWork: string;
};

/**
 * The header's prices, as the page built them from the catalog: one row per
 * project type shown (the smallest first), each with its page range, and the
 * monthly technical management every delivered product runs under.
 */
export type PriceSummary = {
  rows: { name: string; scope: string | null; price: string }[];
  management: string;
};

type ServiceLandingProps = {
  locale: Locale;
  service: LocalizedService;
  content: SiteContent;
  text: ServiceLandingLabels;
  breadcrumb: ReactNode;
  priceSummary: PriceSummary | null;
  proofProjects: (Project & { casePath: string | null })[];
  whatsappHref: string;
  showReviews: boolean;
};

function delay(ms: number): CSSProperties {
  return { "--reveal-delay": `${ms}ms` } as CSSProperties;
}

/* The title in two tones: the opening words bright, the rest a step back. */
function HeroTitle({ title, lead }: { title: string; lead?: string }) {
  if (!lead || !title.startsWith(lead)) {
    return <>{title}</>;
  }

  return (
    <>
      {lead}
      <span className="text-paper/55">{title.slice(lead.length)}</span>
    </>
  );
}

/**
 * Live work next to the offer: a page capture in a plain frame that moves
 * slowly from the top of the page down, and a second site on a phone.
 */
function HeroStage({
  locale,
  page,
  phone,
  caption,
}: {
  locale: Locale;
  page: Project | undefined;
  phone: Project | undefined;
  caption: string;
}) {
  if (!page?.pageImage) return null;
  const shown = [page, phone].filter(
    (project, index, all): project is Project =>
      Boolean(project) && all.findIndex((item) => item?.id === project?.id) === index,
  );

  return (
    <figure className="sl-stage rise rise-delay-2">
      <div className="relative pb-[9%] pl-[9%] sm:pl-[11%]">
        <div className="sl-frame">
          <div className="sl-frame-bar">
            <span aria-hidden="true" className="sl-live-dot" />
            <span className="truncate">{page.domain}</span>
          </div>
          <div className="sl-frame-view">
            <Image
              src={page.pageImage.src}
              alt={page.pageImage.alt[locale]}
              width={page.pageImage.width}
              height={page.pageImage.height}
              sizes="(min-width: 1024px) 46vw, 92vw"
              priority
              className="sl-pan h-auto w-full"
            />
          </div>
        </div>

        {phone?.mobileImage ? (
          <div className="sl-phone">
            <Image
              src={phone.mobileImage.src}
              alt={phone.mobileImage.alt[locale]}
              width={phone.mobileImage.width}
              height={phone.mobileImage.height}
              sizes="(min-width: 1024px) 13vw, 28vw"
              className="h-auto w-full"
            />
          </div>
        ) : null}
      </div>

      <figcaption className="label-mono mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[9%] text-paper/50 sm:pl-[11%]">
        <span>{caption}</span>
        {shown.map((project) => (
          <a
            key={project.id}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            data-track-link-context="project_live"
            className="text-paper/80 underline decoration-paper/30 underline-offset-4 transition-colors hover:text-paper hover:decoration-paper"
          >
            {project.domain}
          </a>
        ))}
      </figcaption>
    </figure>
  );
}

function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-[0.3em] h-4 w-4 shrink-0 text-accent-soft"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

export default function ServiceLanding({
  locale,
  service,
  content,
  text,
  breadcrumb,
  priceSummary,
  proofProjects,
  whatsappHref,
  showReviews,
}: ServiceLandingProps) {
  const pageProject = proofProjects.find((project) => project.pageImage);
  const phoneProject =
    proofProjects.find((project) => project.mobileImage && project.id !== pageProject?.id) ??
    proofProjects.find((project) => project.mobileImage);
  const hasStage = Boolean(pageProject);

  return (
    <>
      <RevealScope />

      {/* Offer and the way to contact, with live work next to it. */}
      <section className="sl-hero relative overflow-hidden bg-ink text-paper">
        <div aria-hidden="true" className="sl-grid" />
        <div className="container-x relative pb-16 pt-10 sm:pt-12 lg:pb-24 lg:pt-16">
          <div className="sl-crumbs rise">{breadcrumb}</div>

          <div className="mt-8 grid gap-14 lg:mt-10 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className={hasStage ? "lg:col-span-6" : "lg:col-span-9"}>
              <h1 className="sl-title rise text-paper">
                <HeroTitle title={service.title} lead={service.titleLead} />
              </h1>
              <p className="rise rise-delay-1 mt-6 max-w-[34rem] text-[clamp(1.08rem,1rem+0.4vw,1.25rem)] leading-relaxed text-paper/70">
                {service.intro}
              </p>

              {priceSummary ? (
                <div className="rise rise-delay-1 mt-7 flex items-start gap-3">
                  <span aria-hidden="true" className="mt-[0.7rem] block h-px w-8 shrink-0 bg-accent-soft" />
                  <div className="max-w-[34rem] flex-1">
                    <dl>
                      {priceSummary.rows.map((row) => (
                        <div key={row.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1 text-paper">
                          <dt className="text-[1.02rem] font-medium">
                            {row.name}
                            {row.scope ? <span className="ml-2 text-[0.85rem] font-normal text-paper/60">{row.scope}</span> : null}
                          </dt>
                          <dd className="text-[1.02rem] font-medium">{row.price}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="pt-1.5 text-[0.9rem] text-paper/60">{priceSummary.management}</p>
                  </div>
                </div>
              ) : null}

              <div className="rise rise-delay-2 mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
                <CtaLink
                  href="#contact"
                  variant="inverse"
                  className="sl-cta"
                  data-track-event="service_cta_click"
                  data-track-service-id={service.key}
                  data-track-cta-id="service_header_contact"
                  data-track-cta-target="contact"
                  data-track-placement="service_header"
                >
                  {text.contact}
                  <span aria-hidden="true" className="sl-cta-arrow">
                    →
                  </span>
                </CtaLink>
                {service.kind === "package" ? (
                  <CtaLink
                    href={getLocalizedPath(locale, "pricing")}
                    variant="text-light"
                    data-track-event="service_cta_click"
                    data-track-service-id={service.key}
                    data-track-cta-id="service_header_pricing"
                    data-track-cta-target="pricing"
                    data-track-placement="service_header"
                  >
                    {text.pricing}
                  </CtaLink>
                ) : null}
              </div>

              <p className="rise rise-delay-3 mt-7 text-[0.95rem] leading-relaxed text-paper/60" data-track-placement="service_header">
                {text.directLead} {text.call}{" "}
                <a
                  href={`tel:${businessInfo.phone}`}
                  className="tabular whitespace-nowrap text-paper underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
                >
                  {businessInfo.phoneDisplay}
                </a>{" "}
                {text.or}{" "}
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-paper underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
                >
                  WhatsApp
                </a>
                .
              </p>
            </div>

            {hasStage ? (
              <div className="lg:col-span-6">
                <HeroStage
                  locale={locale}
                  page={pageProject}
                  phone={phoneProject}
                  caption={text.liveWork}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Google reviews, close to the first call to action. */}
      {showReviews ? <GoogleReviews locale={locale} className="container-x pt-12 lg:pt-16" /> : null}

      {/* What is built, and when it fits. */}
      <section className="container-x pt-20 lg:pt-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4" data-reveal>
            <div className="lg:sticky lg:top-28">
              <h2 className="display-md">{service.fitTitle}</h2>
              <ul className="mt-6 space-y-3.5">
                {service.fit.map((item) => (
                  <li key={item} className="flex gap-3 text-[1rem] leading-snug text-body">
                    <span aria-hidden="true" className="mt-[0.65em] h-px w-3 shrink-0 bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <h2 className="label-mono text-ink" data-reveal>
              {service.buildTitle}
            </h2>
            <ul className="mt-4 border-t border-ink">
              {service.build.map((item, index) => (
                <li
                  key={item}
                  data-reveal
                  style={delay(index * 70)}
                  className="sl-ledger-row border-b border-line py-6 lg:py-7"
                >
                  <span className="block max-w-[34rem] text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] font-semibold leading-[1.18] tracking-[-0.02em] text-ink">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Proof: live projects, at the scale of the work itself. */}
      {proofProjects.length > 0 ? (
        <section className="mt-20 border-y border-line bg-paper-deep lg:mt-28">
          <div className="container-x py-16 lg:py-24">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2" data-reveal>
              <h2 className="display-md">{text.proof}</h2>
              <CtaLink
                href={getLocalizedPath(locale, "projects")}
                variant="text"
                data-track-event="service_cta_click"
                data-track-service-id={service.key}
                data-track-cta-id="service_proof_projects"
                data-track-cta-target="projects"
                data-track-placement="service_proof"
              >
                {text.allProjects}
              </CtaLink>
            </div>

            <div className="mt-10 space-y-16 lg:mt-14 lg:space-y-24">
              {proofProjects.map((project, index) => (
                <article
                  key={project.id}
                  className="group grid gap-7 lg:grid-cols-12 lg:items-center lg:gap-8"
                >
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${project.name}, ${text.visit}`}
                    data-track-link-context="project_live"
                    data-reveal
                    className={`sl-shot block lg:col-span-7 ${index % 2 === 1 ? "lg:order-2 lg:col-start-6" : ""}`}
                  >
                    <Image
                      src={project.image.src}
                      alt={project.image.alt[locale]}
                      width={project.image.width}
                      height={project.image.height}
                      sizes="(min-width: 1024px) 56vw, 100vw"
                      className="h-auto w-full transition-transform duration-[900ms] ease-out group-hover:scale-[1.02]"
                    />
                  </a>

                  <div
                    data-reveal
                    style={delay(120)}
                    className={`lg:col-span-4 ${
                      index % 2 === 1 ? "lg:order-1 lg:col-start-1 lg:row-start-1" : "lg:col-start-9"
                    }`}
                  >
                    <p className="label-mono">{project.sector[locale]}</p>
                    <h3 className="display-md mt-2">{project.name}</h3>
                    <p className="mt-4 text-[1rem] leading-relaxed text-muted">
                      {project.summary[locale]}
                    </p>
                    <ul className="mt-5 space-y-2 border-t border-line-strong pt-5">
                      {project.built[locale].map((item) => (
                        <li key={item} className="flex gap-3 text-[0.95rem] leading-snug text-body">
                          <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                      {project.casePath ? (
                        <CtaLink
                          href={project.casePath}
                          variant="text"
                          data-track-event="cta_click"
                          data-track-cta-id="project_row_case"
                          data-track-cta-target="case"
                          data-track-placement="project_row"
                        >
                          {text.readCase}
                        </CtaLink>
                      ) : null}
                      <CtaLink
                        href={project.url}
                        variant="text"
                        external
                        data-track-link-context="project_live"
                      >
                        {project.domain}
                      </CtaLink>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* What is included, next to what depends on scope. */}
      {service.parts && service.partsTitle ? (
        <section className="container-x pt-20 lg:pt-28">
          <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="rounded-md bg-ink p-7 sm:p-10 lg:col-span-7 lg:p-12" data-reveal>
              <h2 className="display-md text-paper">{service.partsTitle}</h2>
              <ul className="mt-7 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {service.parts.map((part) => (
                  <li
                    key={part.label}
                    className="flex gap-3 border-t border-paper/15 pt-4 text-[1rem] leading-snug text-paper/90"
                  >
                    <CheckMark />
                    {part.label}
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="rounded-md border border-line bg-surface p-7 sm:p-10 lg:col-span-5"
              data-reveal
              style={delay(120)}
            >
              <h2 className="label-mono text-ink">{service.scopeTitle}</h2>
              <ul className="mt-5 space-y-3">
                {service.scope.map((item) => (
                  <li key={item} className="flex gap-3 text-[0.95rem] leading-snug text-body">
                    <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-line-strong" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* How the project runs: one rail, drawn from left to right. */}
      <section className="container-x pt-20 lg:pt-28">
        <h2 className="display-md" data-reveal>
          {service.approachTitle}
        </h2>
        <ol className="mt-10 grid gap-y-10 lg:mt-14 lg:grid-cols-3">
          {service.approach.map((step, index) => (
            <li key={step.title} data-reveal style={delay(index * 160)} className="relative lg:pr-10">
              <span aria-hidden="true" className="sl-rail" />
              <span
                aria-hidden="true"
                className={`sl-rail-node ${index === service.approach.length - 1 ? "bg-ink" : "bg-accent"}`}
              />
              <p className="label-mono pt-7 text-accent">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-[1.35rem] font-semibold leading-snug tracking-[-0.015em] text-ink">
                {step.title}
              </h3>
              <p className="mt-3 max-w-[26rem] text-[0.98rem] leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The buying question in running text: heading left, text right. */}
      {service.sections && service.sections.length > 0 ? (
        <section className="container-x pt-20 lg:pt-28">
          <div className="border-t border-ink">
            {service.sections.map((section) => (
              <div
                key={section.heading}
                className="grid gap-5 border-b border-line py-10 lg:grid-cols-12 lg:gap-8 lg:py-14"
              >
                <h2 className="display-sm lg:col-span-4" data-reveal>
                  <span className="lg:sticky lg:top-28 lg:block">{section.heading}</span>
                </h2>
                <div className="lg:col-span-7 lg:col-start-6">
                  <ArticleRichText
                    blocks={section.paragraphs.map((paragraph) => ({
                      type: "paragraph" as const,
                      content: paragraph,
                    }))}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Questions. */}
      <section className="container-x pt-20 lg:pt-28">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <h2 className="display-md lg:col-span-4" data-reveal>
            {service.faqTitle}
          </h2>
          <div className="lg:col-span-7 lg:col-start-6">
            <FaqList items={service.faqs} />
          </div>
        </div>
      </section>

      {/* The enquiry: an ink band that the form sits on. */}
      <section
        id="contact"
        className="mt-20 scroll-mt-20 lg:mt-28"
        aria-labelledby="contact-heading"
      >
        <div className="relative overflow-hidden bg-ink pb-40 pt-16 text-paper lg:pb-48 lg:pt-24">
          <div aria-hidden="true" className="sl-grid sl-grid-low" />
          <div className="container-x relative grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-8" data-reveal>
            <h2 id="contact-heading" className="sl-title text-paper lg:col-span-7">
              {service.ctaTitle}
            </h2>
            <p className="max-w-[30rem] text-[1.08rem] leading-relaxed text-paper/70 lg:col-span-4 lg:col-start-9">
              {service.ctaText}
            </p>
          </div>
        </div>
        <div className="container-x relative -mt-28 lg:-mt-32">
          <div className="sl-card rounded-md border border-line bg-paper p-6 sm:p-10 lg:p-14" data-reveal>
            <ContactBlock
              locale={locale}
              content={content.contact}
              kvkLabel={content.footer.kvkLabel}
              whatsapp={{ href: whatsappHref, label: text.whatsappLabel }}
            />
          </div>
        </div>
      </section>
    </>
  );
}
