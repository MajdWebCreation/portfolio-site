export type StatusTone = "neutral" | "accent" | "success" | "danger";

const tones: Record<StatusTone, string> = {
  neutral: "border-line text-muted",
  accent: "border-accent/40 text-accent",
  success: "border-success/40 text-success",
  danger: "border-danger/40 text-danger",
};

/**
 * Small mono status label with a hairline border. Colour only signals; the
 * text carries the meaning.
 */
export default function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`label-mono inline-flex items-center whitespace-nowrap rounded-xs border px-1.5 py-[3px] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
