import type { ReactNode } from "react";

type PageHeaderProps = {
  label?: string;
  /**
   * A breadcrumb trail, shown above the title. With a `label` it keeps its
   * own line and the label becomes the context under it -- the family a
   * service belongs to, the sector a case is in -- so the trail stays the
   * only path on the page.
   */
  breadcrumb?: ReactNode;
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
  breadcrumb,
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
              <HeaderLabels breadcrumb={breadcrumb} label={label} />
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
            <HeaderLabels breadcrumb={breadcrumb} label={label} />
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

/**
 * The lines above the title: the trail, and under it the short context the
 * page sits in. The context is plain text, never a link -- "Websites en
 * webshops" and "Aanbouw en renovatie" are groupings, not pages -- so it is
 * set a shade lighter than the trail and stays outside its navigation.
 */
function HeaderLabels({
  breadcrumb,
  label,
}: {
  breadcrumb?: ReactNode;
  label?: string;
}) {
  if (!breadcrumb) {
    return label ? <p className="label-mono mb-4">{label}</p> : null;
  }

  return (
    <div className="mb-4">
      {breadcrumb}
      {label ? <p className="label-mono mt-1.5 text-faint">{label}</p> : null}
    </div>
  );
}
