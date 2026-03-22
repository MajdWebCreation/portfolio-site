import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import MobileNav from "@/components/mobile-nav";
import {
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";
import { getCounterpartPath, getLocalizedPath } from "@/lib/content/routes";

type SiteShellProps = {
  locale: Locale;
  content: SiteContent;
  currentPath: string;
  children: React.ReactNode;
};

export function BlueprintBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_22%),linear-gradient(to_bottom,rgba(255,255,255,0.015),transparent_22%)]" />
      <div className="ym-grid absolute inset-0 opacity-[0.08]" />
      <div className="animate-ym-drift absolute -left-32 top-10 h-[420px] w-[420px] rounded-full border border-cyan-300/8 bg-cyan-400/4 blur-3xl" />
      <div className="animate-ym-float absolute right-[-8%] top-[22%] h-[480px] w-[480px] rounded-full border border-white/4" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(180deg,transparent,rgba(2,4,6,0.85)_70%,rgba(2,4,6,1))]" />
    </div>
  );
}

export default function SiteShell({
  locale,
  content,
  currentPath,
  children,
}: SiteShellProps) {
  const alternateLocale = locale === "en" ? "nl" : "en";
  const counterpartPath = getCounterpartPath(
    currentPath,
    locale,
    alternateLocale,
  );

  const navigation = [
    { href: getLocalizedPath(locale, "services"), label: content.nav.services },
    { href: getLocalizedPath(locale, "projects"), label: content.nav.projects },
    { href: getLocalizedPath(locale, "blog"), label: content.nav.blog },
    { href: `${getLocalizedPath(locale, "home")}#process`, label: content.nav.about },
    { href: getLocalizedPath(locale, "contact"), label: content.nav.contact },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <BlueprintBackground />

      <header className="relative z-30">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <div className="relative flex w-full items-center justify-between rounded-[1.5rem] border border-white/10 bg-[rgba(6,10,14,0.8)] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-5 lg:px-6">
            <div className="relative z-10 flex items-center gap-5">
              <BrandMark
                href={getLocalizedPath(locale, "home")}
                priority
                variant="white"
                className="h-11 w-[144px]"
              />
              <span className="hidden text-[10px] uppercase tracking-[0.32em] text-white/34 xl:block">
                Premium digital systems
              </span>
            </div>

            <div className="hidden items-center gap-7 text-sm text-white/72 md:flex">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition duration-300 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="relative z-10 hidden items-center gap-3 md:flex">
              <div className="rounded-full border border-white/10 bg-black/25 p-1">
                <Link
                  href={locale === "en" ? currentPath : counterpartPath}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    locale === "en"
                      ? "bg-white text-black"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  EN
                </Link>
                <Link
                  href={locale === "nl" ? currentPath : counterpartPath}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    locale === "nl"
                      ? "bg-white text-black"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  NL
                </Link>
              </div>
              <Link
                href={getLocalizedPath(locale, "contact")}
                data-track-event="contact_cta_click"
                data-track-category="navigation"
                data-track-label={content.nav.cta}
                data-track-location="desktop-header"
                className="rounded-full border border-white/14 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white transition duration-300 hover:border-cyan-300/30 hover:bg-white/[0.09]"
              >
                {content.nav.cta}
              </Link>
            </div>

            <MobileNav
              currentPath={currentPath}
              counterpartPath={counterpartPath}
              currentLocaleLabel={content.localeLabel}
              alternateLocaleLabel={alternateLocale.toUpperCase()}
              contactHref={getLocalizedPath(locale, "contact")}
              contactLabel={content.nav.cta}
              navigation={navigation}
            />
          </div>
        </nav>
      </header>

      <main className="relative z-20">{children}</main>
    </div>
  );
}
