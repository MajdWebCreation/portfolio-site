import type { Metadata } from "next";
import { grotesk, mono } from "@/app/fonts";
import "../globals.css";

/**
 * Root layout of the internal admin. It is a second root layout next to the
 * localized public site: no marketing header or footer, no locale, no
 * analytics, and never indexed. Access is decided in the (shell) layout.
 */
export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · YM Admin",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${grotesk.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
