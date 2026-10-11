import type { Metadata } from "next";
import { grotesk, mono } from "@/app/fonts";
import "../globals.css";

/**
 * Root layout of the customer portal: a third root next to the public site
 * and the admin. Like the admin it carries no marketing header, no locale,
 * no consent layer and no analytics, Google, Clarity or Meta script of any
 * kind -- a signed-in customer's pages are nobody's audience -- and it is
 * never indexed. Access is decided in the (shell) layout and in every page.
 */
export const metadata: Metadata = {
  title: {
    default: "Klantportaal",
    template: "%s · Klantportaal YM Creations",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="bg-paper text-body">{children}</body>
    </html>
  );
}
