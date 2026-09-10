import Link from "next/link";
import type { ComponentProps } from "react";

type CtaLinkProps = ComponentProps<typeof Link> & {
  variant?: "primary" | "inverse" | "secondary" | "text" | "text-light";
  external?: boolean;
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-5 text-[0.95rem] font-medium transition-colors duration-200";

const variants = {
  primary: `${base} bg-ink text-paper hover:bg-accent`,
  inverse: `${base} bg-paper text-ink hover:bg-accent-soft`,
  secondary: `${base} border border-line-strong bg-transparent text-ink hover:border-ink`,
  text: "link-line inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-ink",
  "text-light":
    "link-line inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-paper",
} as const;

/**
 * Link styled as a button or as an inline text action. Text variants carry an
 * arrow so they read as actions without needing a button shape.
 */
export default function CtaLink({
  variant = "primary",
  external = false,
  className = "",
  children,
  ...props
}: CtaLinkProps) {
  const isText = variant === "text" || variant === "text-light";
  const externalProps = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Link className={`${variants[variant]} ${className}`} {...externalProps} {...props}>
      {children}
      {isText ? (
        <span aria-hidden="true" className="translate-y-px">
          {external ? "↗" : "→"}
        </span>
      ) : null}
    </Link>
  );
}
