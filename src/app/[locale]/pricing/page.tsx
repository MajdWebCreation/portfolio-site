import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CtaLink, { ctaVariants } from "@/components/cta-link";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import { PricingViewEvent } from "@/components/page-events";
import PricingCards from "@/components/pricing-cards";
import PricingCategories from "@/components/pricing-categories";
import PricingHeroSketch from "@/components/pricing-hero-sketch";
import PricingSelector, {
  type SelectorAddOnGroup,
  type SelectorPackage,
} from "@/components/pricing-selector";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import {
  getDevelopmentDiscountCopy,
  getPricingPageContent,
  type PricingCategoryCopy,
} from "@/lib/content/pricing";
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
  getProductCategory,
  isAddOnShown,
  packagesInCategory,
  productCategories,
  type AddOnGroup,
  type CatalogPackage,
  type DevelopmentDiscount,
  type PricingCatalog,
  type ProductCategory,
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
  contactPath: string,
  requestLabel: string,
  discount: DevelopmentDiscount,
): SelectorPackage {
  const groups = new Map<AddOnGroup, SelectorAddOnGroup>();
  const metadata = getPackageMetadata(pkg.id);

  for (const addOn of pkg.addOns) {
    /* Add-ons whose content the research puts inside the type are not offered. */
    if (!isAddOnShown(pkg.id, addOn.id)) continue;
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
    category: getProductCategory(pkg.id),
    name: pkg.name[locale],
    /* Who the type is for, from the research; the catalog tagline stays for the planner and the admin. */
    tagline: metadata.audience[locale],
    /* Every starting amount is a lower bound: the quote sets the final price. */
    price: formatStartingPrice(starting.amount, locale, true),
    priceAmount: formatEuro(starting.amount, locale),
    originalPriceAmount: starting.percent === null ? undefined : formatEuro(starting.baseAmount, locale),
    monthly: formatMonthlyFrom(pkg.monthlyManagementFrom, locale),
    scopeDriven: pkg.scopeDriven,
    highlights: metadata.highlights[locale],
    included: metadata.included[locale],
    notIncluded: metadata.notIncluded[locale],
    onRequest: metadata.onRequest[locale],
    addOnGroups: [...groups.values()],
    boundary: metadata.boundary[locale],
    /* The contact form, with this type filled in (lib/contact/package-request). */
    requestHref: `${contactPath}?package=${pkg.id}`,
    requestLabel,
  };
}

/* The route under a category's cards: what falls outside them, in one
   sentence and one link, clearly second to the types above it. To the
   contact page, or to the custom-work tab on this page; the latter is a
   plain anchor so the hash change reaches the tabs. */
