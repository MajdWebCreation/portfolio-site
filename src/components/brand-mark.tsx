import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  className?: string;
  priority?: boolean;
  label?: string;
  variant?: "theme" | "dark" | "light";
  assetSet?: "png" | "svg";
};

export default function BrandMark({
  href,
  className = "",
  priority = false,
  label = "YM Creations",
  variant = "theme",
  assetSet = "png",
}: BrandMarkProps) {
  const darkSrc =
    assetSet === "svg"
      ? "/images/branding/logo-black.svg"
      : "/images/branding/ym-logo-black.png";
  const lightSrc =
    assetSet === "svg"
      ? "/images/branding/logo.svg"
      : "/images/branding/ym-logo-white.png";

  const logo = (
    <div
      data-logo-variant={variant}
      className={`relative block h-11 w-[184px] shrink-0 overflow-hidden ${className}`}
    >
      <Image
        src={darkSrc}
        alt={label}
        fill
        priority={priority}
        className={`ym-logo-image ym-logo-image-dark object-contain ${
          assetSet === "png" ? "scale-[1.12]" : ""
        }`}
        sizes="(min-width: 1024px) 230px, (min-width: 640px) 220px, 200px"
      />
      <Image
        src={lightSrc}
        alt=""
        aria-hidden="true"
        fill
        priority={priority}
        className={`ym-logo-image ym-logo-image-light object-contain ${
          assetSet === "png" ? "scale-[1.12]" : ""
        }`}
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
