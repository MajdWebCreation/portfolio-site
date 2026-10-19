"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

type HeaderBrandProps = {
  href: string;
  label?: string;
  className?: string;
};

/* Scroll positions in px: two thresholds so the logo does not flicker around one point. */
const COMPACT_FROM = 24;
const FULL_BELOW = 8;

/*
  "creations" letter by letter, each at the x where the browser sets it in
  the full word (text-anchor middle at 512, letter-spacing 0.24em, weight
  400), so the word reads exactly as one line of text.
*/
const LETTERS = [
  ["c", 281.9],
  ["r", 336.7],
  ["e", 379.1],
  ["a", 438],
  ["t", 496.9],
  ["i", 535.3],
  ["o", 569.4],
  ["n", 628.4],
  ["s", 687.3],
] as const;

/* Pause between two letters, and how long the YM waits for the word in ms. */
const STEP = 32;
const WORD = LETTERS.length * STEP;

/**
 * The wordmark in the site header. At the top of the page it is the full
 * logo; once the visitor scrolls down, "creations" is taken back letter by
 * letter from the end, as if typed away, and the YM then settles into the
 * middle of the bar. Back at the top the YM rises first and the word is
 * typed out again from the first letter.
 *
 * The SVG is the drawing of logo-black.svg, inline so the parts can move
 * separately; "creations" is set one step heavier (400 instead of 300) so it
 * stays legible at header size. Without JavaScript the full logo stays, and
 * with reduced motion the logo switches without the sequence.
 */
export default function HeaderBrand({ href, label = "YM Creations", className = "h-10 w-[58px]" }: HeaderBrandProps) {
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

  const step = "transition-[opacity,transform] ease-out [transition-delay:var(--delay)] motion-reduce:[transition-delay:0ms]";

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
          className={`duration-300 ${step}`}
          style={
            {
              transform: compact ? "translateY(63px)" : "none",
              "--delay": compact ? `${WORD}ms` : "0ms",
            } as CSSProperties
          }
        >
          <path d="M236 308h64l76 108 76-108h30L388 440v116h-56V440L236 308Z" />
          <path d="M508 308h90l48 96 74-96h54v248h-52V350l-90 198h-2l-96-198v206h-26V308Z" />
        </g>
        <g fill="#112032" fontFamily="Helvetica, Arial, sans-serif" fontSize="74" fontWeight="400">
          {LETTERS.map(([letter, x], index) => (
            <text
              key={index}
              x={x}
              y="662"
              className={`duration-200 ${step}`}
              style={
                {
                  opacity: compact ? 0 : 1,
                  transform: compact ? "translateY(-18px)" : "none",
                  /* Away from the last letter; back from the first, once the YM is up. */
                  "--delay": compact
                    ? `${(LETTERS.length - 1 - index) * STEP}ms`
                    : `${200 + index * STEP}ms`,
                } as CSSProperties
              }
            >
              {letter}
            </text>
          ))}
        </g>
      </svg>
    </Link>
  );
}
