"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";
import { getCounterpartPath, getLocalizedPath } from "@/lib/content/routes";

type SiteShellProps = {
  locale: Locale;
  content: SiteContent;
  children: React.ReactNode;
};

export function BlueprintBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.08),transparent_22%),linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:80px_80px] opacity-30" />

      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[-10%] top-[10%] h-[420px] w-[420px] rounded-full border border-cyan-300/10"
      />
      <motion.div
        animate={{ y: [0, 24, 0], x: [0, 12, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute right-[-6%] top-[18%] h-[520px] w-[520px] rounded-full border border-white/5"
      />
    </div>
  );
}

export default function SiteShell({
  locale,
  content,
  children,
}: SiteShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const alternateLocale = locale === "en" ? "nl" : "en";
  const currentLocalePath = pathname ?? getLocalizedPath(locale, "home");
  const counterpartPath = getCounterpartPath(
    currentLocalePath,
    locale,
    alternateLocale,
  );

  const navigation = [
    { href: getLocalizedPath(locale, "services"), label: content.nav.services },
    { href: getLocalizedPath(locale, "projects"), label: content.nav.projects },
    { href: getLocalizedPath(locale, "blog"), label: content.nav.blog },
    { href: `${getLocalizedPath(locale, "home")}#process`, label: content.nav.about },
    { href: getLocalizedPath(locale, "contact"), label: content.nav.contact },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <BlueprintBackground />

      <header className="relative z-30 border-b border-white/8 bg-black/55 backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
          <Link href={getLocalizedPath(locale, "home")} className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.9)]" />
            <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/90 sm:text-sm">
              {businessInfo.name}
            </span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="rounded-full border border-white/10 bg-white/5 p-1">
              <Link
                href={locale === "en" ? currentLocalePath : counterpartPath}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  locale === "en" ? "bg-white text-black" : "text-white/65 hover:text-white"
                }`}
              >
                EN
              </Link>
              <Link
                href={locale === "nl" ? currentLocalePath : counterpartPath}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  locale === "nl" ? "bg-white text-black" : "text-white/65 hover:text-white"
                }`}
              >
                NL
              </Link>
            </div>
            <Link
              href={getLocalizedPath(locale, "contact")}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
            >
              {content.nav.cta}
            </Link>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href={getLocalizedPath(locale, "contact")}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
            >
              {content.nav.cta}
            </Link>
            <button
              type="button"
              aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5"
            >
              <div className="flex flex-col gap-1.5">
                <span
                  className={`block h-px w-5 bg-white transition ${
                    mobileMenuOpen ? "translate-y-[7px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`block h-px w-5 bg-white transition ${
                    mobileMenuOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`block h-px w-5 bg-white transition ${
                    mobileMenuOpen ? "-translate-y-[7px] -rotate-45" : ""
                  }`}
                />
              </div>
            </button>
          </div>
        </nav>

        <motion.div
          initial={false}
          animate={{
            opacity: mobileMenuOpen ? 1 : 0,
            y: mobileMenuOpen ? 0 : -10,
            pointerEvents: mobileMenuOpen ? "auto" : "none",
          }}
          transition={{ duration: 0.22 }}
          className="absolute inset-x-4 top-full mt-2 rounded-[1.75rem] border border-white/10 bg-black/90 p-4 backdrop-blur-md md:hidden"
        >
          <div className="mb-4 flex rounded-full border border-white/10 bg-white/5 p-1">
            <Link
              href={currentLocalePath}
              onClick={() => setMobileMenuOpen(false)}
              className="flex-1 rounded-full px-3 py-2 text-center text-xs font-medium text-white/65 transition"
            >
              {content.localeLabel}
            </Link>
            <Link
              href={counterpartPath}
              onClick={() => setMobileMenuOpen(false)}
              className="flex-1 rounded-full px-3 py-2 text-center text-xs font-medium text-white/65 transition"
            >
              {alternateLocale.toUpperCase()}
            </Link>
          </div>
          <div className="flex flex-col">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-2xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </motion.div>
      </header>

      <main className="relative z-20">{children}</main>
    </div>
  );
}
