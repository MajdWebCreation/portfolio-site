import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  text?: string;
  action?: ReactNode;
};

/** Neutral placeholder for a view without content yet. */
export default function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <div className="rounded-sm border border-dashed border-line-strong px-5 py-10 text-center sm:py-14">
      <p className="text-[1.05rem] font-medium text-ink">{title}</p>
      {text ? <p className="mx-auto mt-2 max-w-[44ch] text-[0.95rem] text-muted">{text}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
