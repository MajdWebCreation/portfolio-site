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
    <div className={`relative block h-11 w-[184px] shrink-0 ${className}`}>
      <Image
        src="/images/branding/logo.svg"
        alt={label}
        fill
        priority={priority}
        className="object-contain"
        sizes="(min-width: 1024px) 230px, (min-width: 640px) 220px, 200px"
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
