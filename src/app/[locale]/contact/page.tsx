import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ContactPanel from "@/components/contact-panel";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { organizationSchema, webPageSchema } from "@/lib/schema";
import {
  businessInfo,
  isValidLocale,
  siteContent,
} from "@/lib/content/site-content";

const contactPageMeta = {
  en: {
    title: "Contact",
    description:
      "Contact YM Creations about a custom website, web application, webshop, landing page, redesign, or performance project.",
  },
  nl: {
    title: "Contact",
    description:
      "Neem contact op met YM Creations over een maatwerk website, webapplicatie, webshop, landingspagina, redesign of performance project.",
  },
} as const;

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
    pathname: locale === "nl" ? "/nl/contact" : "/en/contact",
    title: contactPageMeta[locale].title,
    description: contactPageMeta[locale].description,
    alternates: getRouteAlternates("contact"),
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const content = siteContent[locale];
  const path = locale === "nl" ? "/nl/contact" : "/en/contact";

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: contactPageMeta[locale].title,
            description: contactPageMeta[locale].description,
            url: getCanonicalUrl(path),
          }),
          organizationSchema(),
        ]}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-arc pointer-events-none absolute inset-[-6%] opacity-[0.24]" />

          <RevealSection>
            <div className="relative z-10 grid gap-10 border-b border-[color:var(--line)] pb-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[32rem] lg:mx-0 lg:max-w-2xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                  {content.contact.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
                  {content.contact.title}
                </h1>
                <p className="mt-6 max-w-xl text-base leading-8 text-[color:var(--muted-foreground)]">
                  {content.contact.description}
                </p>
              </div>

              <div className="mx-auto grid w-full max-w-[26rem] gap-4 sm:max-w-[42rem] sm:grid-cols-3 lg:mx-0 lg:max-w-none">
                <div className="rounded-[1.6rem] border border-[color:var(--line)] bg-[var(--background-elevated)] p-5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                    Email
                  </p>
                  <p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
                    {businessInfo.email}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-[color:var(--line)] bg-[var(--background-elevated)] p-5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                    {locale === "nl" ? "Telefoon" : "Phone"}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
                    {businessInfo.phone}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-[color:var(--line)] bg-[var(--background-elevated)] p-5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                    {content.footer.kvkLabel}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
                    {businessInfo.kvk}
                  </p>
                </div>
              </div>
            </div>
          </RevealSection>

          <RevealSection delay={0.05}>
            <div className="relative z-10 mt-10 border-t border-[color:var(--line)] pt-8">
              <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
                <div className="max-w-2xl">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                    {locale === "nl" ? "Guided optie" : "Guided option"}
                  </p>
                  <h2 className="mt-4 text-3xl font-semibold text-[var(--foreground)]">
                    {locale === "nl"
                      ? "Twijfel je over het juiste niveau?"
                      : "Not sure which level fits?"}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                    {locale === "nl"
                      ? "Gebruik de Project Planner als je eerst gestructureerd je scope wilt bepalen. De normale contactroute blijft er gewoon naast bestaan."
                      : "Use the Project Planner if you want to scope the project first in a more structured way. The normal contact route stays available alongside it."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-3 lg:justify-end">
                  <Link
                    href={getLocalizedPath(locale, "projectPlanner")}
                    className="relative z-20 rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-6 py-3 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
                  >
                    {locale === "nl"
                      ? "Gebruik de Project Planner"
                      : "Use the Project Planner"}
                  </Link>
                  <Link
                    href={getLocalizedPath(locale, "pricing")}
                    className="inline-flex items-center text-sm font-medium text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                  >
                    {locale === "nl" ? "Bekijk tarieven" : "View pricing"}
                    <span className="ml-2 text-[var(--accent-text)]">→</span>
                  </Link>
                </div>
              </div>
            </div>
          </RevealSection>

          <div className="relative z-10 mx-auto mt-12 max-w-[42rem] lg:max-w-none">
            <ContactPanel
              locale={locale}
              content={content.contact}
              footer={content.footer}
            />
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
