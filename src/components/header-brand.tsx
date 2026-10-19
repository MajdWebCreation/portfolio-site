"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HeaderBrandProps = {
  href: string;
  label?: string;
  className?: string;
};

/* Scroll positions in px: two thresholds so the logo does not flicker around one point. */
const COMPACT_FROM = 24;
const FULL_BELOW = 8;

/**
 * The wordmark in the site header. At the top of the page it is the full
 * logo; once the visitor scrolls down, "creations" fades out and the YM
 * settles into the middle of the bar, and it comes back at the top.
 *
 * The SVG is the same drawing as logo-black.svg, inline so the two parts can
 * move separately. Without JavaScript the full logo stays.
 */
export default function HeaderBrand({ href, label = "YM Creations", className = "h-9 w-[124px]" }: HeaderBrandProps) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setCompact((current) => (current ? y > FULL_BELOW : y > COMPACT_FROM));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Link href={href} aria-label={label} className="inline-flex items-center">
      <svg
        aria-hidden="true"
        viewBox="200 280 620 430"
        className={`block shrink-0 ${className}`}
        preserveAspectRatio="xMinYMid meet"
      >
        {/* Centred in the box when "creations" is gone: the YM's middle (432) moves to the box's middle (495). */}
        <g
          fill="#112032"
          className="transition-transform duration-300 ease-out"
          style={{ transform: compact ? "translateY(63px)" : "none" }}
        >
          <path d="M236 308h64l76 108 76-108h30L388 440v116h-56V440L236 308Z" />
          <path d="M508 308h90l48 96 74-96h54v248h-52V350l-90 198h-2l-96-198v206h-26V308Z" />
        </g>
        <text
          x="512"
          y="662"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="74"
          fontWeight="300"
          letterSpacing="0.24em"
          fill="#112032"
          className="transition-[opacity,transform] duration-200 ease-out"
          style={{ opacity: compact ? 0 : 1, transform: compact ? "translateY(-24px)" : "none" }}
        >
          creations
        </text>
      </svg>
    </Link>
  );
}
