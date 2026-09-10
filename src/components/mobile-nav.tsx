"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import BrandMark from "@/components/brand-mark";
import type { NavigationItem } from "@/components/site-header";

type MobileNavProps = {
  navigation: NavigationItem[];
  homeHref: string;
  counterpartPath: string;
  alternateLocaleLabel: string;
  contactHref: string;
  contactLabel: string;
  menuLabel: string;
  closeLabel: string;
};

/**
 * Locks page scrolling while the menu is open. `overflow: hidden` on the body
 * is not enough here: the root element clips horizontally, so body overflow
 * never reaches the viewport, and iOS Safari keeps touch-scrolling the
 * document regardless. Fixing the body at its current offset works in both
 * cases; the offset is restored on unlock unless the route changed meanwhile.
 */
function lockPageScroll(): () => void {
  const { body, documentElement: html } = document;
  const scrollY = window.scrollY;
  const scrollbarWidth = window.innerWidth - html.clientWidth;
  const lockedPath = window.location.pathname;
  const previous = {
    htmlOverflow: html.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `${-scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  return () => {
    html.style.overflow = previous.htmlOverflow;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.width = previous.width;
    body.style.paddingRight = previous.paddingRight;

    if (window.location.pathname === lockedPath) {
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);
      html.style.scrollBehavior = previousBehavior;
    }
  };
}

export default function MobileNav({
  navigation,
  homeHref,
  counterpartPath,
  alternateLocaleLabel,
  contactHref,
  contactLabel,
  menuLabel,
  closeLabel,
}: MobileNavProps) {
  const pathname = usePathname();
  // The menu remembers the route it was opened on, so a route change while it
  // is open (back/forward) closes it without an extra effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);
  const panelId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const openButton = openButtonRef.current;
    const unlock = lockPageScroll();
    closeButtonRef.current?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedOn(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlock();
      if (openButton?.isConnected) {
        openButton.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={openButtonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className="-mr-2 inline-flex min-h-11 items-center gap-3 px-2 text-[0.95rem] font-medium text-ink"
      >
        <span>{menuLabel}</span>
        <span aria-hidden="true" className="relative block h-3 w-5">
          <span className="absolute left-0 top-0 block h-px w-5 bg-ink" />
          <span className="absolute bottom-0 left-0 block h-px w-5 bg-ink" />
        </span>
      </button>

      {/*
        Full-viewport overlay: a top bar that never scrolls, a scrollable list
        of links, and the actions pinned at the bottom. Safe-area insets keep
        the bar and the actions clear of the notch and home indicator.
      */}
      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-0 z-50 flex h-dvh flex-col bg-paper transition-[opacity,transform] duration-300 ease-out ${
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex-none border-b border-line bg-paper pt-[env(safe-area-inset-top)]">
          <div className="container-x flex h-16 items-center justify-between gap-6">
            <BrandMark
              href={homeHref}
              className="h-8 w-[112px] sm:h-9 sm:w-[124px]"
            />
            <button
              ref={closeButtonRef}
              type="button"
              aria-controls={panelId}
              onClick={() => setOpen(false)}
              className="-mr-2 inline-flex min-h-11 items-center gap-3 px-2 text-[0.95rem] font-medium text-ink"
            >
              <span>{closeLabel}</span>
              <span aria-hidden="true" className="relative block h-3 w-5">
                <span className="absolute left-0 top-0 block h-px w-5 translate-y-[5.5px] rotate-45 bg-ink" />
                <span className="absolute bottom-0 left-0 block h-px w-5 -translate-y-[5.5px] -rotate-45 bg-ink" />
              </span>
            </button>
          </div>
        </div>

        <nav className="container-x min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={item.active ? "page" : undefined}
              className={`flex min-h-14 items-center justify-between border-b border-line text-[1.35rem] font-medium tracking-[-0.01em] ${
                item.active ? "text-accent" : "text-ink"
              }`}
            >
              {item.label}
              <span aria-hidden="true" className="text-faint">
                →
              </span>
            </Link>
          ))}
        </nav>

        <div className="container-x flex-none space-y-4 bg-paper py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <Link
            href={contactHref}
            onClick={() => setOpen(false)}
            data-track-event="contact_cta_click"
            data-track-category="navigation"
            data-track-label={contactLabel}
            data-track-location="mobile-menu"
            className="flex min-h-12 items-center justify-center rounded-sm bg-ink px-5 text-[1rem] font-medium text-paper"
          >
            {contactLabel}
          </Link>
          <Link
            href={counterpartPath}
            onClick={() => setOpen(false)}
            className="label-mono block py-2 text-center"
          >
            {alternateLocaleLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
