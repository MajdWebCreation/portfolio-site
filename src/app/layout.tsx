import type { Metadata } from "next";
import { headers } from "next/headers";
import { businessInfo } from "@/lib/content/site-content";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(businessInfo.websiteUrl),
  title: {
    default: businessInfo.name,
    template: `%s | ${businessInfo.name}`,
  },
  description: "Premium web design and development.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const locale = headerStore.get("x-ym-locale") === "nl" ? "nl" : "en";

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
