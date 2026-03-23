"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

type NavigationItem = {
  href: string;
  label: string;
};

type MobileNavProps = {
  currentPath: string;
  counterpartPath: string;
  currentLocaleLabel: string;
  alternateLocaleLabel: string;
  contactHref: string;
  contactLabel: string;
  navigation: NavigationItem[];
};

export default function MobileNav({
  currentPath,
  counterpartPath,
  currentLocaleLabel,
  alternateLocaleLabel,
  contactHref,
  contactLabel,
  navigation,
}: MobileNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="flex items-center gap-2 md:hidden">
      <Link
        href={contactHref}
        data-track-event="contact_cta_click"
        data-track-category="navigation"
        data-track-label={contactLabel}
        data-track-location="mobile-header"
        className="inline-flex h-14 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] px-5 text-[15px] font-medium text-white shadow-[0_0_30px_rgba(53,180,255,0.1)] transition hover:border-cyan-400/50"
        onClick={() => setMobileMenuOpen(false)}
      >
        {contactLabel}
      </Link>

      <button
        type="button"
        aria-label="Toggle menu"
        onClick={() => setMobileMenuOpen((prev) => !prev)}
        className="relative z-[60] flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45"
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

      <motion.div
        initial={false}
        animate={{
          opacity: mobileMenuOpen ? 1 : 0,
          pointerEvents: mobileMenuOpen ? "auto" : "none",
        }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 md:hidden"
      >
        <div
          className="absolute inset-0 bg-[rgba(2,4,6,0.78)] backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      </motion.div>

      <motion.div
        initial={false}
        animate={{
          opacity: mobileMenuOpen ? 1 : 0,
          y: mobileMenuOpen ? 0 : -12,
          scale: mobileMenuOpen ? 1 : 0.985,
          pointerEvents: mobileMenuOpen ? "auto" : "none",
        }}
        transition={{ duration: 0.22 }}
        className="fixed inset-x-4 top-[88px] z-50 max-h-[calc(100vh-104px)] overflow-y-auto rounded-[1.75rem] border border-white/12 bg-[rgba(5,8,12,0.96)] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl md:hidden"
      >
        <div className="mb-5 flex rounded-full border border-white/10 bg-black/50 p-1">
          <Link
            href={currentPath}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 rounded-full bg-white px-3 py-2 text-center text-xs font-medium text-black transition"
          >
            {currentLocaleLabel}
          </Link>
          <Link
            href={counterpartPath}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 rounded-full px-3 py-2 text-center text-xs font-medium text-white/78 transition hover:text-white"
          >
            {alternateLocaleLabel}
          </Link>
        </div>

        <div className="flex flex-col">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className="border-b border-white/8 px-4 py-4 text-base font-medium text-white/92 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}