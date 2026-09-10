import type { ButtonHTMLAttributes } from "react";

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

const base =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm px-4 text-[0.92rem] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45";

const variants = {
  primary: `${base} bg-ink text-paper hover:bg-accent disabled:hover:bg-ink`,
  secondary: `${base} border border-line-strong bg-transparent text-ink hover:border-ink disabled:hover:border-line-strong`,
} as const;

/** Button counterpart of CtaLink for real actions (forms, local edits). */
export default function AdminButton({ variant = "primary", className = "", type = "button", ...props }: AdminButtonProps) {
  return <button type={type} className={`${variants[variant]} ${className}`} {...props} />;
}
