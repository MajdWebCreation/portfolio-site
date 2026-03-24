import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import MobileNav from "@/components/mobile-nav";
import PersistentCta from "@/components/persistent-cta";
import ThemeToggle from "@/components/theme-toggle";
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
      <div className="absolute inset-0 bg-[image:var(--shell-gradient)]" />
      <div className="ym-bg-arc absolute inset-[-4%] opacity-[0.34]" />
      <div className="ym-bg-field absolute inset-x-[-8%] top-[-2%] h-[26rem] opacity-[0.22]" />
      <div className="ym-bg-curve absolute inset-x-[-6%] bottom-[-6%] h-[18rem] opacity-[0.2]" />
      <div className="ym-grid absolute inset-0 opacity-[0.035]" />
      <div className="absolute -left-20 top-8 h-[16rem] w-[16rem] rounded-full bg-cyan-300/[0.04] blur-3xl" />
      <div className="absolute right-[-4%] top-[18%] h-[18rem] w-[18rem] rounded-full bg-blue-300/[0.045] blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[image:var(--shell-bottom-fade)]" />
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
    { href: getLocalizedPath(locale, "pricing"), label: content.nav.pricing },
    { href: getLocalizedPath(locale, "projects"), label: content.nav.projects },
    { href: getLocalizedPath(locale, "blog"), label: content.nav.blog },
    { href: getLocalizedPath(locale, "contact"), label: content.nav.contact },
  ];

  const mobileCtaLabel = locale === "nl" ? "Start project" : "Start project";
  const persistentCtaHref =
    currentPath.includes("/pricing") ||
    currentPath.includes("/tarieven") ||
    currentPath.includes("/services") ||
    currentPath.includes("/diensten") ||
    currentPath.includes("/projects") ||
    currentPath.includes("/projecten")
      ? getLocalizedPath(locale, "projectPlanner")
      : getLocalizedPath(locale, "contact");

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--background)] text-[var(--foreground)]">
      <BlueprintBackground />

      <header className="relative z-30">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <div className="relative flex w-full items-center justify-between gap-3 rounded-[1.5rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/84 px-3 py-3 shadow-[0_18px_42px_rgba(36,60,84,0.08)] backdrop-blur-md sm:px-5 sm:py-3.5 lg:px-6">
            <div className="relative z-10 flex min-w-0 items-center gap-3 sm:gap-5">
              <BrandMark
                href={getLocalizedPath(locale, "home")}
                priority
                variant="white"
                className="h-[2.5rem] w-[138px] sm:h-[2.85rem] sm:w-[156px]"
              />
              <span className="hidden text-[10px] uppercase tracking-[0.32em] text-[color:var(--muted-foreground)] xl:block">
                Premium digital systems
              </span>
            </div>

            <div className="hidden items-center gap-7 text-sm text-[color:var(--muted-foreground)] md:flex">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition duration-300 hover:text-[var(--foreground)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="relative z-10 hidden items-center gap-3 md:flex">
              <div className="rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)]/85 p-1">
                <Link
                  href={locale === "en" ? currentPath : counterpartPath}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    locale === "en"
                      ? "bg-[var(--foreground)] text-[var(--background-elevated)]"
                      : "text-[color:var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  EN
                </Link>
                <Link
                  href={locale === "nl" ? currentPath : counterpartPath}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    locale === "nl"
                      ? "bg-[var(--foreground)] text-[var(--background-elevated)]"
                      : "text-[color:var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                className="rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-4 py-2.5 text-sm font-medium text-[var(--button-text)] transition duration-300 hover:opacity-92"
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
              contactLabel={mobileCtaLabel}
              navigation={navigation}
            />
          </div>
        </nav>
      </header>

      <main className="relative z-20">{children}</main>
      <ThemeToggle />
      <PersistentCta
        locale={locale}
        currentPath={currentPath}
        href={persistentCtaHref}
      />
    </div>
  );
}
