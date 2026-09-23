import { clarityProjectId } from "@/lib/clarity/client";
import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import ConsentSettingsButton from "@/components/consent/consent-settings-button";
import { getCounterpartPath, getLocalizedPath, legalRoutes, type StaticRouteKey } from "@/lib/content/routes";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";

type SiteFooterProps = {
  locale: Locale;
  content: SiteContent;
  currentPath: string;
};

/**
 * Functional footer: navigation, contact details, company registration and
 * the language switch. No marketing copy.
 */
export default function SiteFooter({
  locale,
  content,
  currentPath,
}: SiteFooterProps) {
  const footer = content.footer;
  const alternateLocale: Locale = locale === "nl" ? "en" : "nl";
  const counterpartPath = getCounterpartPath(currentPath, locale, alternateLocale);
  const year = new Date().getFullYear();
  /* "Cookie-instellingen" exists whenever there is a choice to change: statistics, behaviour recordings, or both. */
  const analyticsConfigured = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) || Boolean(clarityProjectId());
  const legalLinkClass = "text-paper/70 transition-colors hover:text-paper";

  const navigation: Array<{ key: StaticRouteKey; href: string; label: string }> = (
    [
      ["services", content.nav.services],
      ["process", content.nav.process],
      ["projects", content.nav.projects],
      ["pricing", content.nav.pricing],
      ["projectPlanner", content.nav.planner],
      ["blog", content.nav.blog],
      ["contact", content.nav.contact],
    ] as const
  ).map(([key, label]) => ({ key, href: getLocalizedPath(locale, key), label }));

  return (
    <footer className="mt-24 bg-ink text-paper lg:mt-32">
      <div className="container-x pb-8 pt-12 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <BrandMark
              href={getLocalizedPath(locale, "home")}
              tone="light"
              className="h-9 w-[124px]"
            />
          </div>

          <nav
            aria-label={footer.navigation}
            className="lg:col-span-4"
          >
            <p className="label-mono text-paper/50">{footer.navigation}</p>
            <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2.5 text-[0.95rem]">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-track-event="navigation_click"
                    data-track-nav-item={item.key}
                    data-track-placement="footer"
                    className="text-paper/85 transition-colors hover:text-paper"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-3 lg:col-start-10">
            <p className="label-mono text-paper/50">{footer.contact}</p>
            <ul className="mt-4 space-y-2.5 text-[0.95rem]">
              <li>
                <a
                  href={`mailto:${businessInfo.email}`}
                  className="text-paper/85 transition-colors hover:text-paper"
                >
                  {businessInfo.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${businessInfo.phone}`}
                  className="tabular text-paper/85 transition-colors hover:text-paper"
                >
                  {businessInfo.phoneDisplay}
                </a>
              </li>
              <li className="tabular text-paper/55">
                {footer.kvkLabel} {businessInfo.kvk}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-paper/15 pt-5 text-[0.8rem] text-paper/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {businessInfo.legalName}. {footer.rights}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/*
              The terms are Dutch only, so both languages link to the same
              page; the privacy and cookie statements follow the locale. The
              settings button only exists when there is a choice to revisit,
              which is when the deployment has an analytics property.
            */}
            <nav aria-label={footer.legal}>
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <li>
                  <Link href={legalRoutes.terms} hrefLang="nl" className={legalLinkClass}>
                    {footer.terms}
                  </Link>
                </li>
                <li>
                  <Link href={getLocalizedPath(locale, "privacy")} className={legalLinkClass}>
                    {footer.privacy}
                  </Link>
                </li>
                <li>
                  <Link href={getLocalizedPath(locale, "cookies")} className={legalLinkClass}>
                    {footer.cookies}
                  </Link>
                </li>
                {analyticsConfigured ? (
                  <li>
                    <ConsentSettingsButton label={footer.cookieSettings} className={legalLinkClass} />
                  </li>
                ) : null}
              </ul>
            </nav>
            <Link
              href={counterpartPath}
              hrefLang={alternateLocale}
              lang={alternateLocale}
              data-track-event="language_switch"
              data-track-from-locale={locale}
              data-track-to-locale={alternateLocale}
              data-track-placement="footer"
              className="label-mono text-paper/55 transition-colors hover:text-paper"
            >
              {alternateLocale === "en" ? "English" : "Nederlands"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
