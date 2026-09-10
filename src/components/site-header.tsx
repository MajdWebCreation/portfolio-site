import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import MobileNav from "@/components/mobile-nav";
import { getCounterpartPath, getLocalizedPath } from "@/lib/content/routes";
import type { Locale, SiteContent } from "@/lib/content/site-content";

export type NavigationItem = {
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
  const items = [
    { href: getLocalizedPath(locale, "services"), label: content.nav.services },
    { href: getLocalizedPath(locale, "process"), label: content.nav.process },
    { href: getLocalizedPath(locale, "projects"), label: content.nav.projects },
    { href: getLocalizedPath(locale, "pricing"), label: content.nav.pricing },
    { href: getLocalizedPath(locale, "blog"), label: content.nav.blog },
    { href: getLocalizedPath(locale, "contact"), label: content.nav.contact },
  ];

  return items.map((item) => ({
    ...item,
    active: currentPath === item.href || currentPath.startsWith(`${item.href}/`),
  }));
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
            className="label-mono text-muted transition-colors hover:text-ink"
          >
            {alternateLocale.toUpperCase()}
          </Link>
          <Link
            href={contactPath}
            data-track-event="contact_cta_click"
            data-track-category="navigation"
            data-track-label={content.nav.cta}
            data-track-location="desktop-header"
            className="inline-flex min-h-10 items-center rounded-sm bg-ink px-4 text-[0.9rem] font-medium text-paper transition-colors duration-200 hover:bg-accent"
          >
            {content.nav.cta}
          </Link>
        </div>

        <MobileNav
          navigation={navigation}
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
