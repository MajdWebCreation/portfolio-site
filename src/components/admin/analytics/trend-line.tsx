import type { DailyPoint } from "@/lib/admin/analytics/types";

/**
 * A count per day (sessions, or search clicks), this period over the one before it, as one small
 * inline SVG. The previous period is drawn on the same x axis by position
 * in the period (day 1 to day n), not by date, so the two lines compare
 * like with like. No library: two polylines and a baseline.
 */
const W = 640;
const H = 120;
const PAD = 6;

function path(points: DailyPoint[], max: number): string {
  if (points.length === 0) return "";
  const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  return points
    .map((point, index) => {
      const x = PAD + index * stepX;
      const y = H - PAD - (max > 0 ? (point.value / max) * (H - PAD * 2) : 0);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function TrendLine({
  current,
  previous,
  label,
  unit = "sessies",
}: {
  current: DailyPoint[];
  previous: DailyPoint[];
  label: string;
  /** Plural noun for the counted thing, in the accessible label and the caption. */
  unit?: string;
}) {
  const max = Math.max(1, ...current.map((p) => p.value), ...previous.map((p) => p.value));
  const total = current.reduce((sum, p) => sum + p.value, 0);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${total} ${unit} in deze periode, per dag`} className="block h-auto w-full max-w-full">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-line" strokeWidth="1" />
        <path d={path(previous, max)} fill="none" className="stroke-line-strong" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d={path(current, max)} fill="none" className="stroke-accent" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 text-[0.8rem] text-muted">
        <span>
          <span aria-hidden="true" className="mr-1.5 inline-block h-[2px] w-4 bg-accent align-middle" />
          Deze periode
        </span>
        <span>
          <span aria-hidden="true" className="mr-1.5 inline-block h-[2px] w-4 border-t border-dashed border-line-strong align-middle" />
          Vorige periode
        </span>
        <span>
          Piek {max} {unit} op een dag
        </span>
      </figcaption>
    </figure>
  );
}
