"use client";

import Link from "next/link";
import { useRef } from "react";
import type { LocalizedService } from "@/lib/content/services";

type ServicesOverviewRailProps = {
  services: LocalizedService[];
  locale: "en" | "nl";
};

function getCompactIntro(service: LocalizedService) {
  const firstSentence = service.intro.split(". ")[0]?.trim();
  if (!firstSentence) return service.intro;
  return firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
}

function getCompactFit(service: LocalizedService) {
  const firstFit = service.suitableFor[0]?.trim();
  if (!firstFit) return "";
  return firstFit.length > 88 ? `${firstFit.slice(0, 85).trim()}...` : firstFit;
}

export default function ServicesOverviewRail({
  services,
  locale,
}: ServicesOverviewRailProps) {
  const railRef = useRef<HTMLDivElement | null>(null);

  function scrollByCard(direction: "prev" | "next") {
    const rail = railRef.current;
    if (!rail) return;

    const amount = Math.min(rail.clientWidth * 0.86, 420);
    rail.scrollBy({
      left: direction === "next" ? amount : -amount,
      behavior: "smooth",
    });
  }

  return (
    <section className="border-t border-[color:var(--line)] pt-8">
      <div className="flex items-end justify-between gap-4">
        <div className="max-w-lg">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
            {locale === "nl" ? "Verken meer richtingen" : "Explore more directions"}
          </p>
          <h2 className="mt-4 text-2xl font-semibold leading-tight text-[var(--foreground)] sm:text-3xl">
            {locale === "nl"
              ? "Verken de overige services zonder alles tegelijk te zien."
              : "Browse the remaining services without seeing everything at once."}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
            {locale === "nl"
              ? "Swipe op mobiel of gebruik de pijlen op grotere schermen."
              : "Swipe on mobile or use the arrows on larger screens."}
          </p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => scrollByCard("prev")}
            aria-label={locale === "nl" ? "Vorige services" : "Previous services"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] text-[color:var(--muted-foreground)] transition hover:border-[color:var(--line-strong)] hover:text-[var(--foreground)]"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scrollByCard("next")}
            aria-label={locale === "nl" ? "Volgende services" : "Next services"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] text-[color:var(--muted-foreground)] transition hover:border-[color:var(--line-strong)] hover:text-[var(--foreground)]"
          >
            →
          </button>
        </div>
      </div>

      <div
        ref={railRef}
        className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {services.map((service) => (
          <Link
            key={service.path}
            href={service.path}
            data-track-event="service_cta_click"
            data-track-category="services-overview"
            data-track-label={service.navLabel}
            data-track-location="services-rail"
            className="group min-w-[84%] snap-start rounded-[1.8rem] border border-[color:var(--line)] bg-[var(--background-elevated)] p-5 shadow-[0_16px_30px_rgba(36,60,84,0.06)] transition hover:border-[color:var(--line-strong)] sm:min-w-[390px]"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                {service.icon}
              </p>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--muted-foreground)]">
                {locale === "nl" ? "Service" : "Service"}
              </p>
            </div>

            <h3 className="mt-5 max-w-sm text-xl font-medium leading-tight text-[var(--foreground)] sm:text-2xl">
              {service.navLabel}
            </h3>
            <p className="mt-3 max-w-md text-sm leading-7 text-[color:var(--muted-foreground)]">
              {getCompactIntro(service)}
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
              {locale === "nl" ? "Goede fit voor" : "Good fit for"}
            </p>
            <p className="mt-2 max-w-md text-sm leading-7 text-[color:var(--muted-foreground)]">
              {getCompactFit(service)}
            </p>

            <span className="mt-6 inline-flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] transition group-hover:text-[var(--foreground)]">
              {locale === "nl" ? "Bekijk dienst" : "View service"}
              <span className="text-[var(--accent-text)] transition group-hover:translate-x-1">→</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-xs text-[color:var(--muted-foreground)] md:hidden">
        {locale === "nl" ? "Swipe om meer services te bekijken" : "Swipe to browse more services"}
      </p>
    </section>
  );
}
