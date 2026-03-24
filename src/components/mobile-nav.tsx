"use client";

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
    <div className="flex shrink-0 items-center gap-2 md:hidden">
      <Link
        href={contactHref}
        data-track-event="contact_cta_click"
        data-track-category="navigation"
        data-track-label={contactLabel}
        data-track-location="mobile-header"
        className="inline-flex h-12 max-w-[9.75rem] min-w-0 shrink items-center justify-center whitespace-nowrap rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-4 text-[13px] font-medium leading-none text-[var(--button-text)] transition hover:opacity-92 sm:h-14 sm:max-w-none sm:px-5 sm:text-[15px]"
        onClick={() => setMobileMenuOpen(false)}
      >
        {contactLabel}
      </Link>

      <button
        type="button"
        aria-label="Toggle menu"
        onClick={() => setMobileMenuOpen((prev) => !prev)}
        className="relative z-[60] flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)]/92 sm:h-14 sm:w-14"
      >
        <div className="flex flex-col gap-1.5">
          <span
            className={`block h-px w-5 bg-[var(--foreground)] transition ${
              mobileMenuOpen ? "translate-y-[7px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-[var(--foreground)] transition ${
              mobileMenuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-[var(--foreground)] transition ${
              mobileMenuOpen ? "-translate-y-[7px] -rotate-45" : ""
            }`}
          />
        </div>
      </button>

      <div
        className={`fixed inset-0 z-40 transition duration-200 md:hidden ${
          mobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-[rgba(17,32,50,0.18)] backdrop-blur-[2px]"
          onClick={() => setMobileMenuOpen(false)}
        />
      </div>

      <div
        className={`fixed inset-x-4 top-[84px] z-50 max-h-[calc(100vh-100px)] overflow-y-auto rounded-[1.75rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/96 p-4 shadow-[0_24px_54px_rgba(36,60,84,0.12)] backdrop-blur-md transition duration-200 md:hidden sm:top-[88px] sm:max-h-[calc(100vh-104px)] ${
          mobileMenuOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-3 scale-[0.985] opacity-0"
        }`}
      >
        <div className="mb-5 flex rounded-full border border-[color:var(--line)] bg-[var(--background)]/72 p-1">
          <Link
            href={currentPath}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 rounded-full bg-[var(--foreground)] px-3 py-2 text-center text-xs font-medium text-[var(--background-elevated)] transition"
          >
            {currentLocaleLabel}
          </Link>
          <Link
            href={counterpartPath}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 rounded-full px-3 py-2 text-center text-xs font-medium text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
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
              className="border-b border-[color:var(--line)] px-4 py-4 text-base font-medium text-[var(--foreground)] transition hover:text-[var(--accent-text)]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
