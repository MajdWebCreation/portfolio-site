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
    <footer className="relative z-20 mt-16 overflow-hidden border-t border-white/14 bg-[linear-gradient(180deg,rgba(18,28,39,0.42),rgba(12,20,29,0.8))]">
      <div className="ym-bg-arc ym-bg-float-fade absolute inset-[-6%] opacity-[0.68]" />
      <div className="mx-auto max-w-7xl px-6 pb-14 pt-16 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr]">
          <div>
            <BrandMark
              href={getLocalizedPath(locale, "home")}
              variant="white"
              className="h-[6rem] w-[320px] sm:h-[6.5rem] sm:w-[344px]"
            />
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/72">
              {content.description}
            </p>
            <div className="mt-6 max-w-sm space-y-2 text-xs leading-6 text-white/58">
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
            <p className="text-sm font-medium text-white">{content.company}</p>
            <ul className="mt-5 space-y-3 text-sm text-white/72">
              <li>
                <Link href={getLocalizedPath(locale, "home")}>Home</Link>
              </li>
              <li>
                <Link href={getLocalizedPath(locale, "services")}>
                  {locale === "nl" ? "Diensten" : "Services"}
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
            <p className="text-sm font-medium text-white">{content.services}</p>
            <ul className="mt-5 space-y-3 text-sm text-white/72">
              {services.map((service) => (
                <li key={service.path}>
                  <Link href={service.path}>{service.navLabel}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-white">{content.contact}</p>
            <ul className="mt-5 space-y-3 text-sm text-white/72">
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
