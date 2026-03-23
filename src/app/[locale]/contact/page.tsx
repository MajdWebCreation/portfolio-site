import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactPanel from "@/components/contact-panel";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getRouteAlternates } from "@/lib/content/routes";
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
          <div className="ym-bg-arc ym-bg-float-fade absolute inset-[-6%] opacity-[0.38]" />

          <RevealSection>
            <div className="relative grid gap-10 border-b border-white/10 pb-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[32rem] lg:mx-0 lg:max-w-2xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {content.contact.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {content.contact.title}
                </h1>
                <p className="mt-6 max-w-xl text-base leading-8 text-white/62">
                  {content.contact.description}
                </p>
              </div>

              <div className="mx-auto grid w-full max-w-[26rem] gap-4 sm:max-w-[42rem] sm:grid-cols-3 lg:mx-0 lg:max-w-none">
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/72">
                    Email
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/72">
                    {businessInfo.email}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/72">
                    {locale === "nl" ? "Telefoon" : "Phone"}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/72">
                    {businessInfo.phone}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/72">
                    {content.footer.kvkLabel}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/72">
                    {businessInfo.kvk}
                  </p>
                </div>
              </div>
            </div>
          </RevealSection>

          <div className="mx-auto mt-12 max-w-[42rem] lg:max-w-none">
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
