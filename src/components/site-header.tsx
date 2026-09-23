import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import MobileNav from "@/components/mobile-nav";
import { getCounterpartPath, getLocalizedPath, type StaticRouteKey } from "@/lib/content/routes";
import type { Locale, SiteContent } from "@/lib/content/site-content";

export type NavigationItem = {
  /** The route, as the stable `nav_item` in analytics. */
  key: StaticRouteKey;
  href: string;
  label: string;
  active: boolean;
};

type SiteHeaderProps = {
  locale: Locale;
  content: SiteContent;
  currentPath: string;
};

export function buildNavigation(
  locale: Locale,
  content: SiteContent,
  currentPath: string,
): NavigationItem[] {
  const items: Array<{ key: StaticRouteKey; label: string }> = [
    { key: "services", label: content.nav.services },
    { key: "process", label: content.nav.process },
    { key: "projects", label: content.nav.projects },
    { key: "pricing", label: content.nav.pricing },
    { key: "blog", label: content.nav.blog },
    { key: "contact", label: content.nav.contact },
  ];

  return items.map((item) => {
    const href = getLocalizedPath(locale, item.key);
    return {
      ...item,
      href,
      active: currentPath === href || currentPath.startsWith(`${href}/`),
    };
  });
}

export default function SiteHeader({
  locale,
  content,
  currentPath,
}: SiteHeaderProps) {
  const alternateLocale: Locale = locale === "nl" ? "en" : "nl";
  const counterpartPath = getCounterpartPath(currentPath, locale, alternateLocale);
  const navigation = buildNavigation(locale, content, currentPath);
  const homePath = getLocalizedPath(locale, "home");
  const contactPath = getLocalizedPath(locale, "contact");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="container-x flex h-16 items-center justify-between gap-6 lg:h-[4.5rem]">
        <BrandMark
          href={homePath}
          priority
          className="h-8 w-[112px] sm:h-9 sm:w-[124px]"
        />

        <nav
          aria-label={locale === "nl" ? "Hoofdnavigatie" : "Main navigation"}
          className="hidden items-center gap-7 lg:flex"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              data-track-event="navigation_click"
              data-track-nav-item={item.key}
              data-track-placement="header"
              className={`text-[0.95rem] transition-colors duration-200 hover:text-ink ${
                item.active
                  ? "text-ink underline decoration-accent decoration-1 underline-offset-[0.55em]"
                  : "text-body"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link
            href={counterpartPath}
            hrefLang={alternateLocale}
            lang={alternateLocale}
            aria-label={content.nav.switchLocaleLabel}
            data-track-event="language_switch"
            data-track-from-locale={locale}
            data-track-to-locale={alternateLocale}
            data-track-placement="header"
            className="label-mono text-muted transition-colors hover:text-ink"
          >
            {alternateLocale.toUpperCase()}
          </Link>
          <Link
            href={contactPath}
            data-track-event="cta_click"
            data-track-cta-id="header_contact"
            data-track-cta-target="contact"
            data-track-placement="header"
            className="inline-flex min-h-10 items-center rounded-sm bg-ink px-4 text-[0.9rem] font-medium text-paper transition-colors duration-200 hover:bg-accent"
          >
            {content.nav.cta}
          </Link>
        </div>

        <MobileNav
          navigation={navigation}
          homeHref={homePath}
          locale={locale}
          counterpartPath={counterpartPath}
          alternateLocaleLabel={
            alternateLocale === "en" ? "English" : "Nederlands"
          }
          contactHref={contactPath}
          contactLabel={content.nav.cta}
          menuLabel={content.nav.menuLabel}
          closeLabel={content.nav.closeLabel}
        />
      </div>
    </header>
  );
}
