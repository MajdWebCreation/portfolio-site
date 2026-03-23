"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/content/site-content";

type PersistentCtaProps = {
  locale: Locale;
  currentPath: string;
  href: string;
};

function shouldShowForPath(pathname: string) {
  return (
    pathname.includes("/services") ||
    pathname.includes("/diensten") ||
    pathname.includes("/pricing") ||
    pathname.includes("/tarieven") ||
    pathname.includes("/projects") ||
    pathname.includes("/projecten")
  );
}

export default function PersistentCta({
  locale,
  currentPath,
  href,
}: PersistentCtaProps) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);

  const isEligible = useMemo(() => shouldShowForPath(currentPath), [currentPath]);

  useEffect(() => {
    if (!isEligible) {
      return;
    }

    const onScroll = () => {
      setHasScrolled(window.scrollY > 280);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [isEligible]);

  useEffect(() => {
    if (!isEligible) {
      return;
    }

    const footer = document.querySelector("footer");

    if (!footer) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setFooterVisible(entry.isIntersecting);
      },
      {
        rootMargin: "0px 0px -120px 0px",
      },
    );

    observer.observe(footer);

    return () => {
      observer.disconnect();
    };
  }, [isEligible]);

  if (!isEligible) {
    return null;
  }

  const title =
    locale === "nl" ? "Vraag advies" : "Get advice";
  const support =
    locale === "nl"
      ? "Twijfel je over het juiste niveau?"
      : "Not sure which level fits?";
  const hiddenState =
    !hasScrolled || footerVisible
      ? "pointer-events-none translate-y-4 opacity-0"
      : "translate-y-0 opacity-100";

  return (
    <>
      <div
        className={`fixed inset-x-4 bottom-4 z-40 transition duration-300 md:hidden ${hiddenState}`}
      >
        <Link
          href={href}
          data-track-event="contact_cta_click"
          data-track-category="persistent-cta"
          data-track-label={title}
          data-track-location="mobile-floating-cta"
          className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-white/12 bg-[rgba(8,13,20,0.86)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/72">
              {support}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-white">
              {title}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
            {title}
          </span>
        </Link>
      </div>

      <div
        className={`fixed bottom-6 right-6 z-40 hidden transition duration-300 md:block ${hiddenState}`}
      >
        <Link
          href={href}
          data-track-event="contact_cta_click"
          data-track-category="persistent-cta"
          data-track-label={title}
          data-track-location="desktop-floating-cta"
          className="block rounded-[1.45rem] border border-white/12 bg-[rgba(8,13,20,0.82)] px-5 py-4 shadow-[0_20px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl"
        >
          <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/72">
            {support}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-medium text-white">{title}</span>
            <span className="text-cyan-200">→</span>
          </div>
        </Link>
      </div>
    </>
  );
}
