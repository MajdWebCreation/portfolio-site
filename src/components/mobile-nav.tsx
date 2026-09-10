"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { NavigationItem } from "@/components/site-header";

type MobileNavProps = {
  navigation: NavigationItem[];
  counterpartPath: string;
  alternateLocaleLabel: string;
  contactHref: string;
  contactLabel: string;
  menuLabel: string;
  closeLabel: string;
};

export default function MobileNav({
  navigation,
  counterpartPath,
  alternateLocaleLabel,
  contactHref,
  contactLabel,
  menuLabel,
  closeLabel,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative z-50 -mr-2 inline-flex min-h-11 items-center gap-3 px-2 text-[0.95rem] font-medium text-ink"
      >
        <span>{open ? closeLabel : menuLabel}</span>
        <span aria-hidden="true" className="relative block h-3 w-5">
          <span
            className={`absolute left-0 top-0 block h-px w-5 bg-ink transition-transform duration-300 ${
              open ? "translate-y-[5.5px] rotate-45" : ""
            }`}
          />
          <span
            className={`absolute bottom-0 left-0 block h-px w-5 bg-ink transition-transform duration-300 ${
              open ? "-translate-y-[5.5px] -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      <div
        id={panelId}
        aria-hidden={!open}
        className={`fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto border-t border-line bg-paper transition-[opacity,transform] duration-300 ease-out ${
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <nav className="container-x flex flex-1 flex-col pt-4">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={item.active ? "page" : undefined}
              className={`flex min-h-14 items-center justify-between border-b border-line text-[1.35rem] font-medium tracking-[-0.01em] ${
                item.active ? "text-accent" : "text-ink"
              }`}
              tabIndex={open ? 0 : -1}
            >
              {item.label}
              <span aria-hidden="true" className="text-faint">
                →
              </span>
            </Link>
          ))}

          <div className="mt-auto space-y-4 py-8">
            <Link
              href={contactHref}
              onClick={() => setOpen(false)}
              data-track-event="contact_cta_click"
              data-track-category="navigation"
              data-track-label={contactLabel}
              data-track-location="mobile-menu"
              className="flex min-h-12 items-center justify-center rounded-sm bg-ink px-5 text-[1rem] font-medium text-paper"
              tabIndex={open ? 0 : -1}
            >
              {contactLabel}
            </Link>
            <Link
              href={counterpartPath}
              onClick={() => setOpen(false)}
              className="label-mono block py-2 text-center"
              tabIndex={open ? 0 : -1}
            >
              {alternateLocaleLabel}
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
