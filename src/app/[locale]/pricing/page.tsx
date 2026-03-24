import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getRouteAlternates } from "@/lib/content/routes";
import { getLocalizedPath } from "@/lib/content/routes";
import { getPricingPageContent } from "@/lib/content/pricing";
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

export function PricingPageContent({ locale }: { locale: Locale }) {
  const content = siteContent[locale];
  const pricing = getPricingPageContent(locale);
  const path = locale === "nl" ? "/nl/tarieven" : "/en/pricing";
  const packageRailLabel =
    locale === "nl" ? "Projectladder" : "Project ladder";
  const fitLabel = locale === "nl" ? "Kern van het pakket" : "Core scope";

  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: pricing.metaTitle,
          description: pricing.metaDescription,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-curve absolute inset-x-[-8%] inset-y-0 opacity-[0.18]" />
          <div className="relative grid gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[34rem] lg:mx-0 lg:max-w-3xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                  {pricing.hero.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
                  {pricing.hero.title}
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted-foreground)] sm:text-lg">
                  {pricing.hero.description}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start">
                  <Link
                    href={getLocalizedPath(locale, "contact")}
                    data-track-event="contact_cta_click"
                    data-track-category="pricing"
                    data-track-label={pricing.hero.primaryLabel}
                    data-track-location="pricing-hero-primary"
                    className="rounded-full bg-[var(--button-bg)] px-7 py-3.5 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
                  >
                    {pricing.hero.primaryLabel}
                  </Link>
                  <Link
                    href={`${path}#packages`}
                    data-track-event="primary_cta_click"
                    data-track-category="pricing"
                    data-track-label={pricing.hero.secondaryLabel}
                    data-track-location="pricing-hero-secondary"
                    className="rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] px-7 py-3.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[color:var(--line-strong)]"
                  >
                    {pricing.hero.secondaryLabel}
                  </Link>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto max-w-[42rem] border-t border-[color:var(--line)] pt-6 md:pt-8 lg:mx-0">
                <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                  {pricing.intro.title}
                </p>
                <p className="mt-5 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {pricing.intro.text}
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="border-t border-[color:var(--line)] pt-4">
                    <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--accent-text)]">
                      {locale === "nl" ? "Lichter traject" : "Lighter scope"}
                    </p>
                    <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                      {locale === "nl"
                        ? "Compacte websites en heldere bedrijfspresentaties blijven bewust eenvoudiger geprijsd."
                        : "Compact websites and clear business presentations stay intentionally simpler in scope."}
                    </p>
                  </div>
                  <div className="border-t border-[color:var(--line)] pt-4">
                    <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--accent-text)]">
                      {locale === "nl" ? "Zwaarder traject" : "Deeper scope"}
                    </p>
                    <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                      {locale === "nl"
                        ? "Zodra bookings, betalingen, admin of platformlogica meespelen, groeit de bouwdiepte en dus ook de investering."
                        : "As soon as bookings, payments, admin, or platform logic enter the picture, the build depth and investment increase."}
                    </p>
                  </div>
                </div>

                <div className="mt-7 border-t border-[color:var(--line)] pt-4">
                  <Link
                    href={getLocalizedPath(locale, "projectPlanner")}
                    data-track-event="primary_cta_click"
                    data-track-category="pricing"
                    data-track-label={
                      locale === "nl"
                        ? "Gebruik de Project Planner"
                        : "Use the Project Planner"
                    }
                    data-track-location="pricing-intro-planner"
                    className="inline-flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                  >
                    {locale === "nl"
                      ? "Twijfel je over het juiste pakket? Gebruik de Project Planner"
                      : "Not sure which package fits? Use the Project Planner"}
                    <span className="text-[var(--accent-text)]">→</span>
                  </Link>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section
          id="packages"
          className="relative mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10 lg:py-14"
        >
          <RevealSection>
            <div className="mx-auto max-w-[22rem] text-center sm:max-w-[36rem] lg:mx-0 lg:max-w-3xl lg:text-left">
              <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                {pricing.cards.eyebrow}
              </p>
              <h2 className="mt-5 text-balance text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl">
                {pricing.cards.title}
              </h2>
              <p className="mt-6 max-w-3xl text-base leading-8 text-[color:var(--muted-foreground)]">
                {pricing.cards.description}
              </p>
            </div>
          </RevealSection>

          <RevealSection delay={0.04}>
            <div className="mt-10 overflow-x-auto pb-2">
              <div className="flex min-w-max border-y border-[color:var(--line)]">
                {pricing.packages.map((pkg, index) => (
                  <div
                    key={`${pkg.key}-rail`}
                    className="border-r border-[color:var(--line)] px-4 py-4 last:border-r-0 md:min-w-[220px]"
                  >
                    <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--accent-text)]">
                      {packageRailLabel} {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-3 text-base font-medium text-[var(--foreground)]">
                      {pkg.title}
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{pkg.price}</p>
                  </div>
                ))}
              </div>
            </div>
          </RevealSection>

          <div className="mt-12 space-y-8">
            {pricing.packages.map((pkg, index) => (
              <RevealSection key={pkg.key} delay={index * 0.04}>
                <article className="ym-surface-strong group relative overflow-hidden rounded-[2.35rem] p-6 transition hover:border-[color:var(--line-strong)] md:p-8 lg:p-9">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(113,227,255,0.08),transparent_34%)] opacity-80" />

                  <div className="relative">
                    <div className="grid gap-6 border-b border-[color:var(--line)] pb-7 lg:grid-cols-[1.15fr_auto] lg:items-end">
                      <div className="max-w-2xl">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                          {String(index + 1).padStart(2, "0")}
                        </p>
                        <h3 className="mt-4 text-3xl font-semibold leading-tight text-[var(--foreground)] md:text-[2.2rem]">
                          {pkg.title}
                        </h3>
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--muted-foreground)]">
                          {pkg.positioning}
                        </p>
                      </div>
                      <div className="rounded-[1.6rem] border border-[color:var(--line)] bg-[var(--background)] px-5 py-4 text-left lg:min-w-[210px]">
                        <p className="text-[10px] uppercase tracking-[0.26em] text-[color:var(--muted-foreground)]">
                          {locale === "nl" ? "Startprijs" : "Starting point"}
                        </p>
                        <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
                          {pkg.price}
                        </p>
                      </div>
                    </div>

                    <div className="mt-7 grid gap-8 xl:grid-cols-[1.04fr_0.96fr]">
                      <div className="border-t border-[color:var(--line)] pt-5">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                          {locale === "nl" ? "Inbegrepen" : "Included"}
                        </p>
                        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">{fitLabel}</p>
                        <ul className="mt-5 space-y-3">
                          {pkg.included.map((item) => (
                            <li
                              key={item}
                              className="border-b border-[color:var(--line)] pb-3 text-sm leading-7 text-[color:var(--muted-foreground)] last:border-b-0 last:pb-0"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="border-t border-[color:var(--line)] pt-5">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                          {locale === "nl" ? "Logische add-ons" : "Logical add-ons"}
                        </p>
                        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                          {locale === "nl"
                            ? "Alleen wat technisch en inhoudelijk past."
                            : "Only what fits the scope technically and logically."}
                        </p>
                        <div className="mt-5 space-y-3">
                          {pkg.addOns.map((addOn) => (
                            <div
                              key={`${pkg.key}-${addOn.label}`}
                              className="flex items-start justify-between gap-4 border-b border-[color:var(--line)] pb-3 last:border-b-0 last:pb-0"
                            >
                              <p className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                                {addOn.label}
                              </p>
                              <p className="shrink-0 text-sm font-medium text-[var(--foreground)]">
                                {addOn.price}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {pkg.dependencyNotes?.length || pkg.examples?.length ? (
                      <div className="mt-9 grid gap-6 border-t border-[color:var(--line)] pt-6 lg:grid-cols-2">
                        {pkg.dependencyNotes?.length ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                              {locale === "nl" ? "Afhankelijkheden" : "Dependencies"}
                            </p>
                            <ul className="mt-5 space-y-3">
                              {pkg.dependencyNotes.map((item) => (
                                <li
                                  key={item}
                                  className="border-b border-[color:var(--line)] pb-3 text-sm leading-7 text-[color:var(--muted-foreground)] last:border-b-0 last:pb-0"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {pkg.examples?.length ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                              {locale === "nl" ? "Compact voorbeeld" : "Compact example"}
                            </p>
                            <div className="mt-5 space-y-3">
                              {pkg.examples.map((example) => (
                                <div
                                  key={example.label}
                                  className="flex items-start justify-between gap-4 border-b border-[color:var(--line)] pb-3 last:border-b-0 last:pb-0"
                                >
                                  <p className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                                    {example.label}
                                  </p>
                                  <p className="shrink-0 text-sm font-medium text-[var(--foreground)]">
                                    {example.price}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              </RevealSection>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
          <div className="grid gap-6 lg:grid-cols-2">
            <RevealSection>
              <div className="border-t border-[color:var(--line)] pt-6 md:pt-8">
                <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                  {locale === "nl" ? "Context" : "Context"}
                </p>
                <h2 className="mt-5 text-3xl font-semibold text-[var(--foreground)]">
                  {pricing.whyPricesDiffer.title}
                </h2>
                <p className="mt-5 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {pricing.whyPricesDiffer.text}
                </p>
              </div>
            </RevealSection>

            <RevealSection delay={0.06}>
              <div className="border-t border-[color:var(--line)] pt-6 md:pt-8">
                <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                  {locale === "nl" ? "Werkwijze" : "Approach"}
                </p>
                <h2 className="mt-5 text-3xl font-semibold text-[var(--foreground)]">
                  {pricing.howItWorks.title}
                </h2>
                <p className="mt-5 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {pricing.howItWorks.text}
                </p>
                <div className="mt-6 space-y-3">
                  {pricing.howItWorks.steps.map((step, index) => (
                    <div
                      key={step}
                      className="border-b border-[color:var(--line)] pb-4 last:border-b-0 last:pb-0"
                    >
                      <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--accent-text)]">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
          <RevealSection>
            <div className="border-t border-[color:var(--line)] pt-6 md:pt-8 lg:pt-9">
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                  {locale === "nl" ? "Structuur" : "Structure"}
                </p>
                <h2 className="mt-5 text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                  {pricing.packageRules.title}
                </h2>
                <p className="mt-5 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {pricing.packageRules.description}
                </p>
              </div>

              <div className="mt-10 grid gap-5 xl:grid-cols-2">
                {pricing.packageRules.items.map((item) => (
                  <article
                    key={item.title}
                    className="border-t border-[color:var(--line)] pt-5 md:pt-6"
                  >
                    <h3 className="text-2xl font-medium text-[var(--foreground)]">{item.title}</h3>
                    <p className="mt-5 text-[10px] uppercase tracking-[0.26em] text-[var(--accent-text)]">
                      {item.allowedLabel}
                    </p>
                    <ul className="mt-4 space-y-3">
                      {item.allowed.map((allowedItem) => (
                        <li
                          key={allowedItem}
                          className="border-b border-[color:var(--line)] pb-3 text-sm leading-7 text-[color:var(--muted-foreground)] last:border-b-0 last:pb-0"
                        >
                          {allowedItem}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-6 text-[10px] uppercase tracking-[0.26em] text-[color:var(--muted-foreground)]">
                      {item.upgradeLabel}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                      {item.upgrade}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </RevealSection>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
          <SeoCta
            title={pricing.cta.title}
            text={pricing.cta.text}
            primaryLabel={pricing.cta.primaryLabel}
            primaryHref={getLocalizedPath(locale, "projectPlanner")}
            secondaryLabel={pricing.cta.secondaryLabel}
            secondaryHref={getLocalizedPath(locale, "services")}
            trackingContext="service"
          />
          <p className="mt-6 max-w-4xl text-sm leading-7 text-[color:var(--muted-foreground)]">
            {pricing.disclaimer}
          </p>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
