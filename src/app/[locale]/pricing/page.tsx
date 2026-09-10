import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CtaLink from "@/components/cta-link";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import PricingHeroSketch from "@/components/pricing-hero-sketch";
import PricingSelector, {
  type SelectorAddOnGroup,
  type SelectorPackage,
} from "@/components/pricing-selector";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { getPricingPageContent } from "@/lib/content/pricing";
import {
  addOnGroupLabels,
  formatAddOnPrice,
  formatEuro,
  formatMonthlyFrom,
  formatStartingPrice,
  getPackageMetadata,
  getPackages,
  type AddOnGroup,
  type CatalogPackage,
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

/* One catalog package in the shape the selector renders: amounts from the
   database, the list of what is included and the boundary from the module
   that describes what a project type is. */
function toSelectorPackage(
  pkg: CatalogPackage,
  locale: Locale,
  plannerPath: string,
): SelectorPackage {
  const groups = new Map<AddOnGroup, SelectorAddOnGroup>();
  const metadata = getPackageMetadata(pkg.id);

  for (const addOn of pkg.addOns) {
    const group = groups.get(addOn.group) ?? {
      label: addOnGroupLabels[addOn.group][locale],
      items: [],
    };
    group.items.push({
      label: addOn.label[locale],
      price: formatAddOnPrice(addOn.amount, addOn.mode, locale),
    });
    groups.set(addOn.group, group);
  }

  return {
    id: pkg.id,
    name: pkg.name[locale],
    tagline: pkg.tagline[locale],
    price: formatStartingPrice(pkg.startingPrice, locale, pkg.scopeDriven),
    priceAmount: `${formatEuro(pkg.startingPrice, locale)}${pkg.scopeDriven ? "+" : ""}`,
    monthly: formatMonthlyFrom(pkg.monthlyManagementFrom, locale),
    scopeDriven: pkg.scopeDriven,
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
  const catalog: PricingCatalog = await getPricingCatalog();
  const packages = getPackages(catalog).map((pkg) => toSelectorPackage(pkg, locale, plannerPath));
  const lowest = formatEuro(Math.min(...getPackages(catalog).map((pkg) => pkg.startingPrice)), locale);

  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: pricing.metaTitle,
          description: `${pricing.metaDescription} ${lowest}`,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PageHeader
          label={pricing.hero.label}
          title={pricing.hero.title}
          intro={pricing.hero.intro}
          visual={<PricingHeroSketch />}
        />

        {/* One level at a time: list on the left, detail on the right. */}
        <section className="container-x pt-12 lg:pt-16" aria-labelledby="pricing-levels">
          <div className="grid gap-4 border-b border-ink pb-5 lg:grid-cols-12 lg:gap-8">
            <p className="label-mono lg:col-span-4">{pricing.selector.label}</p>
            <h2 id="pricing-levels" className="display-sm max-w-[22ch] lg:col-span-8">
              {pricing.selector.title}
            </h2>
          </div>
          <PricingSelector
            packages={packages}
            labels={{
              onceLabel: pricing.selector.onceLabel,
              monthlyLabel: pricing.selector.monthlyLabel,
              scopeTag: pricing.selector.scopeTag,
              includedLabel: pricing.selector.includedLabel,
              addOnsLabel: pricing.selector.addOnsLabel,
              boundaryLabel: pricing.selector.boundaryLabel,
              scopeLabel: pricing.selector.scopeLabel,
              ctaLabel: pricing.selector.ctaLabel,
            }}
            initialId="business"
          />
        </section>

        {/* The model behind the amounts: what is paid once, what per month. */}
        <section className="mt-16 bg-paper-deep lg:mt-24" aria-labelledby="pricing-model">
          <div className="container-x py-14 lg:py-20">
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
          </div>
        </section>

        {/* For visitors who do not know the level yet: one route, no second button. */}
        <section className="container-x pb-4 pt-14 lg:pt-20" aria-labelledby="pricing-closing">
          <div className="grid gap-6 border-t border-line-strong pt-8 lg:grid-cols-12 lg:gap-8 lg:pt-10">
            <h2 id="pricing-closing" className="display-md max-w-[16ch] lg:col-span-6">
              {pricing.closing.title}
            </h2>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-3 lg:col-span-6 lg:self-end lg:justify-self-end">
              <CtaLink
                href={plannerPath}
                variant="text"
                data-track-event="primary_cta_click"
                data-track-category="pricing"
                data-track-label="planner"
                data-track-location="pricing-closing"
              >
                {pricing.closing.plannerLabel}
              </CtaLink>
              <CtaLink
                href={getLocalizedPath(locale, "contact")}
                variant="text"
                className="text-muted"
                data-track-event="contact_cta_click"
                data-track-category="pricing"
                data-track-label="contact"
                data-track-location="pricing-closing"
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
