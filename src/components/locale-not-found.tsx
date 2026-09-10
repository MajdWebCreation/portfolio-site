"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import { getLocalizedPath } from "@/lib/content/routes";
import type { Locale } from "@/lib/content/site-content";

const copy = {
  nl: {
    code: "404",
    title: "Deze pagina bestaat niet.",
    text: "De link is verouderd of het adres klopt niet. De pagina's hieronder bestaan wel.",
    links: [
      { route: "home", label: "Homepagina" },
      { route: "services", label: "Diensten" },
      { route: "projects", label: "Projecten" },
      { route: "contact", label: "Contact" },
    ],
  },
  en: {
    code: "404",
    title: "This page does not exist.",
    text: "The link is outdated or the address is wrong. The pages below do exist.",
    links: [
      { route: "home", label: "Homepage" },
      { route: "services", label: "Services" },
      { route: "projects", label: "Projects" },
      { route: "contact", label: "Contact" },
    ],
  },
} as const;

export default function LocaleNotFound() {
  const pathname = usePathname();
  const locale: Locale = pathname?.startsWith("/en") ? "en" : "nl";
  const content = copy[locale];

  return (
    <main className="container-x flex min-h-screen flex-col justify-between py-8">
      <BrandMark href={getLocalizedPath(locale, "home")} className="h-9 w-[124px]" />
      <div className="max-w-xl py-16">
        <p className="label-mono">{content.code}</p>
        <h1 className="display-lg mt-4">{content.title}</h1>
        <p className="lede mt-5">{content.text}</p>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
          {content.links.map((item) => (
            <li key={item.route}>
              <Link
                href={getLocalizedPath(locale, item.route)}
                className="link-line font-medium text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="label-mono">YM Creations</p>
    </main>
  );
}
