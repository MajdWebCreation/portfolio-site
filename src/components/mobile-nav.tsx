"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

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

  return (
    <div className="flex items-center gap-2 md:hidden">
      <Link
        href={contactHref}
        data-track-event="contact_cta_click"
        data-track-category="navigation"
        data-track-label={contactLabel}
        data-track-location="mobile-header"
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
      >
        {contactLabel}
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
            href={currentPath}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 rounded-full px-3 py-2 text-center text-xs font-medium text-white/65 transition"
          >
            {currentLocaleLabel}
          </Link>
          <Link
            href={counterpartPath}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 rounded-full px-3 py-2 text-center text-xs font-medium text-white/65 transition"
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
              className="rounded-2xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
