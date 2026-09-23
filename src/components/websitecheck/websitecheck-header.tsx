import BrandMark from "@/components/brand-mark";
import { getLocalizedPath } from "@/lib/content/routes";
import { businessInfo } from "@/lib/content/site-content";

/**
 * The header of a campaign landing page: the wordmark and a way to call,
 * nothing to browse to. A visitor from an ad came for one thing; the site's
 * navigation would only offer detours before it. The footer below the page
 * keeps the full navigation and the legal links.
 */
export default function WebsitecheckHeader() {
  return (
    <header className="bg-paper-deep">
      <div className="container-x flex h-16 items-center justify-between gap-6 lg:h-[4.5rem]">
        <BrandMark href={getLocalizedPath("nl", "home")} priority className="h-8 w-[112px] sm:h-9 sm:w-[124px]" />
        <a href={`tel:${businessInfo.phone}`} className="link-static tabular text-[0.95rem] text-ink">
          {businessInfo.phoneDisplay}
        </a>
      </div>
    </header>
  );
}
