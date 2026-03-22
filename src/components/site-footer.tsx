import Link from "next/link";
import Image from "next/image";
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

  return (
    <footer className="relative z-20 mt-16 overflow-hidden border-t border-white/10">
      <div className="absolute inset-0">
        <Image
          src="/images/visuals/ambient-texture-light-arc.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-12"
        />
      </div>
      <div className="mx-auto max-w-7xl px-6 pb-14 pt-16 lg:px-10">
        <div className="relative mb-14 overflow-hidden rounded-[2.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))] px-6 py-10 sm:px-8 lg:px-10">
          <div className="absolute right-[-4%] top-[-12%] h-56 w-56 opacity-[0.06]">
            <BrandMark className="h-full w-full" />
          </div>
          <div className="grid gap-10 lg:grid-cols-[1.18fr_0.82fr] lg:items-end">
            <div>
              <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/72">
                {locale === "nl" ? "Closing frame" : "Closing frame"}
              </p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
                {locale === "nl"
                  ? "Heldere systemen, verfijnde interfaces en een digitale presence die bewust aanvoelt."
                  : "Clear systems, refined interfaces, and a digital presence that feels deliberate."}
              </h2>
            </div>
            <div className="text-sm leading-7 text-white/62">
              {content.description}
            </div>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr]">
          <div>
            <BrandMark
              href={getLocalizedPath(locale, "home")}
              className="h-11 w-[132px]"
            />
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
            {content.description}
          </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/42">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(113,227,255,0.7)]" />
              {businessInfo.name}
            </div>
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
      </div>
    </footer>
  );
}
