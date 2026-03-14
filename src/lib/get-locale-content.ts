import { isValidLocale, siteContent, type Locale } from "@/lib/site-content";

export function getLocaleContent(locale: string) {
  const safeLocale: Locale = isValidLocale(locale) ? locale : "en";
  return {
    locale: safeLocale,
    content: siteContent[safeLocale],
  };
}