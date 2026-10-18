"use client";

import { useEffect, useState } from "react";
import type { ServiceKey } from "@/lib/content/services";

export type LandingActionBarLabels = {
  call: string;
  whatsapp: string;
  request: string;
};

type LandingActionBarProps = {
  serviceKey: ServiceKey;
  /** The form card the primary action scrolls to. */
  requestHref: string;
  telHref: string;
  whatsappHref: string;
  labels: LandingActionBarLabels;
};

/**
 * The three ways to get in touch, fixed at the bottom of the screen on a
 * phone, for the long middle of the landing page.
 *
 * It appears once the header's own call to action has scrolled off the top
 * and goes away as soon as the enquiry band comes into view, so it never
 * sits on top of the form it points to. It is not rendered at all on wide
 * screens, where the header stays in reach. Nothing in it is new: the
 * number, the WhatsApp link and the form are the page's own, repeated where
 * the thumb is.
 *
 * The phone and WhatsApp links are measured by the site's click delegation
 * (a `contact_click` with this placement); the form link is a service CTA
 * like the one in the header.
 */
export default function LandingActionBar({
  serviceKey,
  requestHref,
  telHref,
  whatsappHref,
  labels,
}: LandingActionBarProps) {
  const [passedHero, setPassedHero] = useState(false);
  const [reachedContact, setReachedContact] = useState(false);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const hero = document.querySelector<HTMLElement>("[data-landing-cta]");
    const contact = document.querySelector<HTMLElement>("#contact");
    if (!hero || !contact) return;

    const heroObserver = new IntersectionObserver(([entry]) => {
      /* Off the top of the screen, not merely out of view below it. */
      setPassedHero(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    const contactObserver = new IntersectionObserver(([entry]) => {
      setReachedContact(entry.isIntersecting || entry.boundingClientRect.top < 0);
    });
    heroObserver.observe(hero);
    contactObserver.observe(contact);

    return () => {
      heroObserver.disconnect();
      contactObserver.disconnect();
    };
  }, []);

  const visible = passedHero && !reachedContact;
  const secondary =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-[0.92rem] font-medium text-ink";

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-sm transition-transform duration-300 ease-out lg:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="container-x flex items-center gap-2 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        {/* The phone as an icon with its name for assistive technology: the word would push the form button onto two lines on a narrow phone. */}
        <a href={telHref} aria-label={labels.call} className={`${secondary} w-12 shrink-0`} data-track-placement="action_bar">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[1.15rem] w-[1.15rem]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.2 3.5h3l1.4 3.4-1.8 1.3a9.5 9.5 0 0 0 4.9 4.9l1.3-1.8 3.4 1.4v3a1.5 1.5 0 0 1-1.6 1.5A13.5 13.5 0 0 1 2.7 5.1a1.5 1.5 0 0 1 1.5-1.6Z" />
          </svg>
        </a>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${secondary} shrink-0`}
          data-track-placement="action_bar"
        >
          {labels.whatsapp}
        </a>
        <a
          href={requestHref}
          className="inline-flex min-h-12 flex-1 items-center justify-center whitespace-nowrap rounded-sm bg-ink px-3.5 text-[0.92rem] font-medium text-paper"
          data-track-event="service_cta_click"
          data-track-service-id={serviceKey}
          data-track-cta-id="service_action_bar_contact"
          data-track-cta-target="contact"
          data-track-placement="action_bar"
        >
          {labels.request}
        </a>
      </div>
    </div>
  );
}
