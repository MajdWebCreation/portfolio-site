import type { Metadata } from "next";
import { grotesk, mono } from "@/app/fonts";
import AnalyticsProvider from "@/components/analytics-provider";
import AnalyticsScripts from "@/components/consent/analytics-scripts";
import ClarityScript from "@/components/consent/clarity-script";
import ConsentDialog from "@/components/consent/consent-dialog";
import { clarityProjectId } from "@/lib/clarity/client";
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
  const clarityId = clarityProjectId();

  /*
    Each optional tool exists only when the deployment names it, and then
    only behind the visitor's choice: the consent card asks, and the script
    tags are rendered by client components that wait for the answer --
    Google Analytics under "statistics", Microsoft Clarity under "behaviour
    recordings", independently. Without either there is nothing to ask
    about, so no card is rendered. The admin has its own root layout and
    none of this.
  */
  return (
    <html lang={lang} className={`${grotesk.variable} ${mono.variable}`}>
      <body>
        <AnalyticsProvider />
        {children}
        {gaMeasurementId || clarityId ? (
          <ConsentDialog
            copy={siteContent[lang].consent}
            privacyHref={getLocalizedPath(lang, "privacy")}
            cookiesHref={getLocalizedPath(lang, "cookies")}
            analyticsAvailable={Boolean(gaMeasurementId)}
            recordingsAvailable={Boolean(clarityId)}
          />
        ) : null}
        {gaMeasurementId ? <AnalyticsScripts measurementId={gaMeasurementId} /> : null}
        {clarityId ? <ClarityScript projectId={clarityId} /> : null}
      </body>
    </html>
  );
}
