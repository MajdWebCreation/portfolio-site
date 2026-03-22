import type { ReactNode } from "react";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
  children?: ReactNode;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  as = "h2",
  children,
}: SectionHeadingProps) {
  const alignment = align === "center" ? "text-center items-center" : "";
  const HeadingTag = as;

  return (
    <div className={`flex flex-col ${alignment}`}>
      {eyebrow ? (
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
          {eyebrow}
        </p>
      ) : null}
      <HeadingTag className="max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
        {title}
      </HeadingTag>
      {description ? (
        <p className="mt-6 max-w-3xl text-base leading-8 text-white/65 sm:text-lg">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}
