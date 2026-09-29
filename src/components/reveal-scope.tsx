"use client";

import { useEffect } from "react";

/**
 * Turns on the entrance of every `[data-reveal]` element on the page.
 *
 * The elements are visible by default: without JavaScript, or before this
 * runs, the page is complete. On mount, whatever is already in view is marked
 * as shown first, and only then is the hidden state switched on for the rest,
 * so nothing a visitor is looking at disappears. Each element is shown once,
 * when it scrolls into view, and is not hidden again.
 *
 * With reduced motion nothing is switched on at all.
 */
export default function RevealScope() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const root = document.documentElement;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        element.setAttribute("data-revealed", "");
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    for (const element of elements) {
      if (!element.hasAttribute("data-revealed")) observer.observe(element);
    }
    root.setAttribute("data-reveal-ready", "");

    return () => {
      observer.disconnect();
      root.removeAttribute("data-reveal-ready");
    };
  }, []);

  return null;
}
