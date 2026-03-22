import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactPanel from "@/components/contact-panel";
import ContactIntentBlock from "@/components/contact-intent-block";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SectionHeading from "@/components/section-heading";
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
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <RevealSection>
            <SectionHeading
              as="h1"
              eyebrow={content.contact.eyebrow}
              title={content.contact.title}
              description={content.contact.description}
            />
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
