import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import { getCounterpartPath, getLocalizedPath, legalRoutes } from "@/lib/content/routes";
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

  const navigation = [
    { href: getLocalizedPath(locale, "services"), label: content.nav.services },
    { href: getLocalizedPath(locale, "process"), label: content.nav.process },
    { href: getLocalizedPath(locale, "projects"), label: content.nav.projects },
    { href: getLocalizedPath(locale, "pricing"), label: content.nav.pricing },
    { href: getLocalizedPath(locale, "projectPlanner"), label: content.nav.planner },
    { href: getLocalizedPath(locale, "blog"), label: content.nav.blog },
    { href: getLocalizedPath(locale, "contact"), label: content.nav.contact },
  ];

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
            {/* Legal documents are Dutch only; the English site links to the same page. */}
            <nav aria-label={footer.legal}>
              <Link
                href={legalRoutes.terms}
                hrefLang="nl"
                className="text-paper/70 transition-colors hover:text-paper"
              >
                {footer.terms}
              </Link>
            </nav>
            <Link
              href={counterpartPath}
              hrefLang={alternateLocale}
              lang={alternateLocale}
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
