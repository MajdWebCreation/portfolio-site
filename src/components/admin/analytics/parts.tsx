import type { Comparison } from "@/lib/admin/analytics/types";

/**
 * The small pieces every analytics block uses: numbers in Dutch, a dash
 * for "no data" (never a zero that was not reported), and the change
 * against the previous period.
 */
const nl = new Intl.NumberFormat("nl-NL");
const decimal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });
const signed = new Intl.NumberFormat("nl-NL", { signDisplay: "exceptZero" });

export function num(value: number | null): string {
  return value === null ? "—" : nl.format(value);
}

export function pct(value: number | null): string {
  return value === null ? "—" : percent.format(value);
}

export function dec(value: number | null): string {
  return value === null ? "—" : decimal.format(value);
}

export function signedNum(value: number): string {
  return signed.format(value);
}

export function signedPct(value: number): string {
  return signedPercent.format(value);
}

export function Delta({ comparison }: { comparison: Comparison }) {
  if (comparison.delta === null) return <span className="text-faint">geen vergelijking</span>;
  const tone = comparison.delta > 0 ? "text-success" : comparison.delta < 0 ? "text-danger" : "text-muted";
  return <span className={tone}>{signedPercent.format(comparison.delta)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.92rem] text-muted">{children}</p>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[0.82rem] text-muted">{children}</p>;
}
