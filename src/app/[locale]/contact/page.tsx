import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import ContactPanel from "@/components/contact-panel";
import ContactIntentBlock from "@/components/contact-intent-block";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { organizationSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent } from "@/lib/content/site-content";

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
          <div className="absolute inset-0">
            <Image
              src="/images/visuals/ambient-texture-light-arc.png"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-18"
            />
          </div>
          <RevealSection>
            <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {content.contact.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {content.contact.title}
                </h1>
                <p className="mt-6 text-base leading-8 text-white/64">
                  {content.contact.description}
                </p>
              </div>
              <div className="relative min-h-[280px] overflow-hidden rounded-[2.3rem] border border-white/10">
                <Image
                  src="/images/visuals/contact-signal-visual.png"
                  alt="Contact signal visual"
                  fill
                  sizes="(min-width: 1024px) 48vw, 100vw"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.2),rgba(4,7,12,0.76)_62%,rgba(4,7,12,0.96))]" />
              </div>
            </div>
          </RevealSection>
          <div className="mt-12">
            <ContactPanel
              locale={locale}
              content={content.contact}
              footer={content.footer}
            />
          </div>
          <div className="mt-10">
            <ContactIntentBlock locale={locale} />
          </div>
        </section>
        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