function CategoryRoute({
  category,
  route,
  contactPath,
}: {
  category: ProductCategory;
  route: NonNullable<PricingCategoryCopy["route"]>;
  contactPath: string;
}) {
  const tracking = {
    "data-track-event": "pricing_cta_click",
    "data-track-package-id": "none",
    "data-track-product-category": category,
    "data-track-placement": "pricing_category",
  } as const;

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-line py-5 text-[0.95rem] leading-snug">
      <p className="max-w-[40rem] text-muted">{route.text}</p>
      {route.target === "contact" ? (
        <CtaLink href={contactPath} variant="text" {...tracking} data-track-cta-target="contact">
          {route.label}
        </CtaLink>
      ) : (
        <a href="#custom" className={ctaVariants.text} {...tracking} data-track-cta-target="pricing">
          {route.label}
          <span aria-hidden="true" className="translate-y-px">
            →
          </span>
        </a>
      )}
    </div>
  );
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
  const packages = getPackages(catalog).map((pkg) =>
    toSelectorPackage(pkg, locale, contactPath, pricing.requestLabels[pkg.id], discount),
  );
  /* The structured data states the lowest price a visitor actually sees. */
  const lowest = formatEuro(
    Math.min(...getPackages(catalog).map((pkg) => developmentPrice(pkg.startingPrice, discount).amount)),
    locale,
  );
  const discountCopy = discount ? getDevelopmentDiscountCopy(locale, discount.percent) : null;
  const selectorDiscount = discountCopy
    ? { note: discountCopy.note, originalLabel: discountCopy.originalLabel }
    : undefined;
  const cardLabels = {
    fromLabel: pricing.overview.fromLabel,
    managementLabel: pricing.overview.managementLabel,
    scopeNote: pricing.details.scopeNote,
    detailsLabel: pricing.overview.detailsLabel,
  };
  const detailLabels = {
    onceFromLabel: pricing.details.onceFromLabel,
    monthlyLabel: pricing.details.monthlyLabel,
    scopeNote: pricing.details.scopeNote,
    includedLabel: pricing.details.includedLabel,
    notIncludedLabel: pricing.details.notIncludedLabel,
    addOnsLabel: pricing.details.addOnsLabel,
    onRequestLabel: pricing.details.onRequestLabel,
    boundaryLabel: pricing.details.boundaryLabel,
    scopeLabel: pricing.details.scopeLabel,
  };

  /* The web application type is software rather than a website: its card
     carries the service page as a second link. */
  const forCards = (pkg: SelectorPackage): SelectorPackage =>
    pkg.id === "platform"
      ? { ...pkg, secondaryAction: { href: webAppPath, label: pricing.platform.secondaryLabel, target: "service" } }
      : pkg;

  /* One panel per category: its types side by side, the route for what
     falls outside them under them, and the full detail of those types. */
  const panels = Object.fromEntries(
    productCategories.map((category) => {
      const copy = pricing.categories.items[category];
      const ids = packagesInCategory(category);
      const inCategory = ids.flatMap((id) => packages.filter((pkg) => pkg.id === id));

      return [
        category,
        <div key={category}>
          {copy.intro ? (
            <p className="mb-6 max-w-[40rem] text-[1.05rem] leading-relaxed text-body sm:mb-8">{copy.intro}</p>
          ) : null}
          <PricingCards packages={inCategory.map(forCards)} labels={cardLabels} discount={selectorDiscount} />
          {copy.route ? <CategoryRoute category={category} route={copy.route} contactPath={contactPath} /> : null}
          <div className="pt-12 lg:pt-16">
            <div className="grid gap-3 pb-5 lg:grid-cols-12 lg:gap-8">
              <p className="label-mono lg:col-span-4">{pricing.details.label}</p>
              <h3 className="display-sm max-w-[24ch] lg:col-span-8">{pricing.details.title}</h3>
            </div>
            <PricingSelector packages={inCategory} labels={detailLabels} discount={selectorDiscount} />
          </div>
        </div>,
      ];
    }),
  ) as Record<ProductCategory, React.ReactNode>;

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
          visualOnMobile={false}
        />

        {/* The first question, and the three answers as tabs: a visitor
            compares only the types that fit what they want made. */}
        <section className="container-x pt-10 lg:pt-14" aria-labelledby="pricing-categories">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-6">
            <h2 id="pricing-categories" className="display-md">
              {pricing.categories.title}
            </h2>
            <p className="text-[0.95rem] leading-snug text-muted">{pricing.overview.vatNote}</p>
          </div>
          <PricingCategories
            labelledBy="pricing-categories"
            viewingLabel={pricing.categories.viewingLabel}
            tabs={productCategories.map((category) => ({
              id: category,
              name: pricing.categories.items[category].name,
              descriptor: pricing.categories.items[category].descriptor,
            }))}
            panels={panels}
          />
        </section>

        {/* What holds for every website, said once. */}
        <section className="container-x pt-14 lg:pt-20" aria-labelledby="pricing-principles">
          <h2 id="pricing-principles" className="label-mono">
            {pricing.principles.title}
          </h2>
          <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3">
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
