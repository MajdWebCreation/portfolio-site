import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  className?: string;
  priority?: boolean;
  label?: string;
  variant?: "transparent" | "white";
};

export default function BrandMark({
  href,
  className = "",
  priority = false,
  label = "YM Creations",
  variant = "transparent",
}: BrandMarkProps) {
  const logo = (
    <div className={`relative h-10 w-[120px] ${className}`}>
      <Image
        src={
          variant === "white"
            ? "/images/branding/ym-logo-white.png"
            : "/images/branding/ym-logo-transparent.png"
        }
        alt={label}
        fill
        priority={priority}
        className="object-contain"
        sizes="120px"
      />
    </div>
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
