import type { Metadata } from "next";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { businessInfo, type Locale } from "@/lib/content/site-content";

type MetadataInput = {
  locale: Locale;
  pathname: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
  alternates?: Metadata["alternates"];
  image?: string;
  /** Keep the page out of search results (used for draft legal documents). */
  noindex?: boolean;
};

export function getCanonicalUrl(pathname: string) {
  return new URL(pathname, businessInfo.websiteUrl).toString();
}

export function buildMetadata({
  locale,
  pathname,
  title,
  description,
  absoluteTitle = false,
  alternates,
  image,
  noindex = false,
}: MetadataInput): Metadata {
  const canonical = getCanonicalUrl(pathname);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: pathname,
      ...alternates,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: businessInfo.name,
      locale: locale === "nl" ? "nl_NL" : "en_US",
      alternateLocale: locale === "nl" ? ["en_US"] : ["nl_NL"],
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: !noindex,
      follow: true,
    },
  };
}

export function getHomeMetadata(locale: Locale) {
  if (locale === "nl") {
    return buildMetadata({
      locale,
      pathname: getLocalizedPath("nl", "home"),
      title: "Maatwerk websites, webshops en webapplicaties",
      description:
        "YM Creations is een Nederlands IT- en webbedrijf. We ontwerpen en bouwen maatwerk websites, webshops, webapplicaties, apps en 3D-configurators in eigen code.",
      alternates: getRouteAlternates("home"),
    });
  }

  return buildMetadata({
    locale,
    pathname: getLocalizedPath("en", "home"),
    title: "Custom websites, webshops and web applications",
    description:
      "YM Creations is a Dutch IT and web company. We design and build custom websites, webshops, web applications, apps and 3D configurators in custom code.",
    alternates: getRouteAlternates("home"),
  });
}
