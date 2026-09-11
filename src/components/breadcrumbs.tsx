import Link from "next/link";
import { breadcrumbLabel, type Crumb } from "@/lib/content/breadcrumbs";
import type { Locale } from "@/lib/content/site-content";

type BreadcrumbsProps = {
  locale: Locale;
  items: Crumb[];
  className?: string;
};

/**
 * The trail above a page title: the same small mono label the page headers
 * use, set as a list of links.
 *
 * The last crumb is the page itself and is not a link -- there is nowhere for
 * it to go -- so it is marked `aria-current="page"` instead. The row wraps
 * rather than scrolls, which keeps a long article title inside the column on a
 * phone. The separators are decorative and hidden from assistive technology,
 * so the trail is read as a plain list of destinations.
 */
export default function Breadcrumbs({ locale, items, className = "" }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  const trail = items.slice(0, -1);
  const current = items[items.length - 1];

  return (
    <nav aria-label={breadcrumbLabel[locale]} className={className}>
      <ol className="label-mono flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((crumb) => (
          <li key={crumb.path} className="flex items-center gap-x-2">
            <Link href={crumb.path} className="transition-colors hover:text-ink">
              {crumb.name}
            </Link>
            <span aria-hidden="true" className="text-faint">
              /
            </span>
          </li>
        ))}
        <li className="text-ink">
          <span aria-current="page">{current.name}</span>
        </li>
      </ol>
    </nav>
  );
}
