import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CtaLink from "@/components/cta-link";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import { PricingViewEvent } from "@/components/page-events";
import PricingCards from "@/components/pricing-cards";
import PricingHeroSketch from "@/components/pricing-hero-sketch";
import PricingSelector, {
  OriginalPrice,
  type SelectorAddOnGroup,
  type SelectorPackage,
} from "@/components/pricing-selector";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { getDevelopmentDiscountCopy, getPricingPageContent } from "@/lib/content/pricing";
import { getServiceAlternates } from "@/lib/content/services";
import {
  addOnGroupLabels,
  addOnGroupNotes,
  developmentPrice,
  formatAddOnPrice,
  formatEuro,
  formatMonthlyFrom,
  formatStartingPrice,
  getPackageMetadata,
  getPackages,
  type AddOnGroup,
  type CatalogPackage,
  type DevelopmentDiscount,
  type PricingCatalog,
} from "@/lib/pricing";
import { getPricingCatalog } from "@/lib/pricing/source";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";
import { webPageSchema } from "@/lib/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "en") {
    return {};
  }

  const content = getPricingPageContent("en");

  return buildMetadata({
    locale: "en",
    pathname: "/en/pricing",
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: getRouteAlternates("pricing"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "en" }];
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "en" || !isValidLocale(locale)) {
    notFound();
  }

  return <PricingPageContent locale={locale} />;
}

/* One catalog package in the shape the cards and the details render: amounts
   from the database, the highlights, the list of what is included and the
   boundary from the module that describes what a project type is. One-time
   amounts go through the development discount here, once, so the components
   only render strings; technical management is recurring and is formatted
   from the base amount. */
function toSelectorPackage(
  pkg: CatalogPackage,
  locale: Locale,
  plannerPath: string,
  discount: DevelopmentDiscount,
): SelectorPackage {
  const groups = new Map<AddOnGroup, SelectorAddOnGroup>();
  const metadata = getPackageMetadata(pkg.id);

  for (const addOn of pkg.addOns) {
    const group = groups.get(addOn.group) ?? {
      label: addOnGroupLabels[addOn.group][locale],
      note: addOnGroupNotes[addOn.group]?.[locale],
      items: [],
    };
    const addOnPrice = developmentPrice(addOn.amount, discount);
    group.items.push({
      label: addOn.label[locale],
      price: formatAddOnPrice(addOnPrice.amount, addOn.mode, locale),
      originalPrice: addOnPrice.percent === null ? undefined : formatEuro(addOnPrice.baseAmount, locale),
    });
    groups.set(addOn.group, group);
  }

  const starting = developmentPrice(pkg.startingPrice, discount);

  return {
    id: pkg.id,
    name: pkg.name[locale],
    tagline: pkg.tagline[locale],
    /* Every starting amount is a lower bound: the quote sets the final price. */
    price: formatStartingPrice(starting.amount, locale, true),
    priceAmount: formatEuro(starting.amount, locale),
    originalPriceAmount: starting.percent === null ? undefined : formatEuro(starting.baseAmount, locale),
    monthly: formatMonthlyFrom(pkg.monthlyManagementFrom, locale),
    scopeDriven: pkg.scopeDriven,
    highlights: metadata.highlights[locale],
    included: metadata.included[locale],
    addOnGroups: [...groups.values()],
    boundary: metadata.boundary[locale],
    plannerHref: `${plannerPath}?package=${pkg.id}`,
  };
}

