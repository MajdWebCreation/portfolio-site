import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import { getLocalizedPath } from "@/lib/content/routes";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";
import { getServicesForLocale } from "@/lib/content/services";

type SiteFooterProps = {
  locale: Locale;
  content: SiteContent["footer"];
};

export default function SiteFooter({ locale, content }: SiteFooterProps) {
  const services = getServicesForLocale(locale);
  const currentYear = new Date().getFullYear();

  return (
    <footer className="ym-footer-surface relative z-20 mt-16 overflow-hidden border-t border-[color:var(--line)]">
      <div className="ym-bg-arc pointer-events-none absolute inset-[-6%] opacity-[0.28]" />
      <div className="mx-auto max-w-7xl px-6 pb-14 pt-16 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr]">
          <div>
            <BrandMark
              href={getLocalizedPath(locale, "home")}
              variant="theme"
              assetSet="svg"
              className="h-[4.25rem] w-[220px] sm:h-[4.75rem] sm:w-[244px]"
            />
            <p className="mt-3 max-w-sm text-sm leading-7 text-[color:var(--muted-foreground)]">
              {content.description}
            </p>
            <div className="mt-5 max-w-sm space-y-2 text-xs leading-6 text-[color:var(--muted-foreground)]">
              <p>
                © {currentYear} {businessInfo.legalName}. {content.rights}
              </p>
              <p>
                {locale === "nl" ? "Website eigendom van" : "Website owned by"}{" "}
                {businessInfo.legalName}.
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{content.company}</p>
            <ul className="mt-5 space-y-3 text-sm text-[color:var(--muted-foreground)]">
              <li>
                <Link href={getLocalizedPath(locale, "home")}>Home</Link>
              </li>
              <li>
                <Link href={getLocalizedPath(locale, "services")}>
                  {locale === "nl" ? "Diensten" : "Services"}
                </Link>
              </li>
              <li>
                <Link href={getLocalizedPath(locale, "pricing")}>
                  {content.pricing}
                </Link>
              </li>
              <li>
                <Link href={getLocalizedPath(locale, "projects")}>
                  {locale === "nl" ? "Projecten" : "Projects"}
                </Link>
              </li>
              <li>
                <Link href={getLocalizedPath(locale, "blog")}>
                  {content.insights}
                </Link>
              </li>
              <li>
                <Link href={getLocalizedPath(locale, "contact")}>
                  {locale === "nl" ? "Contact" : "Contact"}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{content.services}</p>
            <ul className="mt-5 space-y-3 text-sm text-[color:var(--muted-foreground)]">
              {services.map((service) => (
                <li key={service.path}>
                  <Link href={service.path}>{service.navLabel}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{content.contact}</p>
            <ul className="mt-5 space-y-3 text-sm text-[color:var(--muted-foreground)]">
              <li>{businessInfo.email}</li>
              <li>{businessInfo.phone}</li>
              <li>ymcreations.com</li>
              <li>{content.kvkLabel}: {businessInfo.kvk}</li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
