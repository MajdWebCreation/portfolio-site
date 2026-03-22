import Link from "next/link";
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

  return (
    <footer className="relative z-20 border-t border-white/10">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr] lg:px-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.9)]" />
            <span className="text-sm font-medium uppercase tracking-[0.25em] text-white/90">
              {businessInfo.name}
            </span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
            {content.description}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-white">{content.company}</p>
          <ul className="mt-5 space-y-3 text-sm text-white/60">
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
          <ul className="mt-5 space-y-3 text-sm text-white/60">
            {services.map((service) => (
              <li key={service.path}>
                <Link href={service.path}>{service.navLabel}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium text-white">{content.contact}</p>
          <ul className="mt-5 space-y-3 text-sm text-white/60">
            <li>{businessInfo.email}</li>
            <li>{businessInfo.phone}</li>
            <li>ymcreations.com</li>
            <li>{content.kvkLabel}: {businessInfo.kvk}</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
