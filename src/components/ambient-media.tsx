import Image from "next/image";

type AmbientMediaProps = {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  overlayClassName?: string;
  imageClassName?: string;
};

export default function AmbientMedia({
  src,
  alt,
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 42vw, 100vw",
  overlayClassName = "",
  imageClassName = "",
}: AmbientMediaProps) {
  return (
    <div
      className={`ym-surface ym-hairline ym-panel-glow relative overflow-hidden rounded-[2rem] ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(113,227,255,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_36%)]" />
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={`object-cover object-center ${imageClassName}`}
      />
      <div
        className={`absolute inset-0 bg-[linear-gradient(180deg,rgba(2,5,8,0.05),rgba(2,5,8,0.5)_55%,rgba(2,5,8,0.88))] ${overlayClassName}`}
      />
    </div>
  );
}

