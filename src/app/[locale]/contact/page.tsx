import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactBlock from "@/components/contact-block";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { organizationSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent } from "@/lib/content/site-content";

const contactPageMeta = {
  nl: {
    title: "Contact",
    description:
      "Neem contact op met YM Creations over een website, webapplicatie, webshop of redesign. Reactie op werkdagen binnen 24 uur.",
    heading: "Vertel wat je wilt laten bouwen.",
    intro:
      "Een paar zinnen zijn genoeg: wat doet je bedrijf, wat moet de site of applicatie doen, en is er al iets? Je krijgt advies, een voorstel met scope en prijs, of eerst een gesprek.",
  },
  en: {
    title: "Contact",
    description:
      "Contact YM Creations about a website, web application, webshop or redesign. Reply within 24 hours on working days.",
    heading: "Tell us what you want built.",
    intro:
      "A few sentences are enough: what does your business do, what should the site or application do, and is there something already? You get advice, a proposal with scope and price, or a call first.",
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
    pathname: getLocalizedPath(locale, "contact"),
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
  const meta = contactPageMeta[locale];
  const path = getLocalizedPath(locale, "contact");

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: meta.title,
            description: meta.description,
            url: getCanonicalUrl(path),
          }),
          organizationSchema(),
        ]}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PageHeader label={meta.title} title={meta.heading} intro={meta.intro} />
        <section className="container-x">
          <div className="pt-12 lg:pt-16">
            <ContactBlock
              locale={locale}
              content={content.contact}
              kvkLabel={content.footer.kvkLabel}
            />
          </div>
        </section>
      </SiteShell>
    </>
  );
}
