import type { Metadata } from "next";
import { getLocalizedPath } from "@/lib/content/routes";
import { businessInfo, type Locale } from "@/lib/content/site-content";

type MetadataInput = {
  locale: Locale;
  pathname: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
  alternates?: Metadata["alternates"];
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
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function getHomeMetadata(locale: Locale) {
  if (locale === "nl") {
    return buildMetadata({
      locale,
      pathname: "/nl",
      title: "Premium Webdesign & Development",
      description:
        "Maatwerk websites, webapplicaties, webshops en landingspagina’s voor bedrijven die online sterker zichtbaar willen zijn.",
      alternates: {
        languages: {
          en: getLocalizedPath("en", "home"),
          nl: getLocalizedPath("nl", "home"),
          "x-default": getLocalizedPath("en", "home"),
        },
      },
    });
  }

  return buildMetadata({
    locale,
    pathname: "/en",
    title: "Premium Web Design & Development",
    description:
      "Custom websites, web applications, ecommerce builds, and landing pages for businesses that want a stronger online presence.",
    alternates: {
      languages: {
        en: getLocalizedPath("en", "home"),
        nl: getLocalizedPath("nl", "home"),
        "x-default": getLocalizedPath("en", "home"),
      },
    },
  });
}
