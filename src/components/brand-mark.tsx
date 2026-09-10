import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  className?: string;
  priority?: boolean;
  label?: string;
  tone?: "dark" | "light";
};

/**
 * The YM Creations wordmark. `tone="dark"` renders the ink version for light
 * backgrounds, `tone="light"` the white version for ink backgrounds.
 */
export default function BrandMark({
  href,
  className = "h-9 w-[124px]",
  priority = false,
  label = "YM Creations",
  tone = "dark",
}: BrandMarkProps) {
  const src =
    tone === "light"
      ? "/images/branding/logo.svg"
      : "/images/branding/logo-black.svg";

  const logo = (
    <span className={`relative block shrink-0 ${className}`}>
      <Image
        src={src}
        alt={href ? "" : label}
        fill
        priority={priority}
        sizes="200px"
        className="object-contain object-left"
      />
    </span>
  );

  if (!href) {
    return logo;
  }

  return (
    <Link href={href} aria-label={label} className="inline-flex items-center">
      {logo}
    </Link>
  );
}
