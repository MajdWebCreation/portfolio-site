import type { Metadata } from "next";
import { grotesk, mono } from "@/app/fonts";
import AnalyticsProvider from "@/components/analytics-provider";
import AnalyticsScripts from "@/components/consent/analytics-scripts";
import ConsentDialog from "@/components/consent/consent-dialog";
import { getLocalizedPath } from "@/lib/content/routes";
import {
  businessInfo,
  defaultLocale,
  isValidLocale,
  locales,
  siteContent,
} from "@/lib/content/site-content";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(businessInfo.websiteUrl),
  title: {
    default: businessInfo.name,
    template: `%s | ${businessInfo.name}`,
  },
  description:
    "Maatwerk websites, webshops en webapplicaties voor Nederlandse bedrijven, gebouwd in eigen code.",
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "512x512" }],
    shortcut: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Unknown locales fall through to the segment's not-found boundary; the
  // document itself still needs a valid language.
  const lang = isValidLocale(locale) ? locale : defaultLocale;
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  /*
    Analytics only exists when the deployment names a property, and then only
    behind the visitor's choice: the consent card asks, and the script tags
    are rendered by a client component that waits for the answer. Without a
    property there is nothing to ask about, so neither is rendered.
  */
  return (
    <html lang={lang} className={`${grotesk.variable} ${mono.variable}`}>
      <body>
        <AnalyticsProvider />
        {children}
        {gaMeasurementId ? (
          <>
            <ConsentDialog
              copy={siteContent[lang].consent}
              privacyHref={getLocalizedPath(lang, "privacy")}
              cookiesHref={getLocalizedPath(lang, "cookies")}
            />
            <AnalyticsScripts measurementId={gaMeasurementId} />
          </>
        ) : null}
      </body>
    </html>
  );
}
