import type { ComponentProps } from "react";
import { ctaVariants, type CtaVariant } from "@/components/cta-link";

type CtaButtonProps = ComponentProps<"button"> & {
  variant?: CtaVariant;
};

/**
 * A real `<button>` in the same clothes as `CtaLink`, for actions that are
 * not navigation: the consent choices, for one. Same variants, same class
 * strings, so the two never need reconciling.
 */
export default function CtaButton({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...props
}: CtaButtonProps) {
  return (
    <button type={type} className={`${ctaVariants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
