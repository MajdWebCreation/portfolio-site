import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  label?: string;
  title: string;
  /** One line of context under the title. */
  text?: string;
  /** Actions on the right, e.g. a primary button. */
  actions?: ReactNode;
};

/** Opening of an admin page: eyebrow, h1, one context line, optional actions. */
export default function AdminPageHeader({
  label,
  title,
  text,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-2">
      <div className="min-w-0">
        {label ? <p className="label-mono mb-2">{label}</p> : null}
        <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[1.85rem]">
          {title}
        </h1>
        {text ? <p className="mt-1.5 max-w-[48ch] text-[0.95rem] text-muted">{text}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