export async function PricingPageContent({ locale }: { locale: Locale }) {
  const content = siteContent[locale];
  const pricing = getPricingPageContent(locale);
  const path = getLocalizedPath(locale, "pricing");
  const plannerPath = getLocalizedPath(locale, "projectPlanner");
  const contactPath = getLocalizedPath(locale, "contact");
  const webAppPath = getServiceAlternates("web-app-development").languages[locale];
  const catalog: PricingCatalog = await getPricingCatalog();
  const discount = catalog.developmentDiscount;
  const packages = getPackages(catalog).map((pkg) => toSelectorPackage(pkg, locale, plannerPath, discount));
  /* Websites side by side; the platform is software rather than a website and gets its own section. */
  const websites = packages.filter((pkg) => pkg.id !== "platform");
  const platform = packages.find((pkg) => pkg.id === "platform");
  /* The structured data states the lowest price a visitor actually sees. */
  const lowest = formatEuro(
    Math.min(...getPackages(catalog).map((pkg) => developmentPrice(pkg.startingPrice, discount).amount)),
    locale,
  );
  const discountCopy = discount ? getDevelopmentDiscountCopy(locale, discount.percent) : null;
  const selectorDiscount = discountCopy
    ? { note: discountCopy.note, originalLabel: discountCopy.originalLabel }
    : undefined;
  const detailLabels = {
    onceFromLabel: pricing.details.onceFromLabel,
    monthlyLabel: pricing.details.monthlyLabel,
    scopeNote: pricing.details.scopeNote,
    includedLabel: pricing.details.includedLabel,
    addOnsLabel: pricing.details.addOnsLabel,
    boundaryLabel: pricing.details.boundaryLabel,
    scopeLabel: pricing.details.scopeLabel,
    ctaLabel: pricing.details.ctaLabel,
  };

  return (
    <>
      <JsonLd
        data={webPageSchema({
          locale,
          name: pricing.metaTitle,
          description: `${pricing.metaDescription} ${lowest}`,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PricingViewEvent />
        <PageHeader
          label={pricing.hero.label}
          title={pricing.hero.title}
          intro={pricing.hero.intro}
          visual={<PricingHeroSketch />}
        />

        {/* What holds for every website, said once. */}
        <section className="container-x pt-10 lg:pt-12" aria-labelledby="pricing-principles">
          <h2 id="pricing-principles" className="sr-only">
            {pricing.principles.title}
          </h2>
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
            {pricing.principles.items.map((item) => (
              <li key={item.title} className="border-t border-line-strong pt-4">
                <p className="text-[1rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
                  {item.title}
                </p>
                <p className="mt-1.5 max-w-[22rem] text-[0.95rem] leading-snug text-muted">
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* The website types side by side: the comparison needs no interaction. */}
        <section className="container-x pt-14 lg:pt-20" aria-labelledby="pricing-overview">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-6">
            <div>
              <p className="label-mono">{pricing.overview.label}</p>
              <h2 id="pricing-overview" className="display-md mt-2">
                {pricing.overview.title}
              </h2>
            </div>
            <p className="text-[0.95rem] leading-snug text-muted">{pricing.overview.vatNote}</p>
          </div>
          <PricingCards
            packages={websites}
            labels={{
              fromLabel: pricing.overview.fromLabel,
              managementLabel: pricing.overview.managementLabel,
              ctaLabel: pricing.overview.ctaLabel,
              detailsLabel: pricing.overview.detailsLabel,
            }}
            discount={selectorDiscount}
          />
        </section>

        {/* The full detail per website type, one row each, opened on demand. */}
        <section className="container-x pt-14 lg:pt-20" aria-labelledby="pricing-details">
          <div className="grid gap-3 pb-5 lg:grid-cols-12 lg:gap-8">
            <p className="label-mono lg:col-span-4">{pricing.details.label}</p>
            <h2 id="pricing-details" className="display-sm max-w-[24ch] lg:col-span-8">
              {pricing.details.title}
            </h2>
          </div>
          <PricingSelector packages={websites} labels={detailLabels} discount={selectorDiscount} />
        </section>

        {/* Software rather than a website: its own band, so a custom website
            and custom software do not read as one thing. */}
        {platform ? (
          <section className="mt-16 bg-paper-deep lg:mt-24" aria-labelledby="pricing-platform">
            <div className="container-x py-14 lg:py-20">
              <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
                <div className="lg:col-span-7">
                  <p className="label-mono">{pricing.platform.label}</p>
                  <h2 id="pricing-platform" className="display-md mt-2 max-w-[18ch]">
                    {pricing.platform.title}
                  </h2>
                  <p className="mt-4 max-w-[32rem] text-[1.05rem] leading-relaxed text-body">
                    {pricing.platform.text}
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                    <CtaLink
                      href={contactPath}
                      data-track-event="pricing_cta_click"
                      data-track-package-id={platform.id}
                      data-track-cta-target="contact"
                      data-track-placement="pricing_platform"
                    >
                      {pricing.platform.ctaLabel}
                    </CtaLink>
                    <CtaLink
                      href={webAppPath}
                      variant="text"
                      className="text-muted"
                      data-track-event="pricing_cta_click"
                      data-track-package-id={platform.id}
                      data-track-cta-target="service"
                      data-track-placement="pricing_platform"
                    >
                      {pricing.platform.secondaryLabel}
                    </CtaLink>
                  </div>
                </div>
                <div className="lg:col-span-4 lg:col-start-9">
                  <p className="label-mono">{pricing.platform.fromLabel}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="tabular text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink">
                      {platform.priceAmount}
                    </span>
                    {selectorDiscount && platform.originalPriceAmount ? (
                      <span className="text-[1rem] leading-none">
                        <OriginalPrice
                          amount={platform.originalPriceAmount}
                          label={selectorDiscount.originalLabel}
                        />
                      </span>
                    ) : null}
                  </p>
                  {selectorDiscount && platform.originalPriceAmount ? (
                    <p className="mt-2 text-[0.82rem] leading-snug text-muted">{selectorDiscount.note}</p>
                  ) : null}
                  <p className="mt-2 max-w-[18rem] text-[0.85rem] leading-snug text-muted">
                    {pricing.details.scopeNote}
                  </p>
                  <p className="mt-6 label-mono">{pricing.platform.highlightsLabel}</p>
                  <ul className="mt-3">
                    {platform.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex gap-3 border-t border-line-strong py-2.5 text-[0.95rem] leading-snug text-body"
                      >
                        <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-accent" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-12 lg:mt-16">
                <PricingSelector packages={[platform]} labels={detailLabels} discount={selectorDiscount} />
              </div>
            </div>
          </section>
        ) : null}

        {/* The model behind the amounts: what is paid once, what per month. */}
        <section className="container-x pt-14 lg:pt-20" aria-labelledby="pricing-model">
          <h2 id="pricing-model" className="label-mono">
            {pricing.model.title}
          </h2>
          <div className="mt-6 grid gap-10 border-t border-line-strong pt-8 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-5">
              <p className="label-mono">{pricing.model.once.label}</p>
              <h3 className="display-sm mt-2">{pricing.model.once.title}</h3>
              <p className="mt-3 max-w-[28rem] text-[1rem] leading-relaxed text-body">
                {pricing.model.once.text}
              </p>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 lg:border-l lg:border-line-strong lg:pl-8">
              <p className="label-mono text-accent">{pricing.model.monthly.label}</p>
              <h3 className="display-sm mt-2">{pricing.model.monthly.title}</h3>
              <p className="mt-3 max-w-[30rem] text-[1rem] leading-relaxed text-body">
                {pricing.model.monthly.text}
              </p>
              <ul className="mt-4 max-w-[30rem] space-y-2 text-[0.95rem] leading-relaxed text-muted">
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-line-strong" />
                  {pricing.model.monthly.outside}
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-line-strong" />
                  {pricing.model.monthly.external}
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-8 text-[0.85rem] leading-snug text-faint">{pricing.model.note}</p>
        </section>

        {/* For visitors who do not know the type yet: one route, no second button. */}
        <section className="container-x pb-4 pt-14 lg:pt-20" aria-labelledby="pricing-closing">
          <div className="grid gap-6 border-t border-line-strong pt-8 lg:grid-cols-12 lg:gap-8 lg:pt-10">
            <h2 id="pricing-closing" className="display-md max-w-[16ch] lg:col-span-6">
              {pricing.closing.title}
            </h2>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-3 lg:col-span-6 lg:self-end lg:justify-self-end">
              <CtaLink
                href={plannerPath}
                variant="text"
                data-track-event="pricing_cta_click"
                data-track-package-id="none"
                data-track-cta-target="planner"
                data-track-placement="pricing_closing"
              >
                {pricing.closing.plannerLabel}
              </CtaLink>
              <CtaLink
                href={contactPath}
                variant="text"
                className="text-muted"
                data-track-event="pricing_cta_click"
                data-track-package-id="none"
                data-track-cta-target="contact"
                data-track-placement="pricing_closing"
              >
                {pricing.closing.contactLabel}
              </CtaLink>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}
