import type { Metadata } from "next";
import Script from "next/script";
import AnalyticsProvider from "@/components/analytics-provider";
import { businessInfo } from "@/lib/content/site-content";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(businessInfo.websiteUrl),
  title: {
    default: businessInfo.name,
    template: `%s | ${businessInfo.name}`,
  },
  description: "Premium web design and development.",
  icons: {
    icon: [
      {
        url: "/icon",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: [
      {
        url: "/icon",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="ym-locale-lang" strategy="beforeInteractive">
          {`
            document.documentElement.lang = window.location.pathname.startsWith('/nl') ? 'nl' : 'en';
          `}
        </Script>
        <Script id="ym-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              var stored = window.localStorage.getItem('ym-theme');
              var theme = stored === 'light' || stored === 'dark'
                ? stored
                : 'light';
              document.documentElement.dataset.theme = theme;
            })();
          `}
        </Script>
        {gaMeasurementId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="ym-ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', {
                  anonymize_ip: true
                });
              `}
            </Script>
          </>
        ) : null}
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}
