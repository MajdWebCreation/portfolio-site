import type { CSSProperties } from "react";

/**
 * Shared building blocks of the drafting illustrations (services, process,
 * pricing). The tone classes and the draw animation live in globals.css
 * under "Service hero sketch".
 */

export const fmt = (n: number) => String(Math.round(n * 10) / 10);

export const timing = (delay: number, duration?: number) =>
  ({
    "--d": `${delay}ms`,
    ...(duration ? { "--t": `${duration}ms` } : {}),
  }) as CSSProperties;

/* Rectangle and segment as path data, so they can be drawn like a line. */
export const rect = (x: number, y: number, w: number, h: number) =>
  `M${fmt(x)},${fmt(y)} h${fmt(w)} v${fmt(h)} h${fmt(-w)} Z`;
export const line = (x1: number, y1: number, x2: number, y2: number) =>
  `M${fmt(x1)},${fmt(y1)} L${fmt(x2)},${fmt(y2)}`;

/** A stroked path that draws itself after `delay`; static with reduced motion. */
export function Draw({
  d,
  tone,
  delay,
  duration = 400,
  fine,
}: {
  d: string;
  tone: string;
  delay: number;
  duration?: number;
  fine?: boolean;
}) {
  return (
    <path
      d={d}
      pathLength={1}
      className={`sk-draw ${tone}${fine ? " sk-fine" : ""}`}
      style={timing(delay, duration)}
    />
  );
}
