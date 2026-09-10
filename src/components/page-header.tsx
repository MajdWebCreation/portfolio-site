import type { ReactNode } from "react";

type PageHeaderProps = {
  label?: string;
  title: string;
  intro?: string;
  children?: ReactNode;
  /** A drawing next to the title; the intro then stays short and sits under the title. */
  visual?: ReactNode;
};

/**
 * Opening block of a sub page on a tinted band: short label, large title,
 * one paragraph and optional actions. With a visual, the title and a short
 * line sit on the left and the visual takes the right half.
 */
export default function PageHeader({
  label,
  title,
  intro,
  children,
  visual,
}: PageHeaderProps) {
  if (visual) {
    return (
      <div className="border-b border-line bg-paper-deep">
        <div className="container-x pb-10 pt-10 sm:pt-14 lg:pb-12 lg:pt-14">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="lg:col-span-7 xl:col-span-6">
              {label ? <p className="label-mono mb-4">{label}</p> : null}
              <h1 className="display-lg">{title}</h1>
              {intro ? <p className="lede mt-5 max-w-[28rem]">{intro}</p> : null}
              {children ? <div className="mt-6">{children}</div> : null}
            </div>
            <div className="w-full max-w-[32rem] sm:ml-auto lg:col-span-5 lg:max-w-none xl:col-span-6">
              {visual}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-line bg-paper-deep">
      <div className="container-x pb-12 pt-12 sm:pt-16 lg:pb-16 lg:pt-20">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            {label ? <p className="label-mono mb-4">{label}</p> : null}
            <h1 className="display-lg">{title}</h1>
          </div>
          {intro || children ? (
            <div className="lg:col-span-5 lg:pt-2">
              {intro ? <p className="lede reading">{intro}</p> : null}
              {children ? <div className="mt-6">{children}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
